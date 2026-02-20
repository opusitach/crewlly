import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getCashAuthContext } from "@/lib/cash/access"
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
})

type RouteContext = { params: Promise<{ resultKey: string }> }

type DateRange = {
  fromDate: Date
  toDate: Date
}

type FormulaRow = {
  locationId: string
  resultKey: string
  resultLabel: string
  expression: string
  isTipsSource: boolean
  displayOrder: number
}

type HistoryItem = {
  sessionId: string
  workdayId: string
  workDate: string
  cashRegisterName: string
  cashSessionStatus: string
  valueCents: number
  actorName: string | null
}

const toDateInputValue = (date: Date) => date.toISOString().split("T")[0]

const getDefaultPeriod = () => {
  const now = new Date()
  return {
    fromDate: new Date(now.getFullYear(), now.getMonth(), 1),
    toDate: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
  }
}

const diffDaysInclusive = (fromDate: Date, toDate: Date) => {
  const oneDay = 24 * 60 * 60 * 1000
  return Math.floor((toDate.getTime() - fromDate.getTime()) / oneDay) + 1
}

const buildDateMap = (range: DateRange) => {
  const points = new Map<string, { valueCents: number; entriesCount: number }>()
  const cursor = new Date(range.fromDate)
  while (cursor <= range.toDate) {
    points.set(toDateInputValue(cursor), { valueCents: 0, entriesCount: 0 })
    cursor.setDate(cursor.getDate() + 1)
  }
  return points
}

const buildTrendValues = (values: number[]) => {
  const windowSize = 3
  return values.map((_, index) => {
    const fromIndex = Math.max(0, index - (windowSize - 1))
    const window = values.slice(fromIndex, index + 1)
    const total = window.reduce((sum, value) => sum + value, 0)
    return Math.round(total / window.length)
  })
}

type SessionWithValues = {
  id: string
  workdayId: string
  status: string
  workday: {
    workDate: Date
  }
  cashRegister: {
    name: string
    locationId: string
  }
  openedByEmployee: {
    user: {
      fullName: string | null
    }
  } | null
  closedByEmployee: {
    user: {
      fullName: string | null
    }
  } | null
  fieldValues: Array<{
    fieldKeySnapshot: string
    valueCents: number
  }>
}

async function loadSessionsForPeriod(input: {
  organizationId: string
  locationIds: string[]
  range: DateRange
}) {
  return prisma.cashSession.findMany({
    where: {
      cashRegister: {
        location: {
          organizationId: input.organizationId,
        },
        locationId: { in: input.locationIds },
      },
      workday: {
        workDate: {
          gte: input.range.fromDate,
          lte: input.range.toDate,
        },
      },
    },
    select: {
      id: true,
      workdayId: true,
      status: true,
      workday: {
        select: {
          workDate: true,
        },
      },
      cashRegister: {
        select: {
          name: true,
          locationId: true,
        },
      },
      openedByEmployee: {
        select: {
          user: {
            select: {
              fullName: true,
            },
          },
        },
      },
      closedByEmployee: {
        select: {
          user: {
            select: {
              fullName: true,
            },
          },
        },
      },
      fieldValues: {
        select: {
          fieldKeySnapshot: true,
          valueCents: true,
        },
      },
    },
    orderBy: [{ workday: { workDate: "desc" } }, { createdAt: "desc" }],
  })
}

