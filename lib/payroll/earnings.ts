import { EmployeeEarningAdjustmentType, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { computeIntervalMinutesWorked, computeIntervalPayrollSnapshot } from "@/lib/payroll/interval-compensation"
import { syncCashSessionFromWorkdayProcedures } from "@/lib/cash/session-sync"
import { syncWorkdayTipsFromCashSessions } from "@/lib/cash/tips-sync"
import { computeEmployeeTipsByWorkdayForEarnings } from "@/lib/cash/earnings-tips"
import {
  resolveEffectiveWorkIntervalClosedAt,
  resolveEffectiveWorkIntervalOpenedAt,
  resolveEffectiveWorkIntervalStatus,
} from "@/lib/work-intervals/status"

export type EarningsHistoryItem = {
  id: string
  itemType: "shift" | "adjustment"
  workdayId: string | null
  workDate: string
  startAt: string | null
  endAt: string | null
  status: string
  positionName: string | null
  minutesWorked: number
  grossPayCents: number
  tipsCents: number
  bonusCents: number
  penaltyCents: number
  totalAccruedCents: number
  actualStartAt: string | null
  actualEndAt: string | null
  usedActualTime: boolean
  payCalculatedAt: string | null
  useCustomPay: boolean
  adjustmentType: "bonus" | "penalty" | null
  adjustmentComment: string | null
  createdAt: string
}

export type EarningsSummary = {
  totalGrossCents: number
  totalSalaryCents: number
  totalTipsCents: number
  totalBonusCents: number
  totalPenaltyCents: number
  totalAdjustmentsCents: number
  totalAccruedCents: number
  totalMinutesWorked: number
  shiftsCount: number
  adjustmentCount: number
  currency: string | null
}

type ComputeEmployeeEarningsInput = {
  organizationId: string
  employeeId: string
  organizationTimezone: string
  organizationCurrency: string | null
  dateFrom?: string
  dateTo?: string
  limit?: number
}

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/

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

const toHistorySortTime = (item: EarningsHistoryItem) => {
  const primary =
    item.itemType === "adjustment"
      ? new Date(`${item.workDate}T12:00:00.000Z`).getTime()
      : new Date(item.actualEndAt ?? item.endAt ?? item.startAt ?? item.createdAt).getTime()
  const fallback = new Date(item.createdAt).getTime()

  if (Number.isFinite(primary)) {
    return primary * 1000 + (Number.isFinite(fallback) ? fallback : 0)
  }

  return Number.isFinite(fallback) ? fallback : 0
}

const isAdjustmentStorageUnavailableError = (error: unknown) => {
  if (error instanceof TypeError && error.message.includes("findMany")) {
    return true
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2021" || error.code === "P2022"
  }

  if (!(error instanceof Error)) return false

  return (
    error.message.includes("employeeEarningAdjustment") ||
    error.message.includes("EmployeeEarningAdjustment") ||
    error.message.includes("employee_earning_adjustment")
  )
}

const loadEmployeeEarningAdjustments = async ({
  organizationId,
  employeeId,
  fromDate,
  toDate,
}: {
  organizationId: string
  employeeId: string
  fromDate: Date | null
  toDate: Date | null
}) => {
  if (!("employeeEarningAdjustment" in prisma) || !prisma.employeeEarningAdjustment) {
    console.warn("[payroll/earnings][adjustments-unavailable]", new Error("Prisma delegate is not generated yet"))
    return []
  }

  try {
    return await prisma.employeeEarningAdjustment.findMany({
      where: {
        organizationId,
        employeeId,
        ...(fromDate || toDate
          ? {
              effectiveDate: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
    })
  } catch (error) {
    if (!isAdjustmentStorageUnavailableError(error)) {
      throw error
    }

    console.warn("[payroll/earnings][adjustments-unavailable]", error)
    return []
  }
}

export async function computeEmployeeEarnings({
  organizationId,
  employeeId,
  organizationTimezone,
  organizationCurrency,
  dateFrom,
  dateTo,
  limit,
}: ComputeEmployeeEarningsInput): Promise<{ summary: EarningsSummary; items: EarningsHistoryItem[] }> {
  const dateKeyFormatter = createDateKeyFormatter(organizationTimezone || "UTC")
  const fromDate = dateFrom ? createDateBoundary(dateFrom, -1) : null
  const toDate = dateTo ? createDateBoundary(dateTo, 1) : null

  const fetchedIntervals = await prisma.workInterval.findMany({
    where: {
      employeeId,
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
        organizationId,
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
          await syncCashSessionFromWorkdayProcedures(tx, target)
          await syncWorkdayTipsFromCashSessions(tx, target)
        }
      })
    } catch (error) {
      console.error("[payroll/earnings][tips-sync]", error)
    }
  }

  const workdayTargets = Array.from(
    new Map(
      intervals.map((interval) => [interval.workdayId, { workdayId: interval.workdayId, locationId: interval.workday.locationId }]),
    ).values(),
  )
  const tipsByWorkdayId = await computeEmployeeTipsByWorkdayForEarnings(prisma, {
    employeeId,
    targets: workdayTargets,
  })

  const intervalsNeedingRecalc = intervals.filter(
    (interval) => interval.calculatedMinutesWorked == null || interval.calculatedGrossPayCents == null,
  )
  const customIntervalIds = intervalsNeedingRecalc
    .filter((interval) => interval.useCustomPay)
    .map((interval) => interval.id)

  const [intervalComponents, employeeComponents, adjustments] = await Promise.all([
    customIntervalIds.length > 0
      ? prisma.workIntervalPayComponent.findMany({
          where: { workIntervalId: { in: customIntervalIds }, isActive: true },
          orderBy: [{ priority: "desc" }, { componentType: "asc" }],
        })
      : Promise.resolve([]),
    intervalsNeedingRecalc.some((interval) => !interval.useCustomPay)
      ? prisma.employeePayComponent.findMany({
          where: { employeeId, isActive: true },
          orderBy: [{ priority: "desc" }, { componentType: "asc" }],
        })
      : Promise.resolve([]),
    loadEmployeeEarningAdjustments({
      organizationId,
      employeeId,
      fromDate,
      toDate,
    }),
  ])

  const adjustmentItems = adjustments
    .filter((adjustment) => isDateKeyWithinRange(formatDateKey(adjustment.effectiveDate, dateKeyFormatter), dateFrom, dateTo))
    .map<EarningsHistoryItem>((adjustment) => {
      const isBonus = adjustment.adjustmentType === EmployeeEarningAdjustmentType.bonus
      const amountCents = Math.max(0, adjustment.amountCents)
      const workDate = formatDateKey(adjustment.effectiveDate, dateKeyFormatter)

      return {
        id: adjustment.id,
        itemType: "adjustment",
        workdayId: null,
        workDate,
        startAt: null,
        endAt: null,
        status: "posted",
        positionName: null,
        minutesWorked: 0,
        grossPayCents: 0,
        tipsCents: 0,
        bonusCents: isBonus ? amountCents : 0,
        penaltyCents: isBonus ? 0 : amountCents,
        totalAccruedCents: isBonus ? amountCents : -amountCents,
        actualStartAt: null,
        actualEndAt: null,
        usedActualTime: false,
        payCalculatedAt: null,
        useCustomPay: false,
        adjustmentType: isBonus ? "bonus" : "penalty",
        adjustmentComment: adjustment.comment,
        createdAt: adjustment.createdAt.toISOString(),
      }
    })

  const intervalComponentsById = new Map<string, typeof intervalComponents>()
  for (const component of intervalComponents) {
    const list = intervalComponentsById.get(component.workIntervalId) ?? []
    list.push(component)
    intervalComponentsById.set(component.workIntervalId, list)
  }

  let totalGrossCents = 0
  let totalTipsCents = 0
  let totalMinutesWorked = 0

  const items = intervals.map<EarningsHistoryItem>((interval) => {
    const effectiveStatus = resolveEffectiveWorkIntervalStatus(interval)
    const effectiveOpenedAt = resolveEffectiveWorkIntervalOpenedAt(interval)
    const effectiveClosedAt = resolveEffectiveWorkIntervalClosedAt(interval)
    let minutesWorked = interval.calculatedMinutesWorked ?? 0
    let grossPayCents = interval.calculatedGrossPayCents ?? 0

    if (interval.calculatedMinutesWorked == null || interval.calculatedGrossPayCents == null) {
      const snapshot = computeIntervalPayrollSnapshot({
        interval: {
          startAt: interval.startAt,
          endAt: interval.endAt,
          openedAt: effectiveOpenedAt,
          closedAt: effectiveClosedAt,
          breakMinutes: interval.breakMinutes,
          status: effectiveStatus,
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
        openedAt: effectiveOpenedAt,
        closedAt: effectiveClosedAt,
        breakMinutes: interval.breakMinutes,
      },
      timeEntry: interval.timeEntry,
    })

    totalGrossCents += grossPayCents
    totalMinutesWorked += minutesWorked

    return {
      id: interval.id,
      itemType: "shift",
      workdayId: interval.workdayId,
      workDate: formatDateKey(interval.workday.workDate, dateKeyFormatter),
      startAt: interval.startAt.toISOString(),
      endAt: interval.endAt.toISOString(),
      status: effectiveStatus,
      positionName: interval.position?.name ?? null,
      minutesWorked,
      grossPayCents,
      tipsCents: 0,
      bonusCents: 0,
      penaltyCents: 0,
      totalAccruedCents: grossPayCents,
      actualStartAt: workedRange.effectiveStartAt.toISOString(),
      actualEndAt: workedRange.effectiveEndAt.toISOString(),
      usedActualTime: workedRange.usedActualTime,
      payCalculatedAt: interval.payCalculatedAt?.toISOString() ?? null,
      useCustomPay: interval.useCustomPay,
      adjustmentType: null,
      adjustmentComment: null,
      createdAt:
        interval.createdAt instanceof Date
          ? interval.createdAt.toISOString()
          : interval.endAt.toISOString(),
    }
  })

  const itemIndexesByWorkdayId = new Map<string, number[]>()
  for (let index = 0; index < items.length; index += 1) {
    const workdayId = items[index].workdayId
    if (!workdayId) continue
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

  const totalBonusCents = adjustmentItems.reduce((sum, item) => sum + item.bonusCents, 0)
  const totalPenaltyCents = adjustmentItems.reduce((sum, item) => sum + item.penaltyCents, 0)
  const totalAdjustmentsCents = totalBonusCents - totalPenaltyCents

  const mergedItems = [...items, ...adjustmentItems].sort((a, b) => toHistorySortTime(b) - toHistorySortTime(a))
  const limitedItems =
    typeof limit === "number" && Number.isInteger(limit) && limit > 0 ? mergedItems.slice(0, limit) : mergedItems

  return {
    summary: {
      totalGrossCents,
      totalSalaryCents: totalGrossCents,
      totalTipsCents,
      totalBonusCents,
      totalPenaltyCents,
      totalAdjustmentsCents,
      totalAccruedCents: totalGrossCents + totalTipsCents + totalAdjustmentsCents,
      totalMinutesWorked,
      shiftsCount: items.length,
      adjustmentCount: adjustmentItems.length,
      currency: organizationCurrency ?? null,
    },
    items: limitedItems,
  }
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

export const earningsDateOnlyPattern = dateOnlyPattern
