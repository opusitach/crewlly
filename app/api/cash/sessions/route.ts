import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getCashAuthContext } from "@/lib/cash/access"
import { syncCashSessionFromWorkdayProcedures } from "@/lib/cash/session-sync"
import { listWorkdayCashFieldPhotos } from "@/lib/cash/session-field-photos"
import { syncWorkdayRevenueFromCashSessions } from "@/lib/cash/revenue-allocation"
import { syncWorkdayTipsFromCashSessions } from "@/lib/cash/tips-sync"
import { notifyOrganizationOwners, toEventActorName, toEventDateLabel } from "@/lib/notifications/owner-events"
import {
  buildSessionFieldSnapshots,
  computeCashSessionSnapshotTotals,
  isCashInputStage,
  parseCashFieldValuesPayload,
  sortCashFields,
  type CashFieldConfig,
} from "@/lib/cash/module"

const querySchema = z.object({
  workdayId: z.string().uuid().optional(),
  cashRegisterId: z.string().uuid().optional(),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

const openPayloadSchema = z.object({
  workdayId: z.string().uuid(),
  cashRegisterId: z.string().uuid(),
  values: z.record(z.union([z.number(), z.string()])).default({}),
  notes: z.string().trim().max(500).optional().nullable(),
})

export async function GET(request: Request) {
  const auth = await getCashAuthContext({ requireManage: true })
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const url = new URL(request.url)
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const whereClause: Prisma.CashSessionWhereInput = {
    cashRegister: {
      location: {
        organizationId: auth.organizationId,
      },
    },
  }

  if (parsed.data.workdayId) {
    whereClause.workdayId = parsed.data.workdayId
  }

  if (parsed.data.cashRegisterId) {
    whereClause.cashRegisterId = parsed.data.cashRegisterId
  }

  if (parsed.data.workDate) {
    whereClause.workday = {
      workDate: new Date(parsed.data.workDate),
    }
  }

  const hydrateLocationId = parsed.data.cashRegisterId
    ? (
        await prisma.cashRegister.findFirst({
          where: {
            id: parsed.data.cashRegisterId,
            location: {
              organizationId: auth.organizationId,
            },
          },
          select: { locationId: true },
        })
      )?.locationId ?? null
    : null

  const candidateWorkdays = await prisma.workday.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(parsed.data.workdayId ? { id: parsed.data.workdayId } : {}),
      ...(parsed.data.workDate ? { workDate: new Date(parsed.data.workDate) } : {}),
      ...(hydrateLocationId ? { locationId: hydrateLocationId } : {}),
      workIntervals: {
        some: {
          status: { not: "canceled" },
          procedureAnswers: {
            some: {
              type: "CASH",
              inputValue: { not: null },
            },
          },
        },
      },
      cashSessions: parsed.data.cashRegisterId
        ? {
            none: {
              cashRegisterId: parsed.data.cashRegisterId,
            },
          }
        : {
            none: {},
          },
    },
    select: {
      id: true,
      locationId: true,
    },
    orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
    take: parsed.data.workdayId ? 1 : 30,
  })

  if (candidateWorkdays.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const workday of candidateWorkdays) {
        const syncResult = await syncCashSessionFromWorkdayProcedures(tx, {
          workdayId: workday.id,
          locationId: workday.locationId,
          cashRegisterId: parsed.data.cashRegisterId,
        })
        if (syncResult.ok && !syncResult.skipped) {
          await syncWorkdayRevenueFromCashSessions(tx, workday.id)
          await syncWorkdayTipsFromCashSessions(tx, {
            workdayId: workday.id,
            locationId: workday.locationId,
          })
        }
      }
    })
  }

  const sessions = await prisma.cashSession.findMany({
    where: whereClause,
    include: {
      cashRegister: {
        select: {
          id: true,
          name: true,
          locationId: true,
        },
      },
      workday: {
        select: {
          id: true,
          workDate: true,
          status: true,
        },
      },
      closedByEmployee: {
        select: {
          id: true,
          user: {
            select: {
              fullName: true,
            },
          },
        },
      },
      fieldValues: {
        orderBy: [{ inputStage: "asc" }, { fieldKeySnapshot: "asc" }],
      },
      receiptUploads: {
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: [{ workday: { workDate: "desc" } }, { createdAt: "desc" }],
  })

  const allowedFieldKeysByWorkday: Record<string, Set<string>> = {}
  for (const session of sessions) {
    const knownKeys = allowedFieldKeysByWorkday[session.workdayId] ?? new Set<string>()
    for (const value of session.fieldValues) {
      knownKeys.add(value.fieldKeySnapshot)
    }
    allowedFieldKeysByWorkday[session.workdayId] = knownKeys
  }

  const photosByWorkday = await listWorkdayCashFieldPhotos(prisma, {
    workdayIds: sessions.map((session) => session.workdayId),
    allowedFieldKeysByWorkday,
  })

  const data = sessions.map((session) => ({
    ...session,
    closedByEmployee: session.closedByEmployee
      ? {
          id: session.closedByEmployee.id,
          fullName: session.closedByEmployee.user.fullName,
        }
      : null,
    cashFieldPhotos: photosByWorkday[session.workdayId] ?? [],
  }))

  return NextResponse.json({ data })
}

export async function POST(request: Request) {
  const auth = await getCashAuthContext({ requireManage: true })
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const json = await request.json().catch(() => null)
  const parsed = openPayloadSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const payload = parsed.data
  const valuesParse = parseCashFieldValuesPayload(payload.values)
  if (!valuesParse.ok) {
    return NextResponse.json({ error: valuesParse.error }, { status: 400 })
  }

  const cashRegister = await prisma.cashRegister.findFirst({
    where: {
      id: payload.cashRegisterId,
      location: {
        organizationId: auth.organizationId,
      },
      isActive: true,
    },
    select: {
      id: true,
      locationId: true,
      name: true,
    },
  })

  if (!cashRegister) {
    return NextResponse.json({ error: "Касса не найдена" }, { status: 404 })
  }

  const workday = await prisma.workday.findFirst({
    where: {
      id: payload.workdayId,
      organizationId: auth.organizationId,
      locationId: cashRegister.locationId,
    },
    select: {
      id: true,
      status: true,
      workDate: true,
    },
  })

  if (!workday) {
    return NextResponse.json({ error: "Рабочий день не найден" }, { status: 404 })
  }

  if (workday.status !== "draft") {
    return NextResponse.json(
      {
        error: "Кассу можно открыть только в draft-дне. После публикации изменения блокируются.",
      },
      { status: 409 },
    )
  }

  const fieldRows = await prisma.cashRegisterField.findMany({
    where: {
      locationId: cashRegister.locationId,
      isActive: true,
    },
    orderBy: [{ inputStage: "asc" }, { displayOrder: "asc" }, { key: "asc" }],
  })

  if (fieldRows.length === 0) {
    return NextResponse.json(
      {
        error: "Сначала добавьте поля кассы в Настройки -> Касса",
      },
      { status: 409 },
    )
  }

  const fields: CashFieldConfig[] = []
  for (const row of fieldRows) {
    if (!isCashInputStage(row.inputStage)) {
      return NextResponse.json(
        {
          error: `Некорректный input_stage в поле ${row.key}`,
        },
        { status: 500 },
      )
    }

    fields.push({
      id: row.id,
      key: row.key,
      label: row.label,
      inputStage: row.inputStage,
      isRequired: row.isRequired,
      isRevenueBasis: row.isRevenueBasis,
      displayOrder: row.displayOrder,
    })
  }

  const openFields = fields.filter((field) => field.inputStage === "open")
  const openFieldKeys = new Set(openFields.map((field) => field.key))

  for (const key of Object.keys(valuesParse.values)) {
    if (!openFieldKeys.has(key)) {
      return NextResponse.json(
        {
          error: `Поле ${key} не относится к открытию кассы`,
        },
        { status: 400 },
      )
    }
  }

  const missingRequiredOpenFields = openFields
    .filter((field) => field.isRequired)
    .filter((field) => !Object.prototype.hasOwnProperty.call(valuesParse.values, field.key))
    .map((field) => field.key)

  if (missingRequiredOpenFields.length > 0) {
    return NextResponse.json(
      {
        error: `Не заполнены обязательные поля открытия: ${missingRequiredOpenFields.join(", ")}`,
      },
      { status: 400 },
    )
  }

  const snapshotValues = buildSessionFieldSnapshots({
    fields: sortCashFields(fields),
    values: valuesParse.values,
  })

  if (!snapshotValues.ok) {
    return NextResponse.json({ error: snapshotValues.error }, { status: 400 })
  }

  const totals = computeCashSessionSnapshotTotals({
    allFields: fields,
    fieldValues: snapshotValues.snapshots,
  })

  if (!totals.ok) {
    return NextResponse.json({ error: totals.error }, { status: 400 })
  }

  const actor = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { fullName: true, email: true },
  })
  const actorName = toEventActorName(actor ?? {}, "Сотрудник")
  const workDateLabel = toEventDateLabel(workday.workDate)
  const notificationMessage = workDateLabel
    ? `${actorName} открыл(а) кассовую смену «${cashRegister.name}» (${workDateLabel}).`
    : `${actorName} открыл(а) кассовую смену «${cashRegister.name}».`

  try {
    const created = await prisma.$transaction(async (tx) => {
      const cashSession = await tx.cashSession.create({
        data: {
          cashRegisterId: cashRegister.id,
          workdayId: workday.id,
          openedByEmployeeId: auth.employeeId,
          openedAt: new Date(),
          openingCashCents: totals.openingCashCents,
          closingCashCents: totals.closingCashCents,
          expectedCashCents: 0,
          diffCashCents: 0,
          formulaExpressionSnapshot: null,
          formulaResultLabelSnapshot: null,
          status: "open",
          notes: payload.notes ?? null,
        },
      })

      await tx.cashSessionFieldValue.createMany({
        data: snapshotValues.snapshots.map((snapshot) => ({
          cashSessionId: cashSession.id,
          cashRegisterFieldId: snapshot.cashRegisterFieldId || null,
          fieldKeySnapshot: snapshot.fieldKeySnapshot,
          fieldLabelSnapshot: snapshot.fieldLabelSnapshot,
          inputStage: snapshot.inputStage,
          isRequiredSnapshot: snapshot.isRequiredSnapshot,
          valueCents: snapshot.valueCents,
          isRevenueBasisSnapshot: snapshot.isRevenueBasisSnapshot,
          source: snapshot.source ?? "manual",
        })),
      })

      await tx.cashSessionAuditLog.create({
        data: {
          cashSessionId: cashSession.id,
          actorUserId: auth.userId,
          action: "session_opened",
          payload: {
            inputStage: "open",
            values: valuesParse.values,
          },
        },
      })

      await notifyOrganizationOwners(tx, {
        organizationId: auth.organizationId,
        type: "cash",
        title: "Открыта кассовая смена",
        message: notificationMessage,
        excludeUserId: auth.userId,
      })

      return tx.cashSession.findUnique({
        where: { id: cashSession.id },
        include: {
          fieldValues: {
            orderBy: [{ inputStage: "asc" }, { fieldKeySnapshot: "asc" }],
          },
        },
      })
    })

    return NextResponse.json({ data: created }, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        {
          error: "Для этой кассы уже открыта/создана сессия на выбранный рабочий день",
        },
        { status: 409 },
      )
    }

    console.error("[api/cash/sessions][POST]", error)
    return NextResponse.json(
      {
        error: "Не удалось открыть кассу",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
