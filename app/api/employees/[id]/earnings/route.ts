import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSessionUserWithOrg } from "@/lib/auth"
import { computeIntervalMinutesWorked, computeIntervalPayrollSnapshot } from "@/lib/payroll/interval-compensation"
import { syncWorkdayTipsFromCashSessions } from "@/lib/cash/tips-sync"
import { computeEmployeeTipsByWorkdayForEarnings } from "@/lib/cash/earnings-tips"

const querySchema = z.object({
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

const createDateBoundary = (value: string, dayOffset: number) => {
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10))
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + dayOffset)
  return date
}

const createDateKeyFormatter = (timeZone: string) => {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
  }
}

const formatDateKey = (date: Date, formatter: Intl.DateTimeFormat) => {
  let year = ""
  let month = ""
  let day = ""

  for (const part of formatter.formatToParts(date)) {
    if (part.type === "year") year = part.value
    else if (part.type === "month") month = part.value
    else if (part.type === "day") day = part.value
  }

  if (!year || !month || !day) return date.toISOString().split("T")[0]
  return `${year}-${month}-${day}`
}

const isDateKeyWithinRange = (dateKey: string, dateFrom?: string, dateTo?: string) => {
  if (dateFrom && dateKey < dateFrom) return false
  if (dateTo && dateKey > dateTo) return false
  return true
}

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, context: RouteContext) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: employeeId } = await context.params
  const employee = await prisma.employee.findFirst({
    where: {
      id: employeeId,
      organizationId: session.organization.id,
    },
    select: {
      id: true,
    },
  })

  if (!employee) {
    return NextResponse.json({ error: "Сотрудник не найден" }, { status: 404 })
  }

  const url = new URL(request.url)
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { dateFrom, dateTo } = parsed.data
  if (dateFrom && dateTo && dateTo < dateFrom) {
    return NextResponse.json({ error: "dateTo must be >= dateFrom" }, { status: 400 })
  }

  const dateKeyFormatter = createDateKeyFormatter(session.organization.timezone ?? "UTC")
  const fromDate = dateFrom ? createDateBoundary(dateFrom, -1) : null
  const toDate = dateTo ? createDateBoundary(dateTo, 1) : null

  const fetchedIntervals = await prisma.workInterval.findMany({
    where: {
      employeeId: employee.id,
      OR: [
        { status: "completed" },
        {
          status: { notIn: ["canceled", "conflict"] },
          timeEntry: {
            is: {
              clockOutAt: { not: null },
            },
          },
        },
      ],
      workday: {
        organizationId: session.organization.id,
        ...(fromDate || toDate
          ? {
              workDate: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
      },
    },
    include: {
      workday: { select: { id: true, workDate: true, locationId: true, status: true } },
      position: { select: { name: true } },
      timeEntry: { select: { clockInAt: true, clockOutAt: true } },
    },
    orderBy: { startAt: "desc" },
    ...(parsed.data.limit ? { take: parsed.data.limit } : {}),
  })

  const intervals = fetchedIntervals.filter((interval) =>
    isDateKeyWithinRange(formatDateKey(interval.workday.workDate, dateKeyFormatter), dateFrom, dateTo),
  )

  const workdaysToSync = new Map<string, { workdayId: string; locationId: string }>()
  for (const interval of intervals) {
    if (interval.workday.status !== "draft") continue
    workdaysToSync.set(interval.workday.id, {
      workdayId: interval.workday.id,
      locationId: interval.workday.locationId,
    })
  }

  if (workdaysToSync.size > 0) {
    try {
      await prisma.$transaction(async (tx) => {
        for (const target of workdaysToSync.values()) {
          await syncWorkdayTipsFromCashSessions(tx, target)
        }
      })
    } catch (error) {
      // Do not block earnings page if tips sync failed for one of workdays.
      console.error("[api/employees/[id]/earnings][tips-sync]", error)
    }
  }

  const workdayTargets = Array.from(
    new Map(
      intervals.map((interval) => [interval.workdayId, { workdayId: interval.workdayId, locationId: interval.workday.locationId }]),
    ).values(),
  )
  const tipsByWorkdayId = await computeEmployeeTipsByWorkdayForEarnings(prisma, {
    employeeId: employee.id,
    targets: workdayTargets,
  })

  const intervalsNeedingRecalc = intervals.filter(
    (interval) => interval.calculatedMinutesWorked == null || interval.calculatedGrossPayCents == null,
  )
  const customIntervalIds = intervalsNeedingRecalc
    .filter((interval) => interval.useCustomPay)
    .map((interval) => interval.id)

  const [intervalComponents, employeeComponents] = await Promise.all([
    customIntervalIds.length > 0
      ? prisma.workIntervalPayComponent.findMany({
          where: { workIntervalId: { in: customIntervalIds }, isActive: true },
          orderBy: [{ priority: "desc" }, { componentType: "asc" }],
        })
      : Promise.resolve([]),
    intervalsNeedingRecalc.some((interval) => !interval.useCustomPay)
      ? prisma.employeePayComponent.findMany({
          where: { employeeId: employee.id, isActive: true },
          orderBy: [{ priority: "desc" }, { componentType: "asc" }],
        })
      : Promise.resolve([]),
  ])

  const intervalComponentsById = new Map<string, typeof intervalComponents>()
  for (const component of intervalComponents) {
    const list = intervalComponentsById.get(component.workIntervalId) ?? []
    list.push(component)
    intervalComponentsById.set(component.workIntervalId, list)
  }

  let totalGrossCents = 0
  let totalTipsCents = 0
  let totalMinutesWorked = 0

  const items = intervals.map((interval) => {
    let minutesWorked = interval.calculatedMinutesWorked ?? 0
    let grossPayCents = interval.calculatedGrossPayCents ?? 0

    if (interval.calculatedMinutesWorked == null || interval.calculatedGrossPayCents == null) {
      const snapshot = computeIntervalPayrollSnapshot({
        interval: {
          startAt: interval.startAt,
          endAt: interval.endAt,
          openedAt: interval.openedAt,
          closedAt: interval.closedAt,
          breakMinutes: interval.breakMinutes,
          status: interval.status,
          useCustomPay: interval.useCustomPay,
          revenueCents: interval.revenueCents,
        },
        timeEntry: interval.timeEntry,
        intervalComponents: (intervalComponentsById.get(interval.id) ?? []).map((component) => ({
          componentType: component.componentType,
          amountCents: component.amountCents,
          rateBp: component.rateBp,
          isActive: component.isActive,
        })),
        employeeComponents: employeeComponents.map((component) => ({
          componentType: component.componentType,
          amountCents: component.amountCents,
          rateBp: component.rateBp,
          isActive: component.isActive,
        })),
      })
      minutesWorked = snapshot.minutesWorked
      grossPayCents = snapshot.grossPayCents
    }

    const workedRange = computeIntervalMinutesWorked({
      interval: {
        startAt: interval.startAt,
        endAt: interval.endAt,
        openedAt: interval.openedAt,
        closedAt: interval.closedAt,
        breakMinutes: interval.breakMinutes,
      },
      timeEntry: interval.timeEntry,
    })

    totalGrossCents += grossPayCents
    totalMinutesWorked += minutesWorked

    return {
      id: interval.id,
      workdayId: interval.workdayId,
      workDate: formatDateKey(interval.workday.workDate, dateKeyFormatter),
      startAt: interval.startAt.toISOString(),
      endAt: interval.endAt.toISOString(),
      status: interval.status,
      positionName: interval.position?.name ?? null,
      minutesWorked,
      grossPayCents,
      tipsCents: 0,
      totalAccruedCents: grossPayCents,
      actualStartAt: workedRange.effectiveStartAt.toISOString(),
      actualEndAt: workedRange.effectiveEndAt.toISOString(),
      usedActualTime: workedRange.usedActualTime,
      payCalculatedAt: interval.payCalculatedAt?.toISOString() ?? null,
      useCustomPay: interval.useCustomPay,
    }
  })

  const itemIndexesByWorkdayId = new Map<string, number[]>()
  for (let index = 0; index < items.length; index += 1) {
    const workdayId = items[index].workdayId
    const indexes = itemIndexesByWorkdayId.get(workdayId) ?? []
    indexes.push(index)
    itemIndexesByWorkdayId.set(workdayId, indexes)
  }

  for (const [workdayId, totalTipsForDay] of tipsByWorkdayId.entries()) {
    const indexes = itemIndexesByWorkdayId.get(workdayId) ?? []
    if (indexes.length === 0) continue

    const allocations = allocateTipsByIntervalMinutes(
      totalTipsForDay,
      indexes.map((index) => ({
        index,
        intervalId: items[index].id,
        minutesWorked: Math.max(0, items[index].minutesWorked),
      })),
    )

    for (const [index, tipsCents] of allocations.entries()) {
      items[index].tipsCents = tipsCents
      items[index].totalAccruedCents = items[index].grossPayCents + tipsCents
      totalTipsCents += tipsCents
    }
  }

  return NextResponse.json({
    data: {
      summary: {
        totalGrossCents,
        totalSalaryCents: totalGrossCents,
        totalTipsCents,
        totalAccruedCents: totalGrossCents + totalTipsCents,
        totalMinutesWorked,
        shiftsCount: items.length,
        currency: session.organization.currency ?? null,
      },
      items,
    },
  })
}

function allocateTipsByIntervalMinutes(
  totalCents: number,
  intervals: Array<{ index: number; intervalId: string; minutesWorked: number }>,
) {
  const allocation = new Map<number, number>()
  if (intervals.length === 0) return allocation

  for (const interval of intervals) {
    allocation.set(interval.index, 0)
  }

  if (totalCents === 0) return allocation

  const sign = totalCents < 0 ? -1 : 1
  const absoluteTotal = Math.abs(totalCents)
  const totalMinutes = intervals.reduce((sum, interval) => sum + Math.max(0, interval.minutesWorked), 0)

  if (totalMinutes <= 0) {
    const sorted = [...intervals].sort((a, b) => a.intervalId.localeCompare(b.intervalId))
    const share = Math.floor(absoluteTotal / sorted.length)
    let remainder = absoluteTotal - share * sorted.length
    for (const interval of sorted) {
      let cents = share
      if (remainder > 0) {
        cents += 1
        remainder -= 1
      }
      allocation.set(interval.index, cents * sign)
    }
    return allocation
  }

  const totalMinutesBigInt = BigInt(totalMinutes)
  const rows = intervals.map((interval) => {
    const numerator = BigInt(absoluteTotal) * BigInt(Math.max(0, interval.minutesWorked))
    const base = Number(numerator / totalMinutesBigInt)
    const remainder = Number(numerator % totalMinutesBigInt)
    return {
      ...interval,
      base,
      remainder,
    }
  })

  let distributed = 0
  for (const row of rows) {
    allocation.set(row.index, row.base * sign)
    distributed += row.base
  }

  let remainder = absoluteTotal - distributed
  if (remainder <= 0) return allocation

  rows.sort((a, b) => {
    if (a.remainder !== b.remainder) return b.remainder - a.remainder
    return a.intervalId.localeCompare(b.intervalId)
  })

  let cursor = 0
  while (remainder > 0 && rows.length > 0) {
    const row = rows[cursor]
    allocation.set(row.index, (allocation.get(row.index) ?? 0) + 1 * sign)
    remainder -= 1
    cursor = (cursor + 1) % rows.length
  }

  return allocation
}
