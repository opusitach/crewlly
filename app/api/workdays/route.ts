import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSessionUserWithOrg } from "@/lib/auth"
import { loadIntervalConflictSummariesByIds } from "@/lib/work-interval-conflicts"

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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(request.url)
  const locationId = url.searchParams.get("locationId")
  const dateFrom = url.searchParams.get("dateFrom")
  const dateTo = url.searchParams.get("dateTo")

  const whereClause: {
    organizationId: string
    locationId?: string
    workDate?: { gte?: Date; lte?: Date }
  } = {
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

  const workdays = await prisma.workday.findMany({
    where: whereClause,
    include: {
      location: {
        select: { id: true, name: true },
      },
      workIntervals: {
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

  const conflictIds = Array.from(
    new Set(workdays.flatMap((workday) => workday.workIntervals.flatMap((interval) => interval.conflictWithIntervalIds ?? []))),
  )
  const conflictMap = await loadIntervalConflictSummariesByIds(prisma, {
    organizationId: session.organization.id,
    ids: conflictIds,
  })

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
    intervals: wd.workIntervals.map((wi) => ({
      id: wi.id,
      workdayId: wi.workdayId,
      employeeId: wi.employeeId,
      positionId: wi.positionId,
      position: wi.position,
      startAt: wi.startAt.toISOString(),
      endAt: wi.endAt.toISOString(),
      startTime: wi.startAt.toTimeString().slice(0, 5),
      endTime: wi.endAt.toTimeString().slice(0, 5),
      status: wi.status,
      conflictWithIntervalIds: wi.conflictWithIntervalIds ?? [],
      conflicts:
        (wi.conflictWithIntervalIds ?? [])
          .map((conflictId) => conflictMap.get(conflictId))
          .filter(Boolean) ?? [],
      openedAt: wi.openedAt?.toISOString() ?? null,
      closedAt: wi.closedAt?.toISOString() ?? null,
      cancelReason: wi.cancelReason ?? null,
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
      breakMinutes: wi.breakMinutes,
      revenueCents: wi.revenueCents,
      calculatedMinutesWorked: wi.calculatedMinutesWorked,
      calculatedGrossPayCents: wi.calculatedGrossPayCents,
      payCalculatedAt: wi.payCalculatedAt?.toISOString() ?? null,
      notes: wi.notes,
      employee: {
        id: wi.employee.id,
        fullName: wi.employee.user.fullName,
        avatarUrl: wi.employee.user.avatarUrl,
        primaryPosition: wi.employee.employeePositions[0]?.position,
      },
      timeEntry: wi.timeEntry
        ? {
            id: wi.timeEntry.id,
            clockInAt: wi.timeEntry.clockInAt?.toISOString(),
            clockOutAt: wi.timeEntry.clockOutAt?.toISOString(),
            clockInPhotoUrl: wi.timeEntry.clockInPhotoUrl,
            clockOutPhotoUrl: wi.timeEntry.clockOutPhotoUrl,
          }
        : null,
    })),
    tipsPool: wd.tipsPool,
    intervalCount: wd._count.workIntervals,
    cashSessionCount: wd._count.cashSessions,
  }))

  return NextResponse.json({ data: mapped })
}

export async function POST(request: Request) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const json = await request.json().catch(() => null)
  const parsed = workdayCreateSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { locationId, workDate, notes } = parsed.data

  // Verify location belongs to organization
  const location = await prisma.location.findFirst({
    where: { id: locationId, organizationId: session.organization.id },
  })

  if (!location) {
    return NextResponse.json({ error: "Локация не найдена" }, { status: 404 })
  }

  // Check if workday already exists
  const existing = await prisma.workday.findFirst({
    where: { locationId, workDate: new Date(workDate) },
  })

  if (existing) {
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
