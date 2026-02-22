import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getCashAuthContext, resolveOrganizationLocationId } from "@/lib/cash/access"
import { syncCashSessionFromWorkdayProcedures } from "@/lib/cash/session-sync"
import { syncWorkdayRevenueFromCashSessions } from "@/lib/cash/revenue-allocation"
import { syncWorkdayTipsFromCashSessions } from "@/lib/cash/tips-sync"
import {
  evaluateCashFormulaExpression,
  extractCashFormulaKeys,
  validateAndCompileCashFormulaSet,
} from "@/lib/cash/formula"

const querySchema = z.object({
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  locationId: z.string().uuid().optional(),
})

type CashInputStage = "open" | "close"

type CashFieldSummaryItem = {
  fieldKey: string
  fieldLabel: string
  inputStage: CashInputStage
  totalValueCents: number
  entriesCount: number
  isRevenueBasis: boolean
}

type FormulaSummaryItem = {
  resultKey: string
  resultLabel: string
  totalValueCents: number
  entriesCount: number
  isTipsSource: boolean
  isRevenueSource: boolean
  displayOrder: number
}

type FormulaSessionResult = {
  resultKey: string
  resultLabel: string
  valueCents: number
  isTipsSource: boolean
  isRevenueSource: boolean
  displayOrder: number
}

type LocationFormulaRow = {
  resultKey: string
  resultLabel: string
  expression: string
  isTipsSource: boolean
  isRevenueSource: boolean
  displayOrder: number
}

type ActiveCashFieldRow = {
  locationId: string
  key: string
  label: string
  inputStage: string
  isRevenueBasis: boolean
}

const isCashInputStage = (value: string): value is CashInputStage => value === "open" || value === "close"