function evaluateFormulaForSession(input: {
  session: SessionWithValues
  resultKey: string
  config: {
    orderedFormulas: Array<{ resultKey: string; resultLabel?: string; expression: string; displayOrder?: number }>
    compiledExpressionsByKey: Record<string, string>
  }
}) {
  const runtimeValues = Object.fromEntries(
    input.session.fieldValues.map((fieldValue) => [fieldValue.fieldKeySnapshot, fieldValue.valueCents]),
  ) as Record<string, number>

  for (const formula of input.config.orderedFormulas) {
    const expression = input.config.compiledExpressionsByKey[formula.resultKey] ?? formula.expression
    const formulaKeys = new Set(extractCashFormulaKeys(expression))

    for (const key of formulaKeys) {
      if (!Object.prototype.hasOwnProperty.call(runtimeValues, key)) {
        runtimeValues[key] = 0
      }
    }

    const evaluation = evaluateCashFormulaExpression(expression, runtimeValues, formulaKeys)
    if (!evaluation.ok) {
      return { ok: false as const, error: evaluation.error }
    }

    runtimeValues[formula.resultKey] = evaluation.value

    if (formula.resultKey === input.resultKey) {
      return {
        ok: true as const,
        valueCents: evaluation.value,
      }
    }
  }

  return { ok: false as const, error: "formula_not_found" }
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await getCashAuthContext({ requireManage: true })
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { resultKey: rawResultKey } = await context.params
  const resultKey = rawResultKey.trim().toLowerCase()
  if (!resultKey) {
    return NextResponse.json({ error: "Некорректный ключ расчета" }, { status: 400 })
  }

  const url = new URL(request.url)
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const defaults = getDefaultPeriod()
  const fromDate = parsed.data.dateFrom ? new Date(parsed.data.dateFrom) : defaults.fromDate
  const toDate = parsed.data.dateTo ? new Date(parsed.data.dateTo) : defaults.toDate

  if (toDate < fromDate) {
    return NextResponse.json({ error: "dateTo must be >= dateFrom" }, { status: 400 })
  }

  const mainRange: DateRange = {
    fromDate,
    toDate,
  }

  const rangeDays = diffDaysInclusive(fromDate, toDate)
  const previousTo = new Date(fromDate)
  previousTo.setDate(previousTo.getDate() - 1)
  const previousFrom = new Date(previousTo)
  previousFrom.setDate(previousFrom.getDate() - (rangeDays - 1))
  const previousRange: DateRange = {
    fromDate: previousFrom,
    toDate: previousTo,
  }

  const candidateWorkdays = await prisma.workday.findMany({
    where: {
      organizationId: auth.organizationId,
      workDate: {
        gte: mainRange.fromDate,
        lte: mainRange.toDate,
      },
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
      console.error("[api/reports/cash-formulas/[resultKey]][sync]", error)
    }
  }

  const matchingFormulas = await prisma.cashRegisterFormula.findMany({
    where: {
      resultKey,
      location: {
        organizationId: auth.organizationId,
      },
    },
    select: {
      locationId: true,
      resultKey: true,
      resultLabel: true,
      expression: true,
      isTipsSource: true,
      displayOrder: true,
      createdAt: true,
    },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  })

  if (matchingFormulas.length === 0) {
    return NextResponse.json({ error: "Расчет формулы не найден" }, { status: 404 })
  }

  const locationIds = Array.from(new Set(matchingFormulas.map((formula) => formula.locationId)))

  const [organization, allFormulas, activeFields, mainSessions, previousSessions] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: auth.organizationId },
      select: { currency: true },
    }),
    prisma.cashRegisterFormula.findMany({
      where: {
        locationId: { in: locationIds },
      },
      select: {
        locationId: true,
        resultKey: true,
        resultLabel: true,
        expression: true,
        isTipsSource: true,
        displayOrder: true,
        createdAt: true,
      },
      orderBy: [{ locationId: "asc" }, { displayOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.cashRegisterField.findMany({
      where: {
        locationId: { in: locationIds },
        isActive: true,
      },
      select: {
        locationId: true,
        key: true,
      },
    }),
    loadSessionsForPeriod({
      organizationId: auth.organizationId,
      locationIds,
      range: mainRange,
    }),
    loadSessionsForPeriod({
      organizationId: auth.organizationId,
      locationIds,
      range: previousRange,
    }),
  ])

  const formulasByLocation = new Map<string, FormulaRow[]>()
  for (const formula of allFormulas) {
    const list = formulasByLocation.get(formula.locationId) ?? []
    list.push({
      locationId: formula.locationId,
      resultKey: formula.resultKey,
      resultLabel: formula.resultLabel,
      expression: formula.expression,
      isTipsSource: formula.isTipsSource,
      displayOrder: formula.displayOrder,
    })
    formulasByLocation.set(formula.locationId, list)
  }

  const observedFieldKeysByLocation = new Map<string, Set<string>>()
  for (const session of [...mainSessions, ...previousSessions]) {
    const locationId = session.cashRegister.locationId
    const keys = observedFieldKeysByLocation.get(locationId) ?? new Set<string>()
    for (const fieldValue of session.fieldValues) {
      keys.add(fieldValue.fieldKeySnapshot)
    }
    observedFieldKeysByLocation.set(locationId, keys)
  }

  const activeFieldKeysByLocation = new Map<string, Set<string>>()
  for (const field of activeFields) {
    const keys = activeFieldKeysByLocation.get(field.locationId) ?? new Set<string>()
    keys.add(field.key)
    activeFieldKeysByLocation.set(field.locationId, keys)
  }

  const compiledByLocation = new Map<
    string,
    {
      orderedFormulas: Array<{ resultKey: string; resultLabel?: string; expression: string; displayOrder?: number }>
      compiledExpressionsByKey: Record<string, string>
      selectedMeta: FormulaRow
    }
  >()

  const formulaWarnings: string[] = []

  for (const locationId of locationIds) {
    const locationFormulas = formulasByLocation.get(locationId) ?? []
    if (locationFormulas.length === 0) continue

    const selectedMeta = locationFormulas.find((formula) => formula.resultKey === resultKey)
    if (!selectedMeta) continue

    const activeKeys = activeFieldKeysByLocation.get(locationId) ?? new Set<string>()
    const observedKeys = observedFieldKeysByLocation.get(locationId) ?? new Set<string>()
    const allowedFieldKeys = new Set<string>([...activeKeys, ...observedKeys])

    const validation = validateAndCompileCashFormulaSet(
      locationFormulas.map((formula) => ({
        resultKey: formula.resultKey,
        resultLabel: formula.resultLabel,
        expression: formula.expression,
        displayOrder: formula.displayOrder,
      })),
      allowedFieldKeys,
    )

    if (!validation.ok) {
      formulaWarnings.push(`Локация ${locationId}: ${validation.error}`)
      continue
    }

    compiledByLocation.set(locationId, {
      orderedFormulas: validation.orderedFormulas,
      compiledExpressionsByKey: validation.compiledExpressionsByKey,
      selectedMeta,
    })
  }

  const history: HistoryItem[] = []
  let formulaErrors = 0

  for (const session of mainSessions) {
    const locationId = session.cashRegister.locationId
    const config = compiledByLocation.get(locationId)
    if (!config) continue

    const evaluation = evaluateFormulaForSession({
      session,
      resultKey,
      config,
    })

    if (!evaluation.ok) {
      formulaErrors += 1
      continue
    }

    const actorName = session.closedByEmployee?.user.fullName ?? session.openedByEmployee?.user.fullName ?? null

    history.push({
      sessionId: session.id,
      workdayId: session.workdayId,
      workDate: toDateInputValue(session.workday.workDate),
      cashRegisterName: session.cashRegister.name,
      cashSessionStatus: session.status,
      valueCents: evaluation.valueCents,
      actorName,
    })
  }

  let previousTotalCents = 0
  for (const session of previousSessions) {
    const locationId = session.cashRegister.locationId
    const config = compiledByLocation.get(locationId)
    if (!config) continue

    const evaluation = evaluateFormulaForSession({
      session,
      resultKey,
      config,
    })

    if (!evaluation.ok) continue
    previousTotalCents += evaluation.valueCents
  }

  const totalValueCents = history.reduce((sum, item) => sum + item.valueCents, 0)
  const entriesCount = history.length
  const averageValueCents = entriesCount > 0 ? Math.round(totalValueCents / entriesCount) : 0

  const changePercent =
    previousTotalCents === 0
      ? totalValueCents === 0
        ? 0
        : null
      : Number((((totalValueCents - previousTotalCents) / previousTotalCents) * 100).toFixed(1))

  const chartMap = buildDateMap(mainRange)
  for (const item of history) {
    const point = chartMap.get(item.workDate)
    if (!point) continue
    point.valueCents += item.valueCents
    point.entriesCount += 1
  }

  const chartRows = Array.from(chartMap.entries()).map(([date, point]) => ({
    date,
    valueCents: point.valueCents,
    entriesCount: point.entriesCount,
  }))
  const trendValues = buildTrendValues(chartRows.map((row) => row.valueCents))

  const resolvedLabel = matchingFormulas[0]?.resultLabel || resultKey
  const isTipsSource = matchingFormulas.some((formula) => formula.isTipsSource)

  return NextResponse.json({
    data: {
      formula: {
        resultKey,
        resultLabel: resolvedLabel,
        isTipsSource,
      },
      period: {
        fromDate: toDateInputValue(mainRange.fromDate),
        toDate: toDateInputValue(mainRange.toDate),
      },
      summary: {
        totalValueCents,
        previousTotalCents,
        averageValueCents,
        entriesCount,
        changePercent,
        currency: organization?.currency ?? null,
        formulaErrors,
        formulaWarnings,
      },
      chart: {
        points: chartRows.map((row, index) => ({
          date: row.date,
          valueCents: row.valueCents,
          trendCents: trendValues[index] ?? row.valueCents,
          entriesCount: row.entriesCount,
        })),
      },
      history,
    },
  })
}
