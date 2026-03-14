import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getOrganizationReadScope, getSessionUserWithOrg, hasOrganizationActionAccess } from "@/lib/auth"
import { loadIntervalConflictSummariesByIds } from "@/lib/work-interval-conflicts"
import {
  resolveEffectiveWorkIntervalClosedAt,
  resolveEffectiveWorkIntervalOpenedAt,
  resolveEffectiveWorkIntervalStatus,
} from "@/lib/work-intervals/status"
import { auditActorFromSession, logAuditEvent } from "@/lib/observability/audit"

const workdayCreateSchema = z.object({
  locationId: z.string().uuid(),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Формат даты: YYYY-MM-DD"),
  notes: z.string().optional().nullable(),
})

const workdayQuerySchema = z.object({
  locationId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
})

export async function GET(request: Request) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    logAuditEvent(request, {
      event_type: "workday.list",
      outcome: "denied",
      status: 401,
      route: "/api/workdays",
      reason: "unauthorized",
    })
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const readScope = await getOrganizationReadScope(session, {
    orgWidePermissions: [
      "workday:create",
      "workday:edit",
      "workday:publish",
      "interval:create",
      "interval:edit",
      "interval:delete",
      "payroll:view",
    ],
  })
  if (readScope.scope === "none") {
    logAuditEvent(request, {
      event_type: "workday.list",
      outcome: "denied",
      status: 403,
      route: "/api/workdays",
      actor: auditActorFromSession(session),
      target: {
        type: "organization",
        id: session.organization.id,
        organization_id: session.organization.id,
      },
      reason: "missing_workday_view_access",
    })
    return NextResponse.json({ error: "Недостаточно прав для просмотра рабочих дней" }, { status: 403 })
  }
  const isSelfScopedRead = readScope.scope === "self"

  const url = new URL(request.url)
  const locationId = url.searchParams.get("locationId")
  const dateFrom = url.searchParams.get("dateFrom")
  const dateTo = url.searchParams.get("dateTo")

  const whereClause: Prisma.WorkdayWhereInput = {
    organizationId: session.organization.id,
  }

  if (locationId) {
    whereClause.locationId = locationId
  }

  if (dateFrom || dateTo) {
    whereClause.workDate = {}
    if (dateFrom) {
      whereClause.workDate.gte = new Date(dateFrom)
    }
    if (dateTo) {
      whereClause.workDate.lte = new Date(dateTo)
    }
  }

  if (isSelfScopedRead) {
    whereClause.workIntervals = {
      some: {
        employeeId: readScope.employeeId,
      },
    }
  }

  const workdays = await prisma.workday.findMany({
    where: whereClause,
    include: {
      location: {
        select: { id: true, name: true },
      },
      workIntervals: {
        ...(isSelfScopedRead
          ? {
              where: {
                employeeId: readScope.employeeId,
              },
            }
          : {}),
        include: {
          employee: {
            include: {
              user: {
                select: { fullName: true, avatarUrl: true },
              },
              employeePositions: {
                where: { isPrimary: true },
                include: { position: true },
              },
            },
          },
          position: true,
          timeEntry: true,
          payComponents: {
            where: { isActive: true },
            orderBy: [{ priority: "desc" }, { componentType: "asc" }],
          },
        },
        orderBy: { startAt: "asc" },
      },
      tipsPool: true,
      _count: {
        select: { workIntervals: true, cashSessions: true },
      },
    },
    orderBy: { workDate: "asc" },
  })

  const canViewSensitiveDetails = readScope.scope === "org"
  const conflictMap = canViewSensitiveDetails
    ? await loadIntervalConflictSummariesByIds(prisma, {
        organizationId: session.organization.id,
        ids: Array.from(
          new Set(
            workdays.flatMap((workday) => workday.workIntervals.flatMap((interval) => interval.conflictWithIntervalIds ?? [])),
          ),
        ),
      })
    : new Map()

  // Transform for API response
  const mapped = workdays.map((wd) => ({
    id: wd.id,
    organizationId: wd.organizationId,
    locationId: wd.locationId,
    location: wd.location,
    workDate: wd.workDate.toISOString().split("T")[0],
    status: wd.status,
    notes: wd.notes,
    publishedAt: wd.publishedAt?.toISOString(),
    createdAt: wd.createdAt.toISOString(),
    updatedAt: wd.updatedAt.toISOString(),
    intervals: wd.workIntervals.map((wi) => {
      const status = resolveEffectiveWorkIntervalStatus(wi)
      const openedAt = resolveEffectiveWorkIntervalOpenedAt(wi)
      const closedAt = resolveEffectiveWorkIntervalClosedAt(wi)

      const baseInterval = {
        id: wi.id,
        workdayId: wi.workdayId,
        employeeId: wi.employeeId,
        positionId: wi.positionId,
        position: wi.position,
        startAt: wi.startAt.toISOString(),
        endAt: wi.endAt.toISOString(),
        startTime: wi.startAt.toTimeString().slice(0, 5),
        endTime: wi.endAt.toTimeString().slice(0, 5),
        status,
        openedAt: openedAt?.toISOString() ?? null,
        closedAt: closedAt?.toISOString() ?? null,
        cancelReason: wi.cancelReason ?? null,
        breakMinutes: wi.breakMinutes,
        notes: wi.notes,
        employee: {
          id: wi.employee.id,
          fullName: wi.employee.user.fullName,
          avatarUrl: wi.employee.user.avatarUrl,
          primaryPosition: wi.employee.employeePositions[0]?.position,
        },
      }

      if (!canViewSensitiveDetails) {
        return {
          ...baseInterval,
          conflictWithIntervalIds: [],
          conflicts: [],
          useCustomPay: wi.useCustomPay,
          payComponents: [],
          customPayType: [],
          timeEntry: wi.timeEntry
            ? {
                id: wi.timeEntry.id,
                clockInAt: wi.timeEntry.clockInAt?.toISOString(),
                clockOutAt: wi.timeEntry.clockOutAt?.toISOString(),
              }
            : null,
        }
      }

      return {
        ...baseInterval,
        conflictWithIntervalIds: wi.conflictWithIntervalIds ?? [],
        conflicts:
          (wi.conflictWithIntervalIds ?? [])
            .map((conflictId) => conflictMap.get(conflictId))
            .filter(Boolean) ?? [],
        useCustomPay: wi.useCustomPay,
        payComponents: wi.payComponents.map((component) => ({
          componentType: component.componentType,
          amountCents: component.amountCents,
          rateBp: component.rateBp,
          isActive: component.isActive,
          priority: component.priority,
        })),
        customPayType: wi.customPayType,
        customHourlyRateCents: wi.customHourlyRateCents,
        customShiftRateCents: wi.customShiftRateCents,
        customPercentRevenueBp: wi.customPercentRevenueBp,
        revenueCents: wi.revenueCents,
        calculatedMinutesWorked: wi.calculatedMinutesWorked,
        calculatedGrossPayCents: wi.calculatedGrossPayCents,
        payCalculatedAt: wi.payCalculatedAt?.toISOString() ?? null,
        timeEntry: wi.timeEntry
          ? {
              id: wi.timeEntry.id,
              clockInAt: wi.timeEntry.clockInAt?.toISOString(),
              clockOutAt: wi.timeEntry.clockOutAt?.toISOString(),
              clockInPhotoUrl: wi.timeEntry.clockInPhotoUrl,
              clockOutPhotoUrl: wi.timeEntry.clockOutPhotoUrl,
            }
          : null,
      }
    }),
    tipsPool: canViewSensitiveDetails ? wd.tipsPool : null,
    intervalCount: canViewSensitiveDetails ? wd._count.workIntervals : wd.workIntervals.length,
    cashSessionCount: canViewSensitiveDetails ? wd._count.cashSessions : 0,
  }))

  logAuditEvent(request, {
    event_type: "workday.list",
    outcome: "success",
    status: 200,
    route: "/api/workdays",
    actor: auditActorFromSession(session),
    target: {
      type: "organization",
      id: session.organization.id,
      organization_id: session.organization.id,
      location_id: locationId ?? null,
    },
    metadata: {
      access_scope: readScope.scope,
      result_count: mapped.length,
      date_from: dateFrom,
      date_to: dateTo,
    },
  })
  return NextResponse.json({ data: mapped })
}

