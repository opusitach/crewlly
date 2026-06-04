import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getAuthorizedInterval } from "@/lib/procedures/access"
import { applyOwnerEditedWorkIntervalTime, WorkIntervalOwnerEditError } from "@/lib/work-intervals/owner-edit"
import { toNotificationDateOnly } from "@/lib/notifications/navigation"
import { auditActorFromSession, logAuditEvent } from "@/lib/observability/audit"
import { combineDateAndTimeInTimeZone, formatTimeInTimeZone } from "@/lib/utils/timezone"

type RouteContext = { params: Promise<{ id: string }> }

const hhMmPattern = /^([01]\d|2[0-3]):([0-5]\d)$/

const ownerEditPayloadSchema = z.object({
  openedTime: z.string().regex(hhMmPattern),
  closedTime: z.string().regex(hhMmPattern),
  openedAt: z.string().datetime({ offset: true }).optional(),
  closedAt: z.string().datetime({ offset: true }).optional(),
  reason: z.string().trim().min(1).max(500),
})

const formatTimeLabel = (date: Date, timeZone?: string | null) => formatTimeInTimeZone(date, timeZone, "--:--")

const formatWorkdayDateLabel = (date: Date) =>
  date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })

const parseTimeOnWorkDate = (workDate: Date, value: string, timeZone?: string | null) => {
  const match = hhMmPattern.exec(value)
  if (!match) return null

  return combineDateAndTimeInTimeZone(workDate, `${match[1]}:${match[2]}`, timeZone)
}

const resolveActualRange = (workDate: Date, openedTime: string, closedTime: string, timeZone?: string | null) => {
  const openedAt = parseTimeOnWorkDate(workDate, openedTime, timeZone)
  const closedAt = parseTimeOnWorkDate(workDate, closedTime, timeZone)
  if (!openedAt || !closedAt) return null

  if (closedAt.getTime() < openedAt.getTime()) {
    closedAt.setDate(closedAt.getDate() + 1)
  }

  return { openedAt, closedAt }
}

