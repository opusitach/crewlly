import { Prisma } from "@prisma/client"
import { listCashRegisterFields } from "@/lib/cash/fields-query"
import {
  computeCashSessionSnapshotTotals,
  isCashInputStage,
  sortCashFields,
  type CashFieldConfig,
  type CashSessionFieldSnapshot,
} from "@/lib/cash/module"
import { decodeCashProcedureValues } from "@/lib/cash/procedure-values"
import { findWorkdayCashSourceAnswers } from "@/lib/cash/workday-cash-source"

type SyncResult =
  | { ok: true; sessionId: string; status: string; created: boolean; skipped: false }
  | { ok: true; skipped: true; reason: "no_cash_register" | "no_fields" | "no_cash_answers" | "reviewed_locked" }

type IntervalSource = {
  id: string
  employeeId: string
  status: string
  openedAt: Date | null
  closedAt: Date | null
}

const parseWholeInteger = (token: string | undefined) => {
  if (!token || !token.trim()) return null
  const parsed = Number(token)
  if (!Number.isSafeInteger(parsed)) return null
  return parsed
}

const toFieldConfig = (row: {
  id: string
  key: string
  label: string
  inputStage: string
  isRequired: boolean
  isRevenueBasis: boolean
  displayOrder: number
}): CashFieldConfig | null => {
  if (!isCashInputStage(row.inputStage)) {
    return null
  }
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    inputStage: row.inputStage,
    isRequired: row.isRequired,
    isRevenueBasis: row.isRevenueBasis,
    displayOrder: row.displayOrder,
  }
}

function buildSnapshotsFromProcedureAnswers(input: {
  fields: CashFieldConfig[]
  openPackedValue: string
  closePackedValue: string
}) {
  const openFieldKeys = input.fields.filter((field) => field.inputStage === "open").map((field) => field.key)
  const closeFieldKeys = input.fields.filter((field) => field.inputStage === "close").map((field) => field.key)

  const openDecoded = decodeCashProcedureValues(input.openPackedValue, openFieldKeys)
  const closeDecoded = decodeCashProcedureValues(input.closePackedValue, closeFieldKeys)

  const snapshots: CashSessionFieldSnapshot[] = []
  for (const field of sortCashFields(input.fields)) {
    const token = field.inputStage === "open" ? openDecoded[field.key] : closeDecoded[field.key]
    const parsedValue = parseWholeInteger(token)
    snapshots.push({
      cashRegisterFieldId: field.id ?? null,
      fieldKeySnapshot: field.key,
      fieldLabelSnapshot: field.label,
      inputStage: field.inputStage,
      isRequiredSnapshot: field.isRequired,
      valueCents: Number.isSafeInteger(parsedValue) ? Number(parsedValue) : 0,
      isRevenueBasisSnapshot: field.isRevenueBasis,
      source: "procedure",
    })
  }

  return snapshots
}

function resolveSourceMeta(input: {
  source: {
    workIntervalId: string
    createdAt: Date
    updatedAt: Date
  } | null
  intervalById: Map<string, IntervalSource>
  stage: "OPEN" | "CLOSE"
  frozenStatus: string | null
  existing: {
    openedByEmployeeId: string | null
    openedAt: Date | null
    closedByEmployeeId: string | null
    closedAt: Date | null
  } | null
}) {
  if (!input.source) {
    if (input.stage === "OPEN") {
      return {
        employeeId: input.existing?.openedByEmployeeId ?? null,
        at: input.existing?.openedAt ?? null,
        closeIsCompleted: false,
      }
    }
    return {
      employeeId: input.existing?.closedByEmployeeId ?? null,
      at: input.existing?.closedAt ?? null,
      closeIsCompleted: false,
    }
  }

  const interval = input.intervalById.get(input.source.workIntervalId)
  if (input.stage === "OPEN") {
    return {
      employeeId: interval?.employeeId ?? input.existing?.openedByEmployeeId ?? null,
      at: interval?.openedAt ?? input.source.createdAt,
      closeIsCompleted: false,
    }
  }

  const closeIsCompleted = interval?.status === "completed" || input.frozenStatus === "published"
  return {
    employeeId: closeIsCompleted ? interval?.employeeId ?? input.existing?.closedByEmployeeId ?? null : null,
    at: closeIsCompleted ? interval?.closedAt ?? input.source.updatedAt : null,
    closeIsCompleted,
  }
}

