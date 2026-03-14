import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getAuthorizedInterval } from "@/lib/procedures/access"
import { recomputeEmployeeConflictStatuses } from "@/lib/work-interval-conflicts"
import { notifyOrganizationOwners, toEventActorName, toEventDateLabel } from "@/lib/notifications/owner-events"
import { toNotificationDateOnly } from "@/lib/notifications/navigation"

type RouteContext = { params: Promise<{ id: string }> }
const cancelSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, "Укажите причину отмены (минимум 3 символа).")
    .max(500, "Причина отмены слишком длинная (максимум 500 символов)."),
})

const buildCancelErrorResponse = (error: unknown) => {
  console.error("[api/work-intervals/cancel]", error)
  return NextResponse.json({ error: "Не удалось отменить смену." }, { status: 500 })
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params
  const { session, interval, effectiveStatus, effectiveClosedAt, error, status } = await getAuthorizedInterval(id)
  if (error || !interval || !session?.organization) {
    return NextResponse.json({ error }, { status })
  }
  const resolvedStatus = effectiveStatus ?? interval.status
  const resolvedClosedAt = effectiveClosedAt ?? interval.closedAt ?? interval.timeEntry?.clockOutAt ?? null
  const organizationId = session.organization.id

  const json = await request.json().catch(() => null)
  const parsed = cancelSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Укажите причину отмены смены.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    )
  }

  if (resolvedStatus === "completed") {
    return NextResponse.json({ error: "Смена уже завершена." }, { status: 409 })
  }
  if (resolvedStatus === "canceled") {
    return NextResponse.json({ error: "Смена уже отменена." }, { status: 409 })
  }
  if (resolvedStatus !== "scheduled") {
    return NextResponse.json(
      {
        error: "Отменить можно только запланированную смену.",
      },
      { status: 409 },
    )
  }

  const actorName = toEventActorName(
    { fullName: session.user.fullName, email: session.user.email },
    "Сотрудник",
  )
  const workDateLabel = toEventDateLabel(interval.workday.workDate)
  const notificationWorkDate = toNotificationDateOnly(interval.workday.workDate)
  const notificationMessage = workDateLabel
    ? `${actorName} отменил(а) рабочую смену (${workDateLabel}). Причина: ${parsed.data.reason}`
    : `${actorName} отменил(а) рабочую смену. Причина: ${parsed.data.reason}`

  try {
    const result = await prisma.$transaction(async (tx) => {
      const canceled = await tx.workInterval.update({
        where: { id: interval.id },
        data: {
          status: "canceled",
          cancelReason: parsed.data.reason,
          closedAt: resolvedClosedAt ?? new Date(),
        },
      })

      await recomputeEmployeeConflictStatuses(tx, {
        organizationId,
        employeeId: interval.employeeId,
      })

      await notifyOrganizationOwners(tx, {
        organizationId,
        type: "shift",
        title: "Отменена рабочая смена",
        message: notificationMessage,
        payload: {
          view: "owner_shifts",
          intervalId: interval.id,
          ...(notificationWorkDate ? { workDate: notificationWorkDate } : {}),
        },
      })

      return canceled
    })

    return NextResponse.json({ data: result })
  } catch (cancelError) {
    return buildCancelErrorResponse(cancelError)
  }
}
