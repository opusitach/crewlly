import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSessionUserWithOrg, isOwnerOrManagerRole } from "@/lib/auth"
import { computeIntervalPayrollSnapshot } from "@/lib/payroll/interval-compensation"
import {
  resolveEffectiveWorkIntervalClosedAt,
  resolveEffectiveWorkIntervalOpenedAt,
  resolveEffectiveWorkIntervalStatus,
} from "@/lib/work-intervals/status"

const payloadSchema = z.object({
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
})

export async function POST(request: Request) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!isOwnerOrManagerRole(session.membership)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const json = await request.json().catch(() => null)
  const parsed = payloadSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { periodStart, periodEnd } = parsed.data
  if (periodEnd < periodStart) {
    return NextResponse.json({ error: "periodEnd must be >= periodStart" }, { status: 400 })
  }

  const organizationId = session.organization.id
  const payrollRun = await prisma.$transaction(async (tx) => {
    const run = await tx.payrollRun.create({
      data: {
        organizationId,
        periodStart,
        periodEnd,
        status: "draft",
        createdByUserId: session.user.id,
      },
    })

    const intervals = await tx.workInterval.findMany({
      where: {
        OR: [
          { status: "completed" },
          {
            status: { notIn: ["canceled", "conflict"] },
            timeEntry: {
              is: {
                clockOutAt: { not: null },
              },
            },
          },
        ],
        workday: {
          organizationId,
          workDate: { gte: periodStart, lte: periodEnd },
        },
      },
      include: {
        timeEntry: {
          select: { clockInAt: true, clockOutAt: true },
        },
      },
    })

    if (intervals.length === 0) {
      return run
    }

    const intervalsNeedingRecalc = intervals.filter(
      (interval) => interval.calculatedMinutesWorked == null || interval.calculatedGrossPayCents == null,
    )

    const customIntervalIds = intervalsNeedingRecalc
      .filter((interval) => interval.useCustomPay)
      .map((interval) => interval.id)
    const defaultEmployeeIds = Array.from(
      new Set(
        intervalsNeedingRecalc
          .filter((interval) => !interval.useCustomPay)
          .map((interval) => interval.employeeId),
      ),
    )

    const [intervalComponents, employeeComponents] = await Promise.all([
      customIntervalIds.length > 0
        ? tx.workIntervalPayComponent.findMany({
            where: { workIntervalId: { in: customIntervalIds }, isActive: true },
            orderBy: [{ priority: "desc" }, { componentType: "asc" }],
          })
        : Promise.resolve([]),
      defaultEmployeeIds.length > 0
        ? tx.employeePayComponent.findMany({
            where: { employeeId: { in: defaultEmployeeIds }, isActive: true },
            orderBy: [{ priority: "desc" }, { componentType: "asc" }],
          })
        : Promise.resolve([]),
    ])

    const intervalComponentsById = new Map<string, typeof intervalComponents>()
    for (const component of intervalComponents) {
      const list = intervalComponentsById.get(component.workIntervalId) ?? []
      list.push(component)
      intervalComponentsById.set(component.workIntervalId, list)
    }

    const employeeComponentsById = new Map<string, typeof employeeComponents>()
    for (const component of employeeComponents) {
      const list = employeeComponentsById.get(component.employeeId) ?? []
      list.push(component)
      employeeComponentsById.set(component.employeeId, list)
    }

    const totalsByEmployee = new Map<string, { minutesWorked: number; grossPayCents: number }>()
    const snapshotUpdates: Array<Promise<unknown>> = []

    for (const interval of intervals) {
      const effectiveStatus = resolveEffectiveWorkIntervalStatus(interval)
      const effectiveOpenedAt = resolveEffectiveWorkIntervalOpenedAt(interval)
      const effectiveClosedAt = resolveEffectiveWorkIntervalClosedAt(interval)
      let minutesWorked = interval.calculatedMinutesWorked ?? 0
      let grossPayCents = interval.calculatedGrossPayCents ?? 0

      if (interval.calculatedMinutesWorked == null || interval.calculatedGrossPayCents == null) {
        const snapshot = computeIntervalPayrollSnapshot({
          interval: {
            startAt: interval.startAt,
            endAt: interval.endAt,
            openedAt: effectiveOpenedAt,
            closedAt: effectiveClosedAt,
            breakMinutes: interval.breakMinutes,
            status: effectiveStatus,
            useCustomPay: interval.useCustomPay,
            revenueCents: interval.revenueCents,
          },
          timeEntry: interval.timeEntry,
          intervalComponents: (intervalComponentsById.get(interval.id) ?? []).map((component) => ({
            componentType: component.componentType,
            amountCents: component.amountCents,
            rateBp: component.rateBp,
            isActive: component.isActive,
          })),
          employeeComponents: (employeeComponentsById.get(interval.employeeId) ?? []).map((component) => ({
            componentType: component.componentType,
            amountCents: component.amountCents,
            rateBp: component.rateBp,
            isActive: component.isActive,
          })),
        })
        minutesWorked = snapshot.minutesWorked
        grossPayCents = snapshot.grossPayCents

        snapshotUpdates.push(
          tx.workInterval.update({
            where: { id: interval.id },
            data: {
              calculatedMinutesWorked: snapshot.minutesWorked,
              calculatedGrossPayCents: snapshot.grossPayCents,
              payCalculatedAt: interval.payCalculatedAt ?? new Date(),
            },
          }),
        )
      }

      const current = totalsByEmployee.get(interval.employeeId) ?? { minutesWorked: 0, grossPayCents: 0 }
      totalsByEmployee.set(interval.employeeId, {
        minutesWorked: current.minutesWorked + minutesWorked,
        grossPayCents: current.grossPayCents + grossPayCents,
      })
    }

    if (snapshotUpdates.length > 0) {
      await Promise.all(snapshotUpdates)
    }

    const tipAllocations = await tx.tipAllocation.findMany({
      where: {
        tipsPool: {
          workday: {
            organizationId,
            workDate: { gte: periodStart, lte: periodEnd },
          },
        },
      },
    })

    const tipsByEmployee = new Map<string, number>()
    for (const allocation of tipAllocations) {
      tipsByEmployee.set(allocation.employeeId, (tipsByEmployee.get(allocation.employeeId) ?? 0) + allocation.amountCents)
    }

    for (const [employeeId] of tipsByEmployee) {
      if (!totalsByEmployee.has(employeeId)) {
        totalsByEmployee.set(employeeId, { minutesWorked: 0, grossPayCents: 0 })
      }
    }

    const items = Array.from(totalsByEmployee.entries()).map(([employeeId, totals]) => {
      const tipsCents = tipsByEmployee.get(employeeId) ?? 0
      return {
        payrollRunId: run.id,
        employeeId,
        minutesWorked: totals.minutesWorked,
        grossPayCents: totals.grossPayCents,
        tipsCents,
        totalPayoutCents: totals.grossPayCents + tipsCents,
      }
    })

    if (items.length > 0) {
      await tx.payrollItem.createMany({ data: items })
    }

    return run
  })

  return NextResponse.json({
    data: {
      id: payrollRun.id,
      periodStart: payrollRun.periodStart.toISOString().split("T")[0],
      periodEnd: payrollRun.periodEnd.toISOString().split("T")[0],
      status: payrollRun.status,
    },
  })
}
