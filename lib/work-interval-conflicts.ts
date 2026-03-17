import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { formatTimeInTimeZone } from "@/lib/utils/timezone"

export const WORK_INTERVAL_OVERLAP_ERROR_CODE = "INTERVAL_OVERLAP" as const

const CONFLICT_RELEVANT_STATUSES = ["scheduled", "conflict"] as const

type ConflictRelevantStatus = (typeof CONFLICT_RELEVANT_STATUSES)[number]

type DbClient = Prisma.TransactionClient | typeof prisma

type ConflictCandidate = {
  id: string
  startAt: Date
  endAt: Date
  status: string
  conflictWithIntervalIds: string[]
}

export type IntervalConflictSummary = {
  id: string
  workdayId: string
  workDate: string
  employeeId: string
  employeeName: string | null
  positionId: string | null
  positionName: string | null
  startAt: string
  endAt: string
  startTime: string
  endTime: string
  status: string
}

const isConflictRelevantStatus = (status: string): status is ConflictRelevantStatus =>
  (CONFLICT_RELEVANT_STATUSES as readonly string[]).includes(status)

const arraysEqual = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

const toSummary = (row: {
  id: string
  workdayId: string
  employeeId: string
  positionId: string | null
  startAt: Date
  endAt: Date
  status: string
  workday: { workDate: Date }
  employee: { user: { fullName: string | null } }
  position: { name: string } | null
}, timeZone?: string | null): IntervalConflictSummary => ({
  id: row.id,
  workdayId: row.workdayId,
  workDate: row.workday.workDate.toISOString().split("T")[0],
  employeeId: row.employeeId,
  employeeName: row.employee.user.fullName ?? null,
  positionId: row.positionId,
  positionName: row.position?.name ?? null,
  startAt: row.startAt.toISOString(),
  endAt: row.endAt.toISOString(),
  startTime: formatTimeInTimeZone(row.startAt, timeZone, "--:--"),
  endTime: formatTimeInTimeZone(row.endAt, timeZone, "--:--"),
  status: row.status,
})

export const intervalsOverlap = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) =>
  aStart < bEnd && aEnd > bStart

export async function findOverlappingIntervals(
  db: DbClient,
  payload: {
    organizationId: string
    employeeId: string
    startAt: Date
    endAt: Date
    excludeIntervalId?: string
    timeZone?: string | null
  },
) {
  const { organizationId, employeeId, startAt, endAt, excludeIntervalId, timeZone } = payload
  const overlaps = await db.workInterval.findMany({
    where: {
      employeeId,
      status: { in: CONFLICT_RELEVANT_STATUSES as unknown as string[] },
      workday: { organizationId },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
      ...(excludeIntervalId ? { id: { not: excludeIntervalId } } : {}),
    },
    include: {
      workday: { select: { workDate: true } },
      employee: { include: { user: { select: { fullName: true } } } },
      position: { select: { name: true } },
    },
    orderBy: { startAt: "asc" },
  })

  return overlaps.map((row) => toSummary(row, timeZone))
}

export async function loadIntervalConflictSummariesByIds(
  db: DbClient,
  payload: {
    organizationId: string
    ids: string[]
    timeZone?: string | null
  },
) {
  const ids = Array.from(new Set(payload.ids.filter(Boolean)))
  if (ids.length === 0) return new Map<string, IntervalConflictSummary>()

  const rows = await db.workInterval.findMany({
    where: {
      id: { in: ids },
      workday: { organizationId: payload.organizationId },
    },
    include: {
      workday: { select: { workDate: true } },
      employee: { include: { user: { select: { fullName: true } } } },
      position: { select: { name: true } },
    },
  })

  return new Map(rows.map((row) => [row.id, toSummary(row, payload.timeZone)]))
}

export async function recomputeEmployeeConflictStatuses(
  db: DbClient,
  payload: {
    organizationId: string
    employeeId: string
  },
) {
  const clearIrrelevantConflictLinks = () =>
    db.workInterval.updateMany({
      where: {
        employeeId: payload.employeeId,
        workday: { organizationId: payload.organizationId },
        status: { notIn: CONFLICT_RELEVANT_STATUSES as unknown as string[] },
        conflictWithIntervalIds: { isEmpty: false },
      },
      data: { conflictWithIntervalIds: [] },
    })

  const intervals = await db.workInterval.findMany({
    where: {
      employeeId: payload.employeeId,
      workday: { organizationId: payload.organizationId },
      status: { in: CONFLICT_RELEVANT_STATUSES as unknown as string[] },
    },
    select: {
      id: true,
      startAt: true,
      endAt: true,
      status: true,
      conflictWithIntervalIds: true,
    },
    orderBy: [{ startAt: "asc" }, { id: "asc" }],
  })

  if (intervals.length === 0) {
    await clearIrrelevantConflictLinks()
    return
  }

  const conflictsById = new Map<string, Set<string>>()
  const ensureSet = (id: string) => {
    let set = conflictsById.get(id)
    if (!set) {
      set = new Set<string>()
      conflictsById.set(id, set)
    }
    return set
  }

  for (let i = 0; i < intervals.length; i += 1) {
    const left = intervals[i]
    for (let j = i + 1; j < intervals.length; j += 1) {
      const right = intervals[j]
      if (!intervalsOverlap(left.startAt, left.endAt, right.startAt, right.endAt)) {
        continue
      }
      ensureSet(left.id).add(right.id)
      ensureSet(right.id).add(left.id)
    }
  }

  const updates: Promise<unknown>[] = []
  for (const interval of intervals as ConflictCandidate[]) {
    if (!isConflictRelevantStatus(interval.status)) continue
    const nextConflictIds = Array.from(conflictsById.get(interval.id) ?? []).sort()
    const nextStatus: ConflictRelevantStatus =
      nextConflictIds.length > 0 ? "conflict" : "scheduled"

    const storedIds = Array.from(interval.conflictWithIntervalIds ?? []).sort()
    const statusChanged = interval.status !== nextStatus
    const idsChanged = !arraysEqual(storedIds, nextConflictIds)
    if (!statusChanged && !idsChanged) continue

    updates.push(
      db.workInterval.update({
        where: { id: interval.id },
        data: {
          status: nextStatus,
          conflictWithIntervalIds: nextConflictIds,
        },
      }),
    )
  }

  if (updates.length > 0) {
    await Promise.all(updates)
  }

  await clearIrrelevantConflictLinks()
}