export async function POST(request: Request) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    logAuditEvent(request, {
      event_type: "workday.create",
      outcome: "denied",
      status: 401,
      route: "/api/workdays",
      reason: "unauthorized",
    })
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const canCreateWorkdays = await hasOrganizationActionAccess(session, {
    permission: "workday:create",
    allowManagementRole: true,
  })
  if (!canCreateWorkdays) {
    logAuditEvent(request, {
      event_type: "workday.create",
      outcome: "denied",
      status: 403,
      route: "/api/workdays",
      actor: auditActorFromSession(session),
      target: {
        type: "organization",
        id: session.organization.id,
        organization_id: session.organization.id,
      },
      reason: "missing_workday_create_permission",
    })
    return NextResponse.json({ error: "Недостаточно прав для создания рабочих дней" }, { status: 403 })
  }

  const json = await request.json().catch(() => null)
  const parsed = workdayCreateSchema.safeParse(json)
  if (!parsed.success) {
    logAuditEvent(request, {
      event_type: "workday.create",
      outcome: "failure",
      status: 400,
      route: "/api/workdays",
      actor: auditActorFromSession(session),
      target: {
        type: "organization",
        id: session.organization.id,
        organization_id: session.organization.id,
      },
      reason: "validation_error",
    })
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { locationId, workDate, notes } = parsed.data

  // Verify location belongs to organization
  const location = await prisma.location.findFirst({
    where: { id: locationId, organizationId: session.organization.id },
  })

  if (!location) {
    logAuditEvent(request, {
      event_type: "workday.create",
      outcome: "failure",
      status: 404,
      route: "/api/workdays",
      actor: auditActorFromSession(session),
      target: {
        type: "location",
        id: locationId,
        organization_id: session.organization.id,
        location_id: locationId,
      },
      reason: "location_not_found",
    })
    return NextResponse.json({ error: "Локация не найдена" }, { status: 404 })
  }

  // Check if workday already exists
  const existing = await prisma.workday.findFirst({
    where: { locationId, workDate: new Date(workDate) },
  })

  if (existing) {
    logAuditEvent(request, {
      event_type: "workday.create",
      outcome: "success",
      status: 200,
      route: "/api/workdays",
      actor: auditActorFromSession(session),
      target: {
        type: "workday",
        id: existing.id,
        organization_id: session.organization.id,
        location_id: existing.locationId,
        workday_id: existing.id,
      },
      metadata: {
        reused_existing: true,
        work_date: workDate,
      },
    })
    return NextResponse.json({ data: existing })
  }

  const workday = await prisma.workday.create({
    data: {
      organizationId: session.organization.id,
      locationId,
      workDate: new Date(workDate),
      notes,
      createdByUserId: session.user.id,
    },
  })

  logAuditEvent(request, {
    event_type: "workday.create",
    outcome: "success",
    status: 200,
    route: "/api/workdays",
    actor: auditActorFromSession(session),
    target: {
      type: "workday",
      id: workday.id,
      organization_id: session.organization.id,
      location_id: workday.locationId,
      workday_id: workday.id,
    },
    metadata: {
      reused_existing: false,
      work_date: workDate,
    },
  })
  return NextResponse.json({
    data: {
      id: workday.id,
      organizationId: workday.organizationId,
      locationId: workday.locationId,
      workDate: workday.workDate.toISOString().split("T")[0],
      status: workday.status,
      notes: workday.notes,
    },
  })
}
