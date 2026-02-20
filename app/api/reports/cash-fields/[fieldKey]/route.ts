import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getCashAuthContext } from "@/lib/cash/access"
import { syncCashSessionFromWorkdayProcedures } from "@/lib/cash/session-sync"
import { syncWorkdayRevenueFromCashSessions } from "@/lib/cash/revenue-allocation"
import { syncWorkdayTipsFromCashSessions } from "@/lib/cash/tips-sync"

const querySchema = z.object({
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  inputStage: z.enum(["open", "close"]),
})

type RouteContext = { params: Promise<{ fieldKey: string }> }

type DateRange = {
  fromDate: Date
  toDate: Date
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

async function loadSessionsForPeriod(input: {
  organizationId: string
  fieldKey: string
  inputStage: "open" | "close"
  range: DateRange
}) {
  return prisma.cashSession.findMany({
    where: {
      cashRegister: {
        location: {
          organizationId: input.organizationId,
        },
      },
      workday: {
        workDate: {
          gte: input.range.fromDate,
          lte: input.range.toDate,
        },
      },
      fieldValues: {
        some: {
          fieldKeySnapshot: input.fieldKey,
          inputStage: input.inputStage,
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
        where: {
          fieldKeySnapshot: input.fieldKey,
          inputStage: input.inputStage,
        },
        select: {
          fieldLabelSnapshot: true,
          isRevenueBasisSnapshot: true,
          valueCents: true,
        },
      },
    },
    orderBy: [{ workday: { workDate: "desc" } }, { createdAt: "desc" }],
  })
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await getCashAuthContext({ requireManage: true })
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { fieldKey: rawFieldKey } = await context.params
  const fieldKey = rawFieldKey.trim().toLowerCase()
  if (!fieldKey) {
    return NextResponse.json({ error: "Некорректный ключ параметра кассы" }, { status: 400 })
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

  const inputStage = parsed.data.inputStage
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
      console.error("[api/reports/cash-fields/[fieldKey]][sync]", error)
    }
  }

  const [organization, activeField, mainSessions, previousSessions] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: auth.organizationId },
      select: { currency: true },
    }),
    prisma.cashRegisterField.findFirst({
      where: {
        key: fieldKey,
        inputStage,
        isActive: true,
        location: {
          organizationId: auth.organizationId,
        },
      },
      select: {
        label: true,
        isRevenueBasis: true,
      },
    }),
    loadSessionsForPeriod({
      organizationId: auth.organizationId,
      fieldKey,
      inputStage,
      range: mainRange,
    }),
    loadSessionsForPeriod({
      organizationId: auth.organizationId,
      fieldKey,
      inputStage,
      range: previousRange,
    }),
  ])

  if (!activeField && mainSessions.length === 0 && previousSessions.length === 0) {
    return NextResponse.json({ error: "Параметр кассы не найден" }, { status: 404 })
  }

  const resolvedLabel =
    activeField?.label || mainSessions[0]?.fieldValues[0]?.fieldLabelSnapshot || previousSessions[0]?.fieldValues[0]?.fieldLabelSnapshot || fieldKey
  const resolvedIsRevenueBasis =
    activeField?.isRevenueBasis ||
    mainSessions.some((session) => session.fieldValues[0]?.isRevenueBasisSnapshot) ||
    previousSessions.some((session) => session.fieldValues[0]?.isRevenueBasisSnapshot)

  const history: HistoryItem[] = mainSessions.map((session) => {
    const valueCents = session.fieldValues[0]?.valueCents ?? 0
    const actorName = inputStage === "open" ? session.openedByEmployee?.user.fullName ?? null : session.closedByEmployee?.user.fullName ?? null

    return {
      sessionId: session.id,
      workdayId: session.workdayId,
      workDate: toDateInputValue(session.workday.workDate),
      cashRegisterName: session.cashRegister.name,
      cashSessionStatus: session.status,
      valueCents,
      actorName,
    }
  })

  const totalValueCents = history.reduce((sum, item) => sum + item.valueCents, 0)
  const previousTotalCents = previousSessions.reduce((sum, session) => sum + (session.fieldValues[0]?.valueCents ?? 0), 0)
  const entriesCount = history.length
  const averageValueCents = entriesCount > 0 ? Math.round(totalValueCents / entriesCount) : 0

  const changePercent =
    previousTotalCents === 0 ? (totalValueCents === 0 ? 0 : null) : Number((((totalValueCents - previousTotalCents) / previousTotalCents) * 100).toFixed(1))

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

  return NextResponse.json({
    data: {
      field: {
        key: fieldKey,
        label: resolvedLabel,
        inputStage,
        isRevenueBasis: Boolean(resolvedIsRevenueBasis),
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
