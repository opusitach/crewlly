import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isAuthorizedInternalCronRequest } from "@/lib/internal-cron"
import { toEventActorName, toEventDateLabel } from "@/lib/notifications/owner-events"
import { toNotificationDateOnly } from "@/lib/notifications/navigation"
import { logAuditEvent } from "@/lib/observability/audit"
import {
  AUTO_CLOSE_AFTER_HOURS,
  AUTO_CLOSE_REASON,
  finalizeWorkIntervalClose,
  isProceduresSchemaMissing,
  resolveWorkIntervalAutoCloseAt,
} from "@/lib/work-intervals/close"

const BATCH_LIMIT = 200
const CRON_SECRET_ENV_KEY = "STALE_SHIFT_AUTO_CLOSE_CRON_SECRET"
const ROUTE_PATH = "/api/internal/work-intervals/auto-complete"
const EVENT_TYPE = "cron.shift_auto_close.run"
const CRON_TARGET = {
  type: "internal_cron",
  id: "shift_auto_close",
} as const

function buildAutoCloseMessage(input: {
  employeeName: string
  workDate: Date
  closedAt: Date
}) {
  const workDateLabel = toEventDateLabel(input.workDate)
  const closedAtLabel = input.closedAt.toISOString()

  if (workDateLabel) {
    return `Система автоматически завершила рабочую смену сотрудника ${input.employeeName} (${workDateLabel}) после ${AUTO_CLOSE_AFTER_HOURS} часов в статусе "Идет". Время завершения: ${closedAtLabel}.`
  }

  return `Система автоматически завершила рабочую смену сотрудника ${input.employeeName} после ${AUTO_CLOSE_AFTER_HOURS} часов в статусе "Идет". Время завершения: ${closedAtLabel}.`
}

function logAutoCloseAuditEvent(
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
  if (!isAuthorizedInternalCronRequest(request, CRON_SECRET_ENV_KEY)) {
    logAutoCloseAuditEvent(request, {
      outcome: "denied",
      status: 401,
      reason: "unauthorized",
    })
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const now = new Date()
    const cutoff = new Date(now.getTime() - AUTO_CLOSE_AFTER_HOURS * 60 * 60 * 1000)

    const candidates = await prisma.workInterval.findMany({
      where: {
        status: "in_progress",
        OR: [
          {
            openedAt: {
              not: null,
              lte: cutoff,
            },
          },
          {
            openedAt: null,
            timeEntry: {
              is: {
                clockInAt: {
                  not: null,
                  lte: cutoff,
                },
              },
            },
          },
          {
            openedAt: null,
            OR: [
              { timeEntry: { is: null } },
              { timeEntry: { is: { clockInAt: null } } },
            ],
            startAt: {
              lte: cutoff,
            },
          },
        ],
      },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
      take: BATCH_LIMIT,
      select: {
        id: true,
        startAt: true,
        openedAt: true,
        timeEntry: {
          select: {
            clockInAt: true,
            clockOutAt: true,
          },
        },
        employee: {
          select: {
            user: {
              select: {
                fullName: true,
                email: true,
              },
            },
          },
        },
        workday: {
          select: {
            id: true,
            organizationId: true,
            locationId: true,
            workDate: true,
          },
        },
      },
    })

    const staleCandidates = candidates
      .map((interval) => ({
        ...interval,
        autoClosedAt: resolveWorkIntervalAutoCloseAt({
          startAt: interval.startAt,
          openedAt: interval.openedAt,
          timeEntry: interval.timeEntry,
        }),
      }))
      .filter((interval) => interval.autoClosedAt.getTime() <= now.getTime())

    if (staleCandidates.length === 0) {
      const responseBody = {
        ok: true,
        scanned: candidates.length,
        matched: 0,
        closed: 0,
        failed: 0,
        warnings: 0,
        autoCloseAfterHours: AUTO_CLOSE_AFTER_HOURS,
        nextAction: "idle",
      }
      logAutoCloseAuditEvent(request, {
        outcome: "success",
        status: 200,
        metadata: responseBody,
      })
      return NextResponse.json(responseBody)
    }

    const closed: Array<{ id: string; closedAt: string; fallback: boolean }> = []
    const failed: Array<{ id: string; error: string }> = []
    let warnings = 0

    for (const interval of staleCandidates) {
      const employeeName = toEventActorName(interval.employee.user, "Сотрудник")
      const closedAt = interval.timeEntry?.clockOutAt ?? interval.autoClosedAt
      const notificationWorkDate = toNotificationDateOnly(interval.workday.workDate)
      const notification = {
        organizationId: interval.workday.organizationId,
        title: "Смена автоматически завершена",
        message: buildAutoCloseMessage({
          employeeName,
          workDate: interval.workday.workDate,
          closedAt,
        }),
        payload: {
          view: "owner_cash",
          cashTab: "review_queue",
          intervalId: interval.id,
          ...(notificationWorkDate ? { workDate: notificationWorkDate } : {}),
        },
        excludeUserId: null,
      }

      try {
        const result = await prisma.$transaction(async (tx) =>
          finalizeWorkIntervalClose(tx, {
            intervalId: interval.id,
            workdayId: interval.workday.id,
            locationId: interval.workday.locationId,
            closedAt,
            closedByOwnerId: null,
            closeOverrideReason: AUTO_CLOSE_REASON,
            notification,
          }),
        )

        closed.push({
          id: interval.id,
          closedAt: result.closedAt.toISOString(),
          fallback: false,
        })
      } catch (error) {
        if (isProceduresSchemaMissing(error)) {
          warnings += 1

          try {
            const result = await prisma.$transaction(async (tx) =>
              finalizeWorkIntervalClose(tx, {
                intervalId: interval.id,
                workdayId: interval.workday.id,
                locationId: interval.workday.locationId,
                closedAt,
                closedByOwnerId: null,
                closeOverrideReason: AUTO_CLOSE_REASON,
                notification,
                syncWorkday: false,
              }),
            )

            closed.push({
              id: interval.id,
              closedAt: result.closedAt.toISOString(),
              fallback: true,
            })
            continue
          } catch (fallbackError) {
            failed.push({
              id: interval.id,
              error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
            })
            continue
          }
        }

        failed.push({
          id: interval.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const responseBody = {
      ok: true,
      scanned: candidates.length,
      matched: staleCandidates.length,
      closed: closed.length,
      warnings,
      failed: failed.length,
      closedIntervals: closed,
      failures: failed,
      autoCloseAfterHours: AUTO_CLOSE_AFTER_HOURS,
      nextAction: candidates.length === BATCH_LIMIT ? "run_again" : "idle",
    }

    responseBody.ok = failed.length === 0

    logAutoCloseAuditEvent(request, {
      outcome: failed.length === 0 ? "success" : "failure",
      status: 200,
      reason: failed.length === 0 ? undefined : "partial_failure",
      metadata: {
        ...responseBody,
        closedIntervalIds: closed.map((interval) => interval.id),
        failureIds: failed.map((interval) => interval.id),
      },
    })

    return NextResponse.json(responseBody)
  } catch (error) {
    console.error("[api/internal/work-intervals/auto-complete]", error)
    logAutoCloseAuditEvent(request, {
      outcome: "failure",
      status: 500,
      reason: "server_error",
      metadata: {
        error: error instanceof Error ? error.message : String(error),
        autoCloseAfterHours: AUTO_CLOSE_AFTER_HOURS,
      },
    })
    return NextResponse.json({ error: "Не удалось автоматически завершить смены." }, { status: 500 })
  }
}
