import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isAuthorizedInternalCronRequest } from "@/lib/internal-cron"
import { logAuditEvent } from "@/lib/observability/audit"
import {
  classifyWorkIntervalConsistencyDrift,
  WORK_INTERVAL_CONSISTENCY_CANDIDATE_WHERE,
  WORK_INTERVAL_CONSISTENCY_SAMPLE_LIMIT,
  WORK_INTERVAL_CONSISTENCY_SCAN_LIMIT,
} from "@/lib/work-intervals/consistency"

const CRON_SECRET_ENV_KEYS = ["INTERNAL_CRON_SECRET", "WORK_INTERVAL_CONSISTENCY_CRON_SECRET"] as const
const ROUTE_PATH = "/api/internal/work-intervals/consistency-check"
const EVENT_TYPE = "cron.work_interval_consistency.run"
const CRON_TARGET = {
  type: "internal_cron",
  id: "work_interval_consistency_monitor",
} as const

function logConsistencyAuditEvent(
  request: Request,
  input: {
    outcome: "success" | "denied" | "failure"
    status: number
    reason?: string
    metadata?: Record<string, unknown>
  },
) {
  logAuditEvent(request, {
    event_type: EVENT_TYPE,
    outcome: input.outcome,
    status: input.status,
    route: ROUTE_PATH,
    target: CRON_TARGET,
    reason: input.reason,
    metadata: input.metadata,
  })
}

export async function POST(request: Request) {
  if (!isAuthorizedInternalCronRequest(request, CRON_SECRET_ENV_KEYS)) {
    logConsistencyAuditEvent(request, {
      outcome: "denied",
      status: 401,
      reason: "unauthorized",
    })
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const candidates = await prisma.workInterval.findMany({
      where: WORK_INTERVAL_CONSISTENCY_CANDIDATE_WHERE,
      select: {
        id: true,
        employeeId: true,
        workdayId: true,
        status: true,
        startAt: true,
        endAt: true,
        openedAt: true,
        closedAt: true,
        updatedAt: true,
        conflictWithIntervalIds: true,
        timeEntry: {
          select: {
            clockInAt: true,
            clockOutAt: true,
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: WORK_INTERVAL_CONSISTENCY_SCAN_LIMIT,
    })

    const drifts = candidates
      .map((candidate) => classifyWorkIntervalConsistencyDrift(candidate))
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate != null)

    const driftCountsByCode = Object.fromEntries(
      drifts.flatMap((drift) => drift.driftCodes).reduce((map, code) => {
        map.set(code, (map.get(code) ?? 0) + 1)
        return map
      }, new Map<string, number>()),
    )

    const sampledIntervals = drifts.slice(0, WORK_INTERVAL_CONSISTENCY_SAMPLE_LIMIT)
    const truncated = candidates.length === WORK_INTERVAL_CONSISTENCY_SCAN_LIMIT
    const responseBody = {
      ok: drifts.length === 0 && !truncated,
      scannedCandidates: candidates.length,
      driftCount: drifts.length,
      truncated,
      driftCountsByCode,
      sampledIntervals,
      sampleLimit: WORK_INTERVAL_CONSISTENCY_SAMPLE_LIMIT,
      scanLimit: WORK_INTERVAL_CONSISTENCY_SCAN_LIMIT,
      nextAction: drifts.length === 0 && !truncated ? "idle" : "investigate",
    }

    logConsistencyAuditEvent(request, {
      outcome: responseBody.ok ? "success" : "failure",
      status: 200,
      reason: responseBody.ok ? undefined : truncated && drifts.length === 0 ? "scan_limit_reached" : "drift_detected",
      metadata: {
        ...responseBody,
        sampledIntervalIds: sampledIntervals.map((interval) => interval.intervalId),
      },
    })

    return NextResponse.json(responseBody)
  } catch (error) {
    console.error("[api/internal/work-intervals/consistency-check]", error)
    logConsistencyAuditEvent(request, {
      outcome: "failure",
      status: 500,
      reason: "server_error",
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
    })
    return NextResponse.json({ error: "Не удалось проверить консистентность смен." }, { status: 500 })
  }
}