export async function syncCashSessionFromWorkdayProcedures(
  tx: Prisma.TransactionClient,
  input: { workdayId: string; locationId: string; cashRegisterId?: string },
): Promise<SyncResult> {
  const cashRegister = await tx.cashRegister.findFirst({
    where: {
      ...(input.cashRegisterId ? { id: input.cashRegisterId } : {}),
      locationId: input.locationId,
      isActive: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  })

  if (!cashRegister) {
    return { ok: true, skipped: true, reason: "no_cash_register" }
  }

  const [fieldRows, sourceByWhen, workday] = await Promise.all([
    listCashRegisterFields(tx, {
      locationId: input.locationId,
      isActive: true,
    }),
    findWorkdayCashSourceAnswers(tx, {
      workdayId: input.workdayId,
      selection: { mode: "non_empty" },
    }),
    tx.workday.findUnique({
      where: { id: input.workdayId },
      select: { status: true },
    }),
  ])

  const fields = fieldRows
    .map((row) =>
      toFieldConfig({
        id: row.id,
        key: row.key,
        label: row.label,
        inputStage: row.inputStage,
        isRequired: row.isRequired,
        isRevenueBasis: row.isRevenueBasis,
        displayOrder: row.displayOrder,
      }),
    )
    .filter((field): field is CashFieldConfig => field !== null)

  if (fields.length === 0) {
    return { ok: true, skipped: true, reason: "no_fields" }
  }

  const openSource = sourceByWhen.OPEN
  const closeSource = sourceByWhen.CLOSE
  if (!openSource && !closeSource) {
    return { ok: true, skipped: true, reason: "no_cash_answers" }
  }

  const snapshots = buildSnapshotsFromProcedureAnswers({
    fields,
    openPackedValue: openSource?.inputValue ?? "",
    closePackedValue: closeSource?.inputValue ?? "",
  })

  const totals = computeCashSessionSnapshotTotals({
    allFields: fields,
    fieldValues: snapshots,
  })

  if (!totals.ok) {
    throw new Error(totals.error)
  }

  const sourceIntervalIds = Array.from(
    new Set([openSource?.workIntervalId, closeSource?.workIntervalId].filter((value): value is string => Boolean(value))),
  )
  const sourceIntervals = sourceIntervalIds.length
    ? await tx.workInterval.findMany({
        where: {
          id: { in: sourceIntervalIds },
        },
        select: {
          id: true,
          employeeId: true,
          status: true,
          openedAt: true,
          closedAt: true,
        },
      })
    : []

  const intervalById = new Map<string, IntervalSource>(sourceIntervals.map((interval) => [interval.id, interval]))

  const existingSession = await tx.cashSession.findUnique({
    where: {
      cashRegisterId_workdayId: {
        cashRegisterId: cashRegister.id,
        workdayId: input.workdayId,
      },
    },
    select: {
      id: true,
      status: true,
      openedByEmployeeId: true,
      openedAt: true,
      closedByEmployeeId: true,
      closedAt: true,
    },
  })

  if (existingSession?.status === "reviewed") {
    return { ok: true, skipped: true, reason: "reviewed_locked" }
  }

  const openMeta = resolveSourceMeta({
    source: openSource,
    intervalById,
    stage: "OPEN",
    frozenStatus: workday?.status ?? null,
    existing: existingSession,
  })
  const closeMeta = resolveSourceMeta({
    source: closeSource,
    intervalById,
    stage: "CLOSE",
    frozenStatus: workday?.status ?? null,
    existing: existingSession,
  })

  const derivedStatus = closeMeta.closeIsCompleted ? "closed" : closeSource ? "closing_draft" : "open"
  const nextStatus = existingSession?.status === "closed" && derivedStatus !== "closed" ? "closed" : derivedStatus
  const nextClosedBy = nextStatus === "closed" ? closeMeta.employeeId : null
  const nextClosedAt = nextStatus === "closed" ? closeMeta.at : null

  const sessionData = {
    openingCashCents: totals.openingCashCents,
    closingCashCents: totals.closingCashCents,
    expectedCashCents: 0,
    diffCashCents: 0,
    status: nextStatus,
    openedByEmployeeId: openMeta.employeeId,
    openedAt: openMeta.at,
    closedByEmployeeId: nextClosedBy,
    closedAt: nextClosedAt,
  }

  const sessionId = existingSession
    ? (
        await tx.cashSession.update({
          where: { id: existingSession.id },
          data: sessionData,
          select: { id: true },
        })
      ).id
    : (
        await tx.cashSession.create({
          data: {
            cashRegisterId: cashRegister.id,
            workdayId: input.workdayId,
            notes: null,
            formulaExpressionSnapshot: null,
            formulaResultLabelSnapshot: null,
            ...sessionData,
          },
          select: { id: true },
        })
      ).id

  await tx.cashSessionFieldValue.deleteMany({
    where: { cashSessionId: sessionId },
  })

  if (snapshots.length > 0) {
    await tx.cashSessionFieldValue.createMany({
      data: snapshots.map((snapshot) => ({
        cashSessionId: sessionId,
        cashRegisterFieldId: snapshot.cashRegisterFieldId || null,
        fieldKeySnapshot: snapshot.fieldKeySnapshot,
        fieldLabelSnapshot: snapshot.fieldLabelSnapshot,
        inputStage: snapshot.inputStage,
        isRequiredSnapshot: snapshot.isRequiredSnapshot,
        valueCents: snapshot.valueCents,
        isRevenueBasisSnapshot: snapshot.isRevenueBasisSnapshot,
        source: snapshot.source ?? "procedure",
      })),
    })
  }

  return {
    ok: true,
    sessionId,
    status: nextStatus,
    created: !existingSession,
    skipped: false,
  }
}
