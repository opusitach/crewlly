import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSessionUserWithOrg, getUserEmployee } from "@/lib/auth"
import { computeIntervalCompensation, computeIntervalMinutesWorked, resolveIntervalPayComponents } from "@/lib/payroll/interval-compensation"
import {
  resolveEffectiveWorkIntervalClosedAt,
  resolveEffectiveWorkIntervalOpenedAt,
  resolveEffectiveWorkIntervalStatus,
} from "@/lib/work-intervals/status"

export async function GET() {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const employee = await getUserEmployee(session.user.id, session.organization.id)
  if (!employee) {
    return NextResponse.json({ data: null })
  }

  const now = new Date()
  const [openCandidates, overdueScheduledInterval, upcomingInterval] = await Promise.all([
    prisma.workInterval.findMany({
      where: {
        employeeId: employee.id,
        status: { not: "canceled" },
        OR: [
          { status: "in_progress" },
          { openedAt: { not: null } },
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
      include: {
        position: true,
        timeEntry: {
          select: {
            clockInAt: true,
            clockOutAt: true,
          },
        },
      },
      orderBy: [{ startAt: "desc" }, { id: "desc" }],
      take: 10,
    }),
    prisma.workInterval.findFirst({
      where: {
        employeeId: employee.id,
        status: "scheduled",
        startAt: { lte: now },
        endAt: { gte: now },
      },
      include: {
        position: true,
        timeEntry: {
          select: {
            clockInAt: true,
            clockOutAt: true,
          },
        },
      },
      orderBy: [{ startAt: "desc" }, { endAt: "asc" }],
    }),
    prisma.workInterval.findFirst({
      where: {
        employeeId: employee.id,
        startAt: { gte: now },
        status: { notIn: ["canceled", "completed", "conflict"] },
      },
      include: {
        position: true,
        timeEntry: {
          select: {
            clockInAt: true,
            clockOutAt: true,
          },
        },
      },
      orderBy: [{ startAt: "asc" }, { endAt: "asc" }],
    }),
  ])

  const inProgressInterval = openCandidates.find((candidate) => resolveEffectiveWorkIntervalStatus(candidate) === "in_progress") ?? null
  const interval = inProgressInterval ?? overdueScheduledInterval ?? upcomingInterval

  if (interval) {
    const effectiveStatus = resolveEffectiveWorkIntervalStatus(interval)
    const effectiveOpenedAt = resolveEffectiveWorkIntervalOpenedAt(interval)
    const effectiveClosedAt = resolveEffectiveWorkIntervalClosedAt(interval)
    const intervalComponents = interval.useCustomPay
      ? await prisma.workIntervalPayComponent.findMany({
          where: { workIntervalId: interval.id, isActive: true },
          orderBy: [{ priority: "desc" }, { componentType: "asc" }],
        })
      : []
    const employeeComponents = interval.useCustomPay
      ? []
      : await prisma.employeePayComponent.findMany({
          where: { employeeId: employee.id, isActive: true },
          orderBy: [{ priority: "desc" }, { componentType: "asc" }],
        })
    const componentsForCalc = resolveIntervalPayComponents({
      useCustomPay: interval.useCustomPay,
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
    const componentByType = new Map(componentsForCalc.map((component) => [component.componentType, component]))
    const percentComponent = componentByType.get("percent_revenue")

    const minutes = computeIntervalMinutesWorked({
      interval: {
        startAt: interval.startAt,
        endAt: interval.endAt,
        breakMinutes: interval.breakMinutes,
      },
      timeEntry: null,
    })
    const compensation = computeIntervalCompensation({
      interval: {
        status: effectiveStatus,
        revenueCents: interval.revenueCents,
      },
      minutesWorked: minutes.minutesWorked,
      components: componentsForCalc,
    })

    let salaryCents: number | null = null
    let salaryMessage: string | null = null

    if (percentComponent && interval.revenueCents == null) {
      salaryMessage = "Зарплата расчитается после смены"
    } else {
      salaryCents = compensation.grossPayCents > 0 ? compensation.grossPayCents : null
    }

    return NextResponse.json({
      data: {
        id: interval.id,
        startAt: interval.startAt.toISOString(),
        endAt: interval.endAt.toISOString(),
        status: effectiveStatus,
        openedAt: effectiveOpenedAt?.toISOString() ?? null,
        closedAt: effectiveClosedAt?.toISOString() ?? null,
        positionName: interval.position?.name ?? null,
        salaryCents,
        salaryMessage,
        currency: session.organization?.currency ?? null,
      },
    })
  }

  return NextResponse.json({ data: null })
}
