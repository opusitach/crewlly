import { prisma } from "@/lib/prisma"
import { computeIntervalMinutesWorked } from "@/lib/payroll/interval-compensation"
import { computeWorkdayTipsTotalsFromCashSessions } from "@/lib/cash/tips-read"
import { allocateCentsByMinutes, allocateCentsEqual, normalizeTipsSplitMethod } from "@/lib/cash/tips-allocation"

type EarningsTipsDb = Pick<
  typeof prisma,
  "workInterval" | "tipsPool" | "location" | "cashSession" | "cashRegisterFormula" | "cashRegisterField"
>

type WorkdayTarget = {
  workdayId: string
  locationId: string
}

export async function computeEmployeeTipsByWorkdayForEarnings(
  db: EarningsTipsDb,
  input: {
    employeeId: string
    targets: WorkdayTarget[]
  },
) {
  const targetsByWorkdayId = new Map<string, WorkdayTarget>()
  for (const target of input.targets) {
    if (!target.workdayId || !target.locationId) continue
    if (!targetsByWorkdayId.has(target.workdayId)) {
      targetsByWorkdayId.set(target.workdayId, target)
    }
  }

  const workdayIds = Array.from(targetsByWorkdayId.keys())
  if (workdayIds.length === 0) {
    return new Map<string, number>()
  }

  const locationIds = Array.from(new Set(Array.from(targetsByWorkdayId.values()).map((target) => target.locationId)))

  const [sessionsTotalsByWorkdayId, closedSessions, intervals, tipsPools, locations] = await Promise.all([
    computeWorkdayTipsTotalsFromCashSessions(db, Array.from(targetsByWorkdayId.values())),
    db.cashSession.findMany({
      where: {
        workdayId: { in: workdayIds },
        status: { in: ["closed", "reviewed"] },
      },
      select: {
        workdayId: true,
      },
    }),
    db.workInterval.findMany({
      where: {
        workdayId: { in: workdayIds },
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
      },
      select: {
        workdayId: true,
        employeeId: true,
        startAt: true,
        endAt: true,
        openedAt: true,
        closedAt: true,
        breakMinutes: true,
        timeEntry: {
          select: {
            clockInAt: true,
            clockOutAt: true,
          },
        },
      },
    }),
    db.tipsPool.findMany({
      where: {
        workdayId: { in: workdayIds },
      },
      select: {
        workdayId: true,
        totalAmountCents: true,
        splitMethod: true,
      },
    }),
    locationIds.length
      ? db.location.findMany({
          where: {
            id: { in: locationIds },
          },
          select: {
            id: true,
            tipsSplitMethod: true,
          },
        })
      : Promise.resolve([]),
  ])

  const tipsPoolByWorkdayId = new Map(tipsPools.map((pool) => [pool.workdayId, pool]))
  const locationSplitMethodById = new Map(locations.map((location) => [location.id, location.tipsSplitMethod]))
  const hasClosedSessionByWorkdayId = new Set(closedSessions.map((session) => session.workdayId))

  const minutesByWorkdayId = new Map<string, Map<string, number>>()
  for (const interval of intervals) {
    const minutesWorked = computeIntervalMinutesWorked({
      interval: {
        startAt: interval.startAt,
        endAt: interval.endAt,
        openedAt: interval.openedAt,
        closedAt: interval.closedAt,
        breakMinutes: interval.breakMinutes,
      },
      timeEntry: interval.timeEntry,
    }).minutesWorked

    const minutesByEmployeeId = minutesByWorkdayId.get(interval.workdayId) ?? new Map<string, number>()
    minutesByEmployeeId.set(
      interval.employeeId,
      (minutesByEmployeeId.get(interval.employeeId) ?? 0) + Math.max(0, minutesWorked),
    )
    minutesByWorkdayId.set(interval.workdayId, minutesByEmployeeId)
  }

  const tipsByWorkdayId = new Map<string, number>()

  for (const [workdayId, target] of targetsByWorkdayId.entries()) {
    const minutesByEmployeeId = minutesByWorkdayId.get(workdayId) ?? new Map<string, number>()
    const employeeIds = Array.from(minutesByEmployeeId.keys()).sort((a, b) => a.localeCompare(b))
    if (employeeIds.length === 0) {
      tipsByWorkdayId.set(workdayId, 0)
      continue
    }

    const pool = tipsPoolByWorkdayId.get(workdayId)
    const totalCentsRaw = sessionsTotalsByWorkdayId.has(workdayId)
      ? (sessionsTotalsByWorkdayId.get(workdayId) ?? 0)
      : hasClosedSessionByWorkdayId.has(workdayId)
        ? 0
        : (pool?.totalAmountCents ?? 0)
    const totalCents = Number.isSafeInteger(totalCentsRaw) ? Number(totalCentsRaw) : 0
    const splitMethod = normalizeTipsSplitMethod(
      pool?.splitMethod ?? locationSplitMethodById.get(target.locationId) ?? "equal",
    )

    const allocations =
      splitMethod === "equal"
        ? allocateCentsEqual(totalCents, employeeIds)
        : allocateCentsByMinutes(
            totalCents,
            employeeIds.map((employeeId) => ({
              employeeId,
              minutes: minutesByEmployeeId.get(employeeId) ?? 0,
            })),
          )

    tipsByWorkdayId.set(workdayId, allocations.get(input.employeeId) ?? 0)
  }

  return tipsByWorkdayId
}