const resolveActualRangeFromPayload = (
  payload: z.infer<typeof ownerEditPayloadSchema>,
  workDate: Date,
  timeZone?: string | null,
) => {
  if (payload.openedAt && payload.closedAt) {
    const openedAt = new Date(payload.openedAt)
    const closedAt = new Date(payload.closedAt)
    if (!Number.isNaN(openedAt.getTime()) && !Number.isNaN(closedAt.getTime())) {
      return { openedAt, closedAt }
    }
  }

  return resolveActualRange(workDate, payload.openedTime, payload.closedTime, timeZone)
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params
  const authorization = await getAuthorizedInterval(id)
  const access = authorization.access
  const actor = auditActorFromSession(access ? {
    user: { id: access.user.id, primaryMode: access.user.primaryMode },
    organization: { id: access.organizationId },
    accessRole: { key: access.effectiveRoleKey },
  } : null)
  const organizationTimeZone = access?.organization?.timezone ?? null

  if (authorization.error || !authorization.interval) {
    logAuditEvent(request, {
      event_type: "interval.owner_edit_time",
      outcome: authorization.status === 401 || authorization.status === 403 ? "denied" : "failure",
      status: authorization.status,
      route: "/api/work-intervals/[id]/owner-edit",
      actor,
      target: {
        type: "interval",
        id,
        organization_id: access?.organizationId ?? null,
      },
      reason: authorization.error ?? "authorization_failed",
    })
    return NextResponse.json({ error: authorization.error }, { status: authorization.status })
  }

  if (!authorization.isOwner) {
    logAuditEvent(request, {
      event_type: "interval.owner_edit_time",
      outcome: "denied",
      status: 403,
      route: "/api/work-intervals/[id]/owner-edit",
      actor,
      target: {
        type: "interval",
        id: authorization.interval.id,
        organization_id: authorization.interval.workday.organizationId,
        workday_id: authorization.interval.workday.id,
        employee_id: authorization.interval.employeeId,
      },
      reason: "owner_role_required",
    })
    return NextResponse.json({ error: "Только владелец может изменять фактическое время смены" }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const parsed = ownerEditPayloadSchema.safeParse(body)
  if (!parsed.success) {
    logAuditEvent(request, {
      event_type: "interval.owner_edit_time",
      outcome: "failure",
      status: 400,
      route: "/api/work-intervals/[id]/owner-edit",
      actor,
      target: {
        type: "interval",
        id: authorization.interval.id,
        organization_id: authorization.interval.workday.organizationId,
        workday_id: authorization.interval.workday.id,
        employee_id: authorization.interval.employeeId,
      },
      reason: "invalid_payload",
      metadata: {
        errors: parsed.error.flatten(),
      },
    })
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  if (authorization.effectiveStatus !== "completed") {
    logAuditEvent(request, {
      event_type: "interval.owner_edit_time",
      outcome: "failure",
      status: 409,
      route: "/api/work-intervals/[id]/owner-edit",
      actor,
      target: {
        type: "interval",
        id: authorization.interval.id,
        organization_id: authorization.interval.workday.organizationId,
        workday_id: authorization.interval.workday.id,
        employee_id: authorization.interval.employeeId,
      },
      reason: "interval_not_completed",
      metadata: {
        effective_status: authorization.effectiveStatus ?? null,
      },
    })
    return NextResponse.json({ error: "Изменять фактическое время можно только у закрытой смены" }, { status: 409 })
  }

  const actualRange = resolveActualRangeFromPayload(parsed.data, authorization.interval.workday.workDate, organizationTimeZone)
  if (!actualRange) {
    logAuditEvent(request, {
      event_type: "interval.owner_edit_time",
      outcome: "failure",
      status: 400,
      route: "/api/work-intervals/[id]/owner-edit",
      actor,
      target: {
        type: "interval",
        id: authorization.interval.id,
        organization_id: authorization.interval.workday.organizationId,
        workday_id: authorization.interval.workday.id,
        employee_id: authorization.interval.employeeId,
      },
      reason: "invalid_time_range",
      metadata: {
        opened_time: parsed.data.openedTime,
        closed_time: parsed.data.closedTime,
      },
    })
    return NextResponse.json({ error: "Некорректный формат времени" }, { status: 400 })
  }

  const previousOpenedAt = authorization.effectiveOpenedAt ?? authorization.interval.openedAt ?? null
  const previousClosedAt = authorization.effectiveClosedAt ?? authorization.interval.closedAt ?? null
  const notificationWorkDate =
    toNotificationDateOnly(authorization.interval.workday.workDate) ??
    authorization.interval.workday.workDate.toISOString().slice(0, 10)
  const employeeNotification =
    authorization.interval.employeeId &&
    access?.organizationId &&
    access?.user?.id &&
    notificationWorkDate
      ? {
          organizationId: access!.organizationId,
          userId: "",
          title: "Изменены фактические часы смены",
          message: "",
          payload: {
            view: "worker_planner",
            intervalId: authorization.interval.id,
            workDate: notificationWorkDate,
            openWeekView: true,
          },
        }
      : null

  try {
    const result = await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findUnique({
        where: { id: authorization.interval.employeeId },
        select: { userId: true },
      })

      const nextNotification =
        employeeNotification && employee?.userId && employee.userId !== access?.user?.id
          ? {
              ...employeeNotification,
              userId: employee.userId,
              message: `Владелец изменил фактическое время вашей смены на ${formatWorkdayDateLabel(authorization.interval.workday.workDate)}: ${parsed.data.openedTime}–${parsed.data.closedTime}. Причина: ${parsed.data.reason}`,
            }
          : null

      return applyOwnerEditedWorkIntervalTime(tx, {
        intervalId: authorization.interval.id,
        ownerUserId: access?.user?.id ?? "",
        openedAt: actualRange.openedAt,
        closedAt: actualRange.closedAt,
        reason: parsed.data.reason,
        employeeNotification: nextNotification,
      })
    })

    logAuditEvent(request, {
      event_type: "interval.owner_edit_time",
      outcome: "success",
      status: 200,
      route: "/api/work-intervals/[id]/owner-edit",
      actor,
      target: {
        type: "interval",
        id: result.interval.id,
        organization_id: authorization.interval.workday.organizationId,
        workday_id: authorization.interval.workday.id,
        employee_id: authorization.interval.employeeId,
      },
      metadata: {
        reason: parsed.data.reason,
        previous_opened_at: previousOpenedAt?.toISOString?.() ?? previousOpenedAt ?? null,
        previous_closed_at: previousClosedAt?.toISOString?.() ?? previousClosedAt ?? null,
        next_opened_at: actualRange.openedAt.toISOString(),
        next_closed_at: actualRange.closedAt.toISOString(),
        next_opened_time: formatTimeLabel(actualRange.openedAt, organizationTimeZone),
        next_closed_time: formatTimeLabel(actualRange.closedAt, organizationTimeZone),
        revenue_updated_intervals: result.revenueSync.updatedIntervals,
        recalculated_intervals: result.recalculatedIntervals,
        tips_total_amount_cents: result.tipsSync.totalAmountCents,
      },
    })

    return NextResponse.json({
      data: {
        id: result.interval.id,
        openedAt: result.interval.openedAt?.toISOString() ?? null,
        closedAt: result.interval.closedAt?.toISOString() ?? null,
        calculatedMinutesWorked: result.interval.calculatedMinutesWorked ?? null,
        calculatedGrossPayCents: result.interval.calculatedGrossPayCents ?? null,
        payCalculatedAt: result.interval.payCalculatedAt?.toISOString() ?? null,
        workdayId: result.interval.workdayId,
        workday: {
          id: result.interval.workday.id,
          workDate: result.interval.workday.workDate.toISOString().split("T")[0],
          status: result.interval.workday.status,
        },
        employee: {
          id: result.interval.employee.id,
          fullName: result.interval.employee.user.fullName,
          avatarUrl: result.interval.employee.user.avatarUrl,
        },
        position: result.interval.position,
        timeEntry: result.interval.timeEntry
          ? {
              id: result.interval.timeEntry.id,
              clockInAt: result.interval.timeEntry.clockInAt?.toISOString() ?? null,
              clockOutAt: result.interval.timeEntry.clockOutAt?.toISOString() ?? null,
              clockInPhotoUrl: result.interval.timeEntry.clockInPhotoUrl,
              clockOutPhotoUrl: result.interval.timeEntry.clockOutPhotoUrl,
            }
          : null,
      },
      meta: {
        revenueUpdatedIntervals: result.revenueSync.updatedIntervals,
        recalculatedIntervals: result.recalculatedIntervals,
      },
    })
  } catch (error) {
    if (error instanceof WorkIntervalOwnerEditError) {
      logAuditEvent(request, {
        event_type: "interval.owner_edit_time",
        outcome: error.status === 403 ? "denied" : "failure",
        status: error.status,
        route: "/api/work-intervals/[id]/owner-edit",
        actor,
        target: {
          type: "interval",
          id: authorization.interval.id,
          organization_id: authorization.interval.workday.organizationId,
          workday_id: authorization.interval.workday.id,
          employee_id: authorization.interval.employeeId,
        },
        reason: error.code,
        metadata: {
          requested_opened_time: parsed.data.openedTime,
          requested_closed_time: parsed.data.closedTime,
        },
      })
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("[api/work-intervals/[id]/owner-edit]", error)
    logAuditEvent(request, {
      event_type: "interval.owner_edit_time",
      outcome: "failure",
      status: 500,
      route: "/api/work-intervals/[id]/owner-edit",
      actor,
      target: {
        type: "interval",
        id: authorization.interval.id,
        organization_id: authorization.interval.workday.organizationId,
        workday_id: authorization.interval.workday.id,
        employee_id: authorization.interval.employeeId,
      },
      reason: "server_error",
    })
    return NextResponse.json({ error: "Не удалось изменить фактическое время смены" }, { status: 500 })
  }
}
