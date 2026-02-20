import { Prisma } from "@prisma/client"
import { computeIntervalMinutesWorked } from "@/lib/payroll/interval-compensation"

type AllocationResult = {
  totalRevenueCents: number
  updatedIntervals: number
}

function toCentsFromWholeUnits(value: number) {
  if (!Number.isSafeInteger(value)) {
    throw new Error("Сумма выручки выходит за безопасный диапазон целых чисел")
  }
  const cents = value * 100
  if (!Number.isSafeInteger(cents)) {
    throw new Error("Сумма выручки в cents выходит за безопасный диапазон")
  }
  return cents
}

export async function syncWorkdayRevenueFromCashSessions(
  tx: Prisma.TransactionClient,
  workdayId: string,
): Promise<AllocationResult> {
  const cashSessions = await tx.cashSession.findMany({
    where: {
      workdayId,
      status: { in: ["closed", "reviewed"] },
    },
    select: {
      fieldValues: {
        select: {
          valueCents: true,
          isRevenueBasisSnapshot: true,
        },
      },
    },
  })

  let totalRevenueUnits = 0
  for (const session of cashSessions) {
    for (const value of session.fieldValues) {
      if (!value.isRevenueBasisSnapshot) continue
      totalRevenueUnits += value.valueCents
    }
  }
  const totalRevenueCents = toCentsFromWholeUnits(totalRevenueUnits)

  const intervals = await tx.workInterval.findMany({
    where: {
      workdayId,
      status: { not: "canceled" },
    },
    select: {
      id: true,
      startAt: true,
      endAt: true,
      openedAt: true,
      closedAt: true,
      breakMinutes: true,
      revenueCents: true,
      timeEntry: {
        select: {
          clockInAt: true,
          clockOutAt: true,
        },
      },
    },
  })

  if (intervals.length === 0) {
    return { totalRevenueCents, updatedIntervals: 0 }
  }

  const weighted = intervals.map((interval) => ({
    id: interval.id,
    minutes: computeIntervalMinutesWorked({
      interval: {
        startAt: interval.startAt,
        endAt: interval.endAt,
        openedAt: interval.openedAt,
        closedAt: interval.closedAt,
        breakMinutes: interval.breakMinutes,
      },
      timeEntry: interval.timeEntry,
    }).minutesWorked,
  }))

  const allocations = allocateCentsByMinutes(totalRevenueCents, weighted)
  let updatedIntervals = 0

  for (const interval of intervals) {
    const nextRevenue = allocations.get(interval.id) ?? 0
    if (interval.revenueCents === nextRevenue) {
      continue
    }

    await tx.workInterval.update({
      where: { id: interval.id },
      data: {
        revenueCents: nextRevenue,
        calculatedGrossPayCents: null,
        payCalculatedAt: null,
      },
    })
    updatedIntervals += 1
  }

  return { totalRevenueCents, updatedIntervals }
}

function allocateCentsByMinutes(totalCents: number, weighted: Array<{ id: string; minutes: number }>) {
  const allocations = new Map<string, number>()

  if (weighted.length === 0) {
    return allocations
  }

  for (const item of weighted) {
    allocations.set(item.id, 0)
  }

  const totalMinutes = weighted.reduce((sum, item) => sum + Math.max(0, item.minutes), 0)
  if (totalMinutes <= 0 || totalCents === 0) {
    return allocations
  }

  const sign = totalCents < 0 ? -1 : 1
  const absoluteTotal = Math.abs(totalCents)
  const totalMinutesBigInt = BigInt(totalMinutes)

  const rows = weighted.map((item) => {
    const minutes = Math.max(0, item.minutes)
    const numerator = BigInt(absoluteTotal) * BigInt(minutes)
    const base = Number(numerator / totalMinutesBigInt)
    const remainder = Number(numerator % totalMinutesBigInt)
    return {
      id: item.id,
      base,
      remainder,
    }
  })

  let distributed = 0
  for (const row of rows) {
    allocations.set(row.id, row.base * sign)
    distributed += row.base
  }

  let remaining = absoluteTotal - distributed
  if (remaining <= 0) {
    return allocations
  }

  rows.sort((a, b) => {
    if (a.remainder !== b.remainder) {
      return b.remainder - a.remainder
    }
    return a.id.localeCompare(b.id)
  })

  let cursor = 0
  while (remaining > 0 && rows.length > 0) {
    const row = rows[cursor]
    allocations.set(row.id, (allocations.get(row.id) ?? 0) + 1 * sign)
    remaining -= 1
    cursor = (cursor + 1) % rows.length
  }

  return allocations
}
