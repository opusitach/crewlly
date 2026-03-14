import type { Prisma } from "@prisma/client"
import { resolveEffectiveWorkIntervalStatus } from "@/lib/work-intervals/status"

export const WORK_INTERVAL_CONSISTENCY_SCAN_LIMIT = 500
export const WORK_INTERVAL_CONSISTENCY_SAMPLE_LIMIT = 50

export const WORK_INTERVAL_CONSISTENCY_DRIFT_CODES = [
  "status_effective_mismatch",
  "opened_at_missing_for_clock_in",
  "closed_at_missing_for_clock_out",
  "completed_without_close_evidence",
  "canceled_with_runtime_activity",
  "invalid_runtime_order",
] as const

export type WorkIntervalConsistencyDriftCode = (typeof WORK_INTERVAL_CONSISTENCY_DRIFT_CODES)[number]

export type WorkIntervalConsistencyCandidate = {
  id: string
  employeeId: string
  workdayId: string
  status: string
  startAt: Date
  endAt: Date
  openedAt: Date | null
  closedAt: Date | null
  updatedAt: Date
  conflictWithIntervalIds: string[]
  timeEntry: {
    clockInAt: Date | null
    clockOutAt: Date | null
  } | null
}

export type WorkIntervalConsistencySample = {
  intervalId: string
  employeeId: string
  workdayId: string
  rawStatus: string
  effectiveStatus: string
  driftCodes: WorkIntervalConsistencyDriftCode[]
  openedAt: string | null
  closedAt: string | null
  clockInAt: string | null
  clockOutAt: string | null
  updatedAt: string
}

const hasDate = (value: Date | null | undefined): value is Date => value instanceof Date && !Number.isNaN(value.getTime())

const toIso = (value: Date | null | undefined) => (hasDate(value) ? value.toISOString() : null)

export const WORK_INTERVAL_CONSISTENCY_CANDIDATE_WHERE: Prisma.WorkIntervalWhereInput = {
  OR: [
    {
      status: { in: ["scheduled", "conflict", "completed"] },
      OR: [
        {
          openedAt: { not: null },
          closedAt: null,
        },
        {
          timeEntry: {
            is: {
              clockInAt: { not: null },
              clockOutAt: null,
            },
          },
        },
      ],
    },
    {
      status: { notIn: ["completed", "canceled"] },
      OR: [
        { closedAt: { not: null } },
        {
          timeEntry: {
            is: {
              clockOutAt: { not: null },
            },
          },
        },
      ],
    },
    {
      status: "completed",
      closedAt: null,
      OR: [
        { timeEntry: { is: null } },
        { timeEntry: { is: { clockOutAt: null } } },
      ],
    },
    {
      status: "canceled",
      OR: [
        { openedAt: { not: null } },
        {
          timeEntry: {
            is: {
              clockInAt: { not: null },
            },
          },
        },
        {
          timeEntry: {
            is: {
              clockOutAt: { not: null },
            },
          },
        },
      ],
    },
    {
      openedAt: null,
      timeEntry: {
        is: {
          clockInAt: { not: null },
        },
      },
    },
    {
      closedAt: null,
      timeEntry: {
        is: {
          clockOutAt: { not: null },
        },
      },
    },
  ],
}

export function classifyWorkIntervalConsistencyDrift(
  interval: WorkIntervalConsistencyCandidate,
): WorkIntervalConsistencySample | null {
  const driftCodes = new Set<WorkIntervalConsistencyDriftCode>()
  const effectiveStatus = resolveEffectiveWorkIntervalStatus(interval)
  const { status: rawStatus } = interval
  const clockInAt = interval.timeEntry?.clockInAt ?? null
  const clockOutAt = interval.timeEntry?.clockOutAt ?? null

  if (effectiveStatus !== rawStatus) {
    driftCodes.add("status_effective_mismatch")
  }
  if (hasDate(clockInAt) && !hasDate(interval.openedAt)) {
    driftCodes.add("opened_at_missing_for_clock_in")
  }
  if (hasDate(clockOutAt) && !hasDate(interval.closedAt)) {
    driftCodes.add("closed_at_missing_for_clock_out")
  }
  if (rawStatus === "completed" && !hasDate(interval.closedAt) && !hasDate(clockOutAt)) {
    driftCodes.add("completed_without_close_evidence")
  }
  if (rawStatus === "canceled" && (hasDate(interval.openedAt) || hasDate(clockInAt) || hasDate(clockOutAt))) {
    driftCodes.add("canceled_with_runtime_activity")
  }
  if (
    (hasDate(interval.openedAt) && hasDate(interval.closedAt) && interval.closedAt.getTime() < interval.openedAt.getTime()) ||
    (hasDate(clockInAt) && hasDate(clockOutAt) && clockOutAt.getTime() < clockInAt.getTime())
  ) {
    driftCodes.add("invalid_runtime_order")
  }

  if (driftCodes.size === 0) return null

  return {
    intervalId: interval.id,
    employeeId: interval.employeeId,
    workdayId: interval.workdayId,
    rawStatus,
    effectiveStatus,
    driftCodes: Array.from(driftCodes),
    openedAt: toIso(interval.openedAt),
    closedAt: toIso(interval.closedAt),
    clockInAt: toIso(clockInAt),
    clockOutAt: toIso(clockOutAt),
    updatedAt: interval.updatedAt.toISOString(),
  }
}
