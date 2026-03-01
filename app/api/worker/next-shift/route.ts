import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSessionUserWithOrg, getUserEmployee } from "@/lib/auth"
import { computeIntervalCompensation, computeIntervalMinutesWorked, resolveIntervalPayComponents } from "@/lib/payroll/interval-compensation"

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
  const [inProgressInterval, overdueScheduledInterval, upcomingInterval] = await Promise.all([
    prisma.workInterval.findFirst({
      where: {
        employeeId: employee.id,
        status: "in_progress",
        endAt: { gte: now },
      },
      include: {
        position: true,
      },
      orderBy: [{ startAt: "desc" }, { endAt: "asc" }],
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
      },
      orderBy: [{ startAt: "asc" }, { endAt: "asc" }],
    }),
  ])

  const interval = inProgressInterval ?? overdueScheduledInterval ?? upcomingInterval

  if (interval) {
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
        status: interval.status,
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
        status: interval.status,
        openedAt: interval.openedAt?.toISOString() ?? null,
        closedAt: interval.closedAt?.toISOString() ?? null,
        positionName: interval.position?.name ?? null,
        salaryCents,
        salaryMessage,
        currency: session.organization?.currency ?? null,
      },
    })
  }

  return NextResponse.json({ data: null })
}
