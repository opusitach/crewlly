import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSessionUserWithOrg, getUserEmployee } from "@/lib/auth"
import { computeIntervalPayrollSnapshot } from "@/lib/payroll/interval-compensation"
import { notifyOrganizationOwners, toEventActorName, toEventDateLabel } from "@/lib/notifications/owner-events"
import { toNotificationDateOnly } from "@/lib/notifications/navigation"
import { auditActorFromSession, logAuditEvent } from "@/lib/observability/audit"

const clockSchema = z.object({
  intervalId: z.string().uuid(),
  action: z.enum(["in", "out"]),
  photoUrl: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
})

export async function POST(request: Request) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    logAuditEvent(request, {
      event_type: "clock.action",
      outcome: "denied",
      status: 401,
      route: "/api/clock",
      reason: "unauthorized",
    })
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const organizationId = session.organization.id
  const actor = auditActorFromSession(session)

  const json = await request.json().catch(() => null)
  const parsed = clockSchema.safeParse(json)
  if (!parsed.success) {
    logAuditEvent(request, {
      event_type: "clock.action",
      outcome: "failure",
      status: 400,
      route: "/api/clock",
      actor,
      target: {
        type: "organization",
        id: organizationId,
        organization_id: organizationId,
      },
      reason: "validation_error",
    })
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { intervalId, action, photoUrl, lat, lng } = parsed.data
  const eventType = action === "in" ? "clock.in" : "clock.out"

  // Get the work interval
  const interval = await prisma.workInterval.findFirst({
    where: { id: intervalId },
    include: { workday: true },
  })

  if (!interval || interval.workday.organizationId !== session.organization.id) {
    logAuditEvent(request, {
      event_type: eventType,
      outcome: "failure",
      status: 404,
      route: "/api/clock",
      actor,
      target: {
        type: "interval",
        id: intervalId,
        organization_id: organizationId,
      },
      reason: "interval_not_found",
    })
    return NextResponse.json({ error: "Интервал не найден" }, { status: 404 })
  }

  if (interval.status === "canceled") {
    return NextResponse.json({ error: "Смена отменена" }, { status: 409 })
  }
  if (interval.status === "completed") {
    return NextResponse.json({ error: "Смена уже завершена" }, { status: 409 })
  }
  if (interval.status === "conflict") {
    return NextResponse.json({ error: "Смена в конфликте. Требуется корректировка расписания." }, { status: 409 })
  }

  // Get employee record for current user
  const employee = await getUserEmployee(session.user.id, session.organization.id)
  
  // Verify the interval belongs to this employee or user has permission
  const isOwn = employee && interval.employeeId === employee.id
  const isManager = session.accessRole?.key === "owner" || session.accessRole?.key === "manager"
  
  if (!isOwn && !isManager) {
    logAuditEvent(request, {
      event_type: eventType,
      outcome: "denied",
      status: 403,
      route: "/api/clock",
      actor,
      target: {
        type: "interval",
        id: intervalId,
        organization_id: organizationId,
        workday_id: interval.workdayId,
        employee_id: interval.employeeId,
      },
      reason: "not_interval_owner",
    })
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 })
  }

  const now = new Date()
  const actorName = toEventActorName({ fullName: session.user.fullName, email: session.user.email }, "Сотрудник")
  const workDateLabel = toEventDateLabel(interval.workday.workDate)
  const notificationWorkDate = toNotificationDateOnly(interval.workday.workDate)
  const openNotificationMessage = workDateLabel
    ? `${actorName} открыл(а) рабочую смену (${workDateLabel}).`
    : `${actorName} открыл(а) рабочую смену.`
  const closeNotificationMessage = workDateLabel
    ? `${actorName} закрыл(а) рабочую смену (${workDateLabel}).`
    : `${actorName} закрыл(а) рабочую смену.`

  if (action === "in") {
    const timeEntry = await prisma.$transaction(async (tx) => {
      const entry = await tx.timeEntry.upsert({
        where: { workIntervalId: intervalId },
        create: {
          workIntervalId: intervalId,
          employeeId: interval.employeeId,
          clockInAt: now,
          clockInPhotoUrl: photoUrl,
          clockInLat: lat,
          clockInLng: lng,
        },
        update: {
          clockInAt: now,
          clockInPhotoUrl: photoUrl,
          clockInLat: lat,
          clockInLng: lng,
        },
      })

      await tx.workInterval.update({
        where: { id: intervalId },
        data: { status: "in_progress" },
      })

      await notifyOrganizationOwners(tx, {
        organizationId,
        type: "shift",
        title: "Открыта рабочая смена",
        message: openNotificationMessage,
        payload: {
          view: "owner_shifts",
          intervalId,
          ...(notificationWorkDate ? { workDate: notificationWorkDate } : {}),
        },
        excludeUserId: session.user.id,
      })

      return entry
    })

    logAuditEvent(request, {
      event_type: eventType,
      outcome: "success",
      status: 200,
      route: "/api/clock",
      actor: {
        ...actor,
        employee_id: employee?.id ?? null,
      },
      target: {
        type: "interval",
        id: intervalId,
        organization_id: organizationId,
        workday_id: interval.workdayId,
        employee_id: interval.employeeId,
      },
      metadata: {
        has_photo: Boolean(photoUrl),
        has_coordinates: lat != null && lng != null,
      },
    })
    return NextResponse.json({
      data: {
        id: timeEntry.id,
        clockInAt: timeEntry.clockInAt?.toISOString(),
        clockInPhotoUrl: timeEntry.clockInPhotoUrl,
      },
    })
  } else {
    // Clock-out
    const existing = await prisma.timeEntry.findUnique({
      where: { workIntervalId: intervalId },
    })

    if (!existing) {
      logAuditEvent(request, {
        event_type: eventType,
        outcome: "failure",
        status: 400,
        route: "/api/clock",
        actor: {
          ...actor,
          employee_id: employee?.id ?? null,
        },
        target: {
          type: "interval",
          id: intervalId,
          organization_id: organizationId,
          workday_id: interval.workdayId,
          employee_id: interval.employeeId,
        },
        reason: "clock_in_required_first",
      })
      return NextResponse.json({ error: "Сначала нужно отметить приход" }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const timeEntry = await tx.timeEntry.update({
        where: { workIntervalId: intervalId },
        data: {
          clockOutAt: now,
          clockOutPhotoUrl: photoUrl,
          clockOutLat: lat,
          clockOutLng: lng,
        },
      })

      const intervalComponents = interval.useCustomPay
        ? await tx.workIntervalPayComponent.findMany({
            where: { workIntervalId: intervalId, isActive: true },
            orderBy: [{ priority: "desc" }, { componentType: "asc" }],
          })
        : []
      const employeeComponents = interval.useCustomPay
        ? []
        : await tx.employeePayComponent.findMany({
            where: { employeeId: interval.employeeId, isActive: true },
            orderBy: [{ priority: "desc" }, { componentType: "asc" }],
          })

      const snapshot = computeIntervalPayrollSnapshot({
        interval: {
          startAt: interval.startAt,
          endAt: interval.endAt,
          openedAt: interval.openedAt,
          closedAt: now,
          breakMinutes: interval.breakMinutes,
          status: "completed",
          useCustomPay: interval.useCustomPay,
          revenueCents: interval.revenueCents,
        },
        timeEntry: {
          clockInAt: timeEntry.clockInAt,
          clockOutAt: timeEntry.clockOutAt,
        },
        intervalComponents: intervalComponents.map((component) => ({
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

      await tx.workInterval.update({
        where: { id: intervalId },
        data: {
          status: "completed",
          closedAt: interval.closedAt ?? now,
          calculatedMinutesWorked: snapshot.minutesWorked,
          calculatedGrossPayCents: snapshot.grossPayCents,
          payCalculatedAt: new Date(),
        },
      })

      await notifyOrganizationOwners(tx, {
        organizationId,
        type: "shift",
        title: "Закрыта рабочая смена",
        message: closeNotificationMessage,
        payload: {
          view: "owner_cash",
          cashTab: "work_shifts",
          intervalId,
          ...(notificationWorkDate ? { workDate: notificationWorkDate } : {}),
        },
        excludeUserId: session.user.id,
      })

      return { timeEntry, snapshot }
    })

    logAuditEvent(request, {
      event_type: eventType,
      outcome: "success",
      status: 200,
      route: "/api/clock",
      actor: {
        ...actor,
        employee_id: employee?.id ?? null,
      },
      target: {
        type: "interval",
        id: intervalId,
        organization_id: organizationId,
        workday_id: interval.workdayId,
        employee_id: interval.employeeId,
      },
      metadata: {
        has_photo: Boolean(photoUrl),
        has_coordinates: lat != null && lng != null,
      },
    })
    return NextResponse.json({
      data: {
        id: result.timeEntry.id,
        clockInAt: result.timeEntry.clockInAt?.toISOString(),
        clockOutAt: result.timeEntry.clockOutAt?.toISOString(),
        clockOutPhotoUrl: result.timeEntry.clockOutPhotoUrl,
        payrollSnapshot: {
          minutesWorked: result.snapshot.minutesWorked,
          grossPayCents: result.snapshot.grossPayCents,
          unresolvedPercentRevenue: result.snapshot.unresolvedPercentRevenue,
        },
      },
    })
  }
}

export async function GET(request: Request) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    logAuditEvent(request, {
      event_type: "clock.list",
      outcome: "denied",
      status: 401,
      route: "/api/clock",
      reason: "unauthorized",
    })
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(request.url)
  const intervalId = url.searchParams.get("intervalId")
  const employeeId = url.searchParams.get("employeeId")
  const dateFrom = url.searchParams.get("dateFrom")
  const dateTo = url.searchParams.get("dateTo")

  interface WhereClause {
    workInterval?: { workday: { organizationId: string } }
    workIntervalId?: string
    employeeId?: string
    clockInAt?: { gte?: Date; lte?: Date }
  }

  const whereClause: WhereClause = {
    workInterval: {
      workday: {
        organizationId: session.organization.id,
      },
    },
  }

  if (intervalId) {
    whereClause.workIntervalId = intervalId
  }

  if (employeeId) {
    whereClause.employeeId = employeeId
  }

  if (dateFrom || dateTo) {
    whereClause.clockInAt = {}
    if (dateFrom) whereClause.clockInAt.gte = new Date(dateFrom)
    if (dateTo) whereClause.clockInAt.lte = new Date(dateTo)
  }

  const entries = await prisma.timeEntry.findMany({
    where: whereClause,
    include: {
      workInterval: {
        include: {
          workday: { select: { workDate: true } },
          position: { select: { name: true } },
        },
      },
      employee: {
        include: {
          user: { select: { fullName: true } },
        },
      },
    },
    orderBy: { clockInAt: "desc" },
  })

  const mapped = entries.map((e) => ({
    id: e.id,
    workIntervalId: e.workIntervalId,
    employeeId: e.employeeId,
    employeeName: e.employee.user.fullName,
    positionName: e.workInterval.position?.name,
    workDate: e.workInterval.workday.workDate.toISOString().split("T")[0],
    clockInAt: e.clockInAt?.toISOString(),
    clockOutAt: e.clockOutAt?.toISOString(),
    clockInPhotoUrl: e.clockInPhotoUrl,
    clockOutPhotoUrl: e.clockOutPhotoUrl,
  }))

  logAuditEvent(request, {
    event_type: "clock.list",
    outcome: "success",
    status: 200,
    route: "/api/clock",
    actor: auditActorFromSession(session),
    target: {
      type: "organization",
      id: session.organization.id,
      organization_id: session.organization.id,
      employee_id: employeeId,
    },
    metadata: {
      interval_id: intervalId,
      date_from: dateFrom,
      date_to: dateTo,
      result_count: mapped.length,
    },
  })
  return NextResponse.json({ data: mapped })
}
