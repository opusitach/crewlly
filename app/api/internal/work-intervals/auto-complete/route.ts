import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isAuthorizedInternalCronRequest } from "@/lib/internal-cron"
import { toEventActorName, toEventDateLabel } from "@/lib/notifications/owner-events"
import { toNotificationDateOnly } from "@/lib/notifications/navigation"
import {
  AUTO_CLOSE_AFTER_HOURS,
  AUTO_CLOSE_REASON,
  finalizeWorkIntervalClose,
  isProceduresSchemaMissing,
  resolveWorkIntervalAutoCloseAt,
} from "@/lib/work-intervals/close"

const BATCH_LIMIT = 200
const CRON_SECRET_ENV_KEY = "STALE_SHIFT_AUTO_CLOSE_CRON_SECRET"

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

export async function POST(request: Request) {
  if (!isAuthorizedInternalCronRequest(request, CRON_SECRET_ENV_KEY)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

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
    return NextResponse.json({
      ok: true,
      scanned: candidates.length,
      closed: 0,
      failed: 0,
      warnings: 0,
      autoCloseAfterHours: AUTO_CLOSE_AFTER_HOURS,
      nextAction: "idle",
    })
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

  return NextResponse.json({
    ok: failed.length === 0,
    scanned: candidates.length,
    matched: staleCandidates.length,
    closed: closed.length,
    warnings,
    failed: failed.length,
    closedIntervals: closed,
    failures: failed,
    autoCloseAfterHours: AUTO_CLOSE_AFTER_HOURS,
    nextAction: candidates.length === BATCH_LIMIT ? "run_again" : "idle",
  })
}