const buildDateFilter = (fromDate: Date | null, toDate: Date | null) => {
  if (!fromDate && !toDate) return undefined
  return {
    workDate: {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {}),
    },
  }
}

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

  const { dateFrom, dateTo, locationId: requestedLocationId } = parsed.data
  const fromDate = dateFrom ? new Date(dateFrom) : null
  const toDate = dateTo ? new Date(dateTo) : null

  if (fromDate && toDate && toDate < fromDate) {
    return NextResponse.json({ error: "dateTo must be >= dateFrom" }, { status: 400 })
  }

  let scopedLocationId: string | null = null
  if (requestedLocationId) {
    const locationResult = await resolveOrganizationLocationId(auth.organizationId, requestedLocationId)
    if (!locationResult.ok) {
      return NextResponse.json({ error: locationResult.error }, { status: locationResult.status })
    }
    scopedLocationId = locationResult.locationId
  }

  const workDateFilter = buildDateFilter(fromDate, toDate)

  const candidateWorkdays = await prisma.workday.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(scopedLocationId ? { locationId: scopedLocationId } : {}),
      ...(workDateFilter ?? {}),
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
      cashSessions: {
        none: {},
      },
    },
    select: {
      id: true,
      locationId: true,
    },
    orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
    take: 200,
  })

  if (candidateWorkdays.length > 0) {
    try {
      await prisma.$transaction(async (tx) => {
        for (const workday of candidateWorkdays) {
          const syncResult = await syncCashSessionFromWorkdayProcedures(tx, {
            workdayId: workday.id,
            locationId: workday.locationId,
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
    } catch (error) {
      // Do not block report loading when background sync fails.
      console.error("[api/reports/cash-summary][sync]", error)
    }
  }

  const sessions = await prisma.cashSession.findMany({
    where: {
      cashRegister: {
        ...(scopedLocationId ? { locationId: scopedLocationId } : {}),
        location: {
          organizationId: auth.organizationId,
        },
      },
      ...(workDateFilter
        ? {
            workday: {
              ...workDateFilter,
            },
          }
        : {}),
    },
    select: {
      id: true,
      workdayId: true,
      cashRegister: {
        select: {
          locationId: true,
        },
      },
      fieldValues: {
        select: {
          fieldKeySnapshot: true,
          fieldLabelSnapshot: true,
          inputStage: true,
          valueCents: true,
          isRevenueBasisSnapshot: true,
        },
        orderBy: [{ inputStage: "asc" }, { fieldKeySnapshot: "asc" }],
      },
    },
    orderBy: [{ workday: { workDate: "desc" } }, { createdAt: "desc" }],
  })

  const organization = await prisma.organization.findUnique({
    where: { id: auth.organizationId },
    select: { currency: true },
  })

  const cashFieldSummaryMap = new Map<string, CashFieldSummaryItem>()
  const fieldKeysByLocation = new Map<string, Set<string>>()

  for (const session of sessions) {
    const locationId = session.cashRegister.locationId
    const locationFieldKeys = fieldKeysByLocation.get(locationId) ?? new Set<string>()

    for (const fieldValue of session.fieldValues) {
      locationFieldKeys.add(fieldValue.fieldKeySnapshot)

      if (!isCashInputStage(fieldValue.inputStage)) continue

      const mapKey = `${fieldValue.inputStage}:${fieldValue.fieldKeySnapshot}`
      const existing = cashFieldSummaryMap.get(mapKey)

      if (!existing) {
        cashFieldSummaryMap.set(mapKey, {
          fieldKey: fieldValue.fieldKeySnapshot,
          fieldLabel: fieldValue.fieldLabelSnapshot,
          inputStage: fieldValue.inputStage,
          totalValueCents: fieldValue.valueCents,
          entriesCount: 1,
          isRevenueBasis: fieldValue.isRevenueBasisSnapshot,
        })
        continue
      }

      existing.totalValueCents += fieldValue.valueCents
      existing.entriesCount += 1
      existing.isRevenueBasis = existing.isRevenueBasis || fieldValue.isRevenueBasisSnapshot
    }

    fieldKeysByLocation.set(locationId, locationFieldKeys)
  }

  let cashFields = Array.from(cashFieldSummaryMap.values()).sort((a, b) => {
    if (a.inputStage !== b.inputStage) {
      return a.inputStage === "open" ? -1 : 1
    }
    return a.fieldLabel.localeCompare(b.fieldLabel, "ru")
  })

  const locationIds = Array.from(new Set(sessions.map((session) => session.cashRegister.locationId)))

  const [locationRows, formulaRows, activeFieldRows] = await Promise.all([
    locationIds.length > 0
      ? prisma.location.findMany({
          where: {
            id: { in: locationIds },
          },
          select: {
            id: true,
            name: true,
          },
        })
      : Promise.resolve([]),
    locationIds.length > 0
      ? prisma.cashRegisterFormula.findMany({
          where: {
            locationId: { in: locationIds },
          },
          select: {
            locationId: true,
            resultKey: true,
            resultLabel: true,
            expression: true,
            isTipsSource: true,
            isRevenueSource: true,
            displayOrder: true,
            createdAt: true,
          },
          orderBy: [{ locationId: "asc" }, { displayOrder: "asc" }, { createdAt: "asc" }],
        })
      : Promise.resolve([]),
    locationIds.length > 0
      ? prisma.cashRegisterField.findMany({
          where: {
            locationId: { in: locationIds },
            isActive: true,
          },
          select: {
            locationId: true,
            key: true,
            label: true,
            inputStage: true,
            isRevenueBasis: true,
          },
        })
      : Promise.resolve([] as ActiveCashFieldRow[]),
  ])

  const locationNameById = new Map(locationRows.map((location) => [location.id, location.name]))
  const formulasByLocation = new Map<string, LocationFormulaRow[]>()
  const activeFieldKeysByLocation = new Map<string, Set<string>>()

  for (const field of activeFieldRows) {
    const knownKeys = activeFieldKeysByLocation.get(field.locationId) ?? new Set<string>()
    knownKeys.add(field.key)
    activeFieldKeysByLocation.set(field.locationId, knownKeys)
  }

  // Ensure newly configured cash fields are visible in reports right away.
  for (const field of activeFieldRows) {
    if (!isCashInputStage(field.inputStage)) continue
    const mapKey = `${field.inputStage}:${field.key}`
    if (cashFieldSummaryMap.has(mapKey)) continue

    cashFieldSummaryMap.set(mapKey, {
      fieldKey: field.key,
      fieldLabel: field.label,
      inputStage: field.inputStage,
      totalValueCents: 0,
      entriesCount: 0,
      isRevenueBasis: field.isRevenueBasis,
    })
  }

  cashFields = Array.from(cashFieldSummaryMap.values()).sort((a, b) => {
    if (a.inputStage !== b.inputStage) {
      return a.inputStage === "open" ? -1 : 1
    }
    return a.fieldLabel.localeCompare(b.fieldLabel, "ru")
  })

  for (const formula of formulaRows) {
    const list = formulasByLocation.get(formula.locationId) ?? []
    list.push({
      resultKey: formula.resultKey,
      resultLabel: formula.resultLabel,
      expression: formula.expression,
      isTipsSource: formula.isTipsSource,
      isRevenueSource: Boolean(formula.isRevenueSource),
      displayOrder: formula.displayOrder,
    })
    formulasByLocation.set(formula.locationId, list)
  }

  const formulaWarnings: string[] = []
  const compiledFormulaByLocation = new Map<
    string,
    {
      orderedFormulas: Array<{ resultKey: string; resultLabel?: string; expression: string; displayOrder?: number }>
      compiledExpressionsByKey: Record<string, string>
      metaByKey: Map<string, LocationFormulaRow>
    }
  >()

  for (const [locationId, formulas] of formulasByLocation.entries()) {
    if (formulas.length === 0) continue

    const activeFieldKeys = activeFieldKeysByLocation.get(locationId) ?? new Set<string>()
    const observedFieldKeys = fieldKeysByLocation.get(locationId) ?? new Set<string>()
    const allowedFieldKeys = new Set<string>([...activeFieldKeys, ...observedFieldKeys])

    const validation = validateAndCompileCashFormulaSet(
      formulas.map((formula) => ({
        resultKey: formula.resultKey,
        resultLabel: formula.resultLabel,
        expression: formula.expression,
        displayOrder: formula.displayOrder,
      })),
      allowedFieldKeys,
    )

    if (!validation.ok) {
      const locationName = locationNameById.get(locationId) ?? locationId
      formulaWarnings.push(`Локация «${locationName}»: ${validation.error}`)
      continue
    }

    compiledFormulaByLocation.set(locationId, {
      orderedFormulas: validation.orderedFormulas,
      compiledExpressionsByKey: validation.compiledExpressionsByKey,
      metaByKey: new Map(formulas.map((formula) => [formula.resultKey, formula])),
    })
  }

  const formulaSummaryMap = new Map<string, FormulaSummaryItem>()

  // Ensure newly configured formulas are visible even before first calculated value.
  for (const formulas of formulasByLocation.values()) {
    for (const formula of formulas) {
      const mapKey = `${formula.resultKey}:${formula.resultLabel}`
      const existing = formulaSummaryMap.get(mapKey)
      if (!existing) {
        formulaSummaryMap.set(mapKey, {
          resultKey: formula.resultKey,
          resultLabel: formula.resultLabel,
          totalValueCents: 0,
          entriesCount: 0,
          isTipsSource: formula.isTipsSource,
          isRevenueSource: formula.isRevenueSource,
          displayOrder: formula.displayOrder,
        })
        continue
      }

      existing.isTipsSource = existing.isTipsSource || formula.isTipsSource
      existing.isRevenueSource = existing.isRevenueSource || formula.isRevenueSource
      if (formula.displayOrder < existing.displayOrder) {
        existing.displayOrder = formula.displayOrder
      }
    }
  }

  let formulaErrors = 0
  let evaluatedFormulaSessions = 0
  let revenueTotalCents = 0

  for (const session of sessions) {
    const locationId = session.cashRegister.locationId
    const formulaConfig = compiledFormulaByLocation.get(locationId)
    const revenueBasisTotalForSession = session.fieldValues.reduce(
      (sum, fieldValue) => (fieldValue.isRevenueBasisSnapshot ? sum + fieldValue.valueCents : sum),
      0,
    )
    if (!formulaConfig) {
      revenueTotalCents += revenueBasisTotalForSession
      continue
    }

    const runtimeValues = Object.fromEntries(
      session.fieldValues.map((fieldValue) => [fieldValue.fieldKeySnapshot, fieldValue.valueCents]),
    ) as Record<string, number>

    const perSessionResults: FormulaSessionResult[] = []
    let failed = false
    let sessionRevenueFromFormulaCents = 0
    let hasRevenueSourceFormulaResult = false

    for (const formula of formulaConfig.orderedFormulas) {
      const meta = formulaConfig.metaByKey.get(formula.resultKey)
      const expression = formulaConfig.compiledExpressionsByKey[formula.resultKey] ?? formula.expression
      const formulaKeys = new Set(extractCashFormulaKeys(expression))

      for (const key of formulaKeys) {
        if (!Object.prototype.hasOwnProperty.call(runtimeValues, key)) {
          runtimeValues[key] = 0
        }
      }

      const evaluation = evaluateCashFormulaExpression(expression, runtimeValues, formulaKeys)
      if (!evaluation.ok) {
        failed = true
        formulaErrors += 1
        break
      }

      runtimeValues[formula.resultKey] = evaluation.value
      if (meta?.isRevenueSource) {
        sessionRevenueFromFormulaCents += evaluation.value
        hasRevenueSourceFormulaResult = true
      }
      perSessionResults.push({
        resultKey: formula.resultKey,
        resultLabel: meta?.resultLabel ?? formula.resultLabel ?? formula.resultKey,
        valueCents: evaluation.value,
        isTipsSource: Boolean(meta?.isTipsSource),
        isRevenueSource: Boolean(meta?.isRevenueSource),
        displayOrder: meta?.displayOrder ?? formula.displayOrder ?? 0,
      })
    }

    if (failed) {
      revenueTotalCents += revenueBasisTotalForSession
      continue
    }

    evaluatedFormulaSessions += 1
    revenueTotalCents += hasRevenueSourceFormulaResult ? sessionRevenueFromFormulaCents : revenueBasisTotalForSession

    for (const result of perSessionResults) {
      const mapKey = `${result.resultKey}:${result.resultLabel}`
      const existing = formulaSummaryMap.get(mapKey)

      if (!existing) {
        formulaSummaryMap.set(mapKey, {
          resultKey: result.resultKey,
          resultLabel: result.resultLabel,
          totalValueCents: result.valueCents,
          entriesCount: 1,
          isTipsSource: result.isTipsSource,
          isRevenueSource: result.isRevenueSource,
          displayOrder: result.displayOrder,
        })
        continue
      }

      existing.totalValueCents += result.valueCents
      existing.entriesCount += 1
      existing.isTipsSource = existing.isTipsSource || result.isTipsSource
      existing.isRevenueSource = existing.isRevenueSource || result.isRevenueSource
      if (result.displayOrder < existing.displayOrder) {
        existing.displayOrder = result.displayOrder
      }
    }
  }

  const formulas = Array.from(formulaSummaryMap.values()).sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) {
      return a.displayOrder - b.displayOrder
    }
    return a.resultLabel.localeCompare(b.resultLabel, "ru")
  })

  return NextResponse.json({
    data: {
      summary: {
        currency: organization?.currency ?? null,
        sessionsCount: sessions.length,
        evaluatedFormulaSessions,
        revenueTotalCents,
        cashFields,
        formulas,
        formulaWarnings,
        formulaErrors,
      },
    },
  })
}
