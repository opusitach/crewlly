import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getAuthorizedInterval } from "@/lib/procedures/access"
import { getRequiredCompletion } from "@/lib/procedures/validation"
import { isClosedStatus, isOpenedStatus } from "@/lib/procedures/status"
import { computeIntervalPayrollSnapshot } from "@/lib/payroll/interval-compensation"
import { getMissingCashProcedurePhotoFieldKeys, hasRequiredCashProcedureValues } from "@/lib/cash/procedure-values"
import { listCashRegisterFields } from "@/lib/cash/fields-query"
import { syncCashSessionFromWorkdayProcedures } from "@/lib/cash/session-sync"
import { syncWorkdayRevenueFromCashSessions } from "@/lib/cash/revenue-allocation"
import { syncWorkdayTipsFromCashSessions } from "@/lib/cash/tips-sync"
import { findWorkdayCashSourceAnswer } from "@/lib/cash/workday-cash-source"
import { notifyOrganizationOwners, toEventActorName, toEventDateLabel } from "@/lib/notifications/owner-events"

type RouteContext = { params: Promise<{ id: string }> }
const forceSchema = z.object({
  force: z.boolean().optional().default(false),
  reason: z.string().trim().min(1).max(500).optional().nullable(),
})

const isProceduresSchemaMissing = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  (error.code === "P2021" || error.code === "P2022")

type PrismaTx = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>

const loadPayComponentsForSnapshot = async (
  tx: PrismaTx,
  input: { intervalId: string; employeeId: string; useCustomPay: boolean },
) => {
  if (input.useCustomPay) {
    const intervalComponents = await tx.workIntervalPayComponent.findMany({
      where: { workIntervalId: input.intervalId, isActive: true },
      orderBy: [{ priority: "desc" }, { componentType: "asc" }],
    })
    return { intervalComponents, employeeComponents: [] }
  }

  const employeeComponents = await tx.employeePayComponent.findMany({
    where: { employeeId: input.employeeId, isActive: true },
    orderBy: [{ priority: "desc" }, { componentType: "asc" }],
  })
  return { intervalComponents: [], employeeComponents }
}

const buildIntervalPaySnapshot = async (
  tx: PrismaTx,
  intervalId: string,
  options?: { closedAtOverride?: Date | null },
) => {
  const intervalForCalc = await tx.workInterval.findUnique({
    where: { id: intervalId },
    select: {
      id: true,
      employeeId: true,
      status: true,
      startAt: true,
      endAt: true,
      openedAt: true,
      closedAt: true,
      breakMinutes: true,
      useCustomPay: true,
      revenueCents: true,
      timeEntry: {
        select: {
          clockInAt: true,
          clockOutAt: true,
        },
      },
    },
  })

  if (!intervalForCalc) return null

  const { intervalComponents, employeeComponents } = await loadPayComponentsForSnapshot(tx, {
    intervalId: intervalForCalc.id,
    employeeId: intervalForCalc.employeeId,
    useCustomPay: intervalForCalc.useCustomPay,
  })

  return computeIntervalPayrollSnapshot({
    interval: {
      startAt: intervalForCalc.startAt,
      endAt: intervalForCalc.endAt,
      openedAt: intervalForCalc.openedAt,
      closedAt: options?.closedAtOverride ?? intervalForCalc.closedAt,
      breakMinutes: intervalForCalc.breakMinutes,
      status: intervalForCalc.status,
      useCustomPay: intervalForCalc.useCustomPay,
      revenueCents: intervalForCalc.revenueCents,
    },
    timeEntry: intervalForCalc.timeEntry,
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
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params
  const { session, interval, isOwner, error, status } = await getAuthorizedInterval(id)
  if (error || !interval) {
    return NextResponse.json({ error }, { status })
  }

  const json = await request.json().catch(() => ({}))
  const parsed = forceSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const { force, reason } = parsed.data
  const normalizedReason = typeof reason === "string" ? reason.trim() : undefined
  if (force && !isOwner) {
    return NextResponse.json({ error: "Only owner can force close a shift" }, { status: 403 })
  }
  if (force && !normalizedReason) {
    return NextResponse.json({ error: "Reason is required for force close" }, { status: 400 })
  }

  if (isClosedStatus(interval.status)) {
    return NextResponse.json({ error: "Shift already closed" }, { status: 409 })
  }
  if (!isOpenedStatus(interval.status)) {
    return NextResponse.json({ error: "Shift is not opened" }, { status: 409 })
  }

  const actorName = toEventActorName(
    { fullName: session?.user.fullName, email: session?.user.email },
    "Сотрудник",
  )
  const workDateLabel = toEventDateLabel(interval.workday.workDate)
  const notificationMessage = workDateLabel
    ? `${actorName} закрыл(а) рабочую смену (${workDateLabel}).`
    : `${actorName} закрыл(а) рабочую смену.`

  const closeWithoutProcedures = async () => {
    if (!isOpenedStatus(interval.status)) {
      return NextResponse.json({ error: "Shift is not opened" }, { status: 409 })
    }
    const closedAt = interval.closedAt ?? new Date()
    const result = await prisma.$transaction(async (tx) => {
      const snapshot = await buildIntervalPaySnapshot(tx, interval.id, { closedAtOverride: closedAt })
      const closed = await tx.workInterval.update({
        where: { id: interval.id },
        data: {
          status: "completed",
          closedAt,
          closedByOwnerId: force ? session?.user.id ?? null : null,
          closeOverrideReason: force ? normalizedReason ?? null : null,
          calculatedMinutesWorked: snapshot?.minutesWorked ?? null,
          calculatedGrossPayCents: snapshot?.grossPayCents ?? null,
          payCalculatedAt: snapshot ? new Date() : null,
        },
      })

      await notifyOrganizationOwners(tx, {
        organizationId: interval.workday.organizationId,
        type: "shift",
        title: "Закрыта рабочая смена",
        message: notificationMessage,
        excludeUserId: session?.user.id ?? null,
      })

      return { closed, snapshot }
    })
    return NextResponse.json({
      data: result.closed,
      payrollSnapshot: result.snapshot
        ? {
            minutesWorked: result.snapshot.minutesWorked,
            grossPayCents: result.snapshot.grossPayCents,
            unresolvedPercentRevenue: result.snapshot.unresolvedPercentRevenue,
          }
        : null,
      warning: "Таблицы процедур недоступны. Смена закрыта без проверки чек-листа.",
      code: "PROCEDURES_SCHEMA_MISSING",
    })
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const procedure = await tx.workIntervalProcedure.findUnique({
        where: { workIntervalId_when: { workIntervalId: interval.id, when: "CLOSE" } },
        include: {
          rules: { include: { checklistItems: true } },
        },
      })

      if (!procedure) {
        return { ok: false, error: "Procedure not found" }
      }

      const answers = await tx.workIntervalProcedureAnswer.findMany({
        where: { workIntervalId: interval.id, when: "CLOSE" },
        include: { checklistItems: true },
      })
      const answersByRuleId = new Map(answers.map((answer) => [answer.ruleId, answer]))
      const completion = getRequiredCompletion(procedure.rules, answersByRuleId, { treatAllAsRequired: true })
      const cashFields = await listCashRegisterFields(tx, {
        locationId: interval.workday.locationId,
        isActive: true,
        inputStage: "close",
      })
      const workdayCashSource = await findWorkdayCashSourceAnswer(tx, {
        workdayId: interval.workday.id,
        when: "CLOSE",
      })
      const cashLockedByWorkday = Boolean(workdayCashSource && workdayCashSource.workIntervalId !== interval.id)

      const missingCashRules = cashLockedByWorkday
        ? []
        : procedure.rules
            .filter((rule) => rule.type === "CASH")
            .filter((rule) => {
              const answer = workdayCashSource ?? answersByRuleId.get(rule.id)
              const valuesOk = hasRequiredCashProcedureValues(
                answer?.inputValue ?? null,
                cashFields.map((field) => ({ key: field.key, isRequired: field.isRequired })),
              )
              if (!valuesOk) return true

              const missingPhotoKeys = getMissingCashProcedurePhotoFieldKeys({
                packed: answer?.inputValue ?? null,
                fields: cashFields.map((field) => ({
                  key: field.key,
                  isRequired: field.isRequired,
                  isPhotoRequired: field.isPhotoRequired,
                })),
                photosRaw: answer?.cashPhotosJson,
              })

              return missingPhotoKeys.length > 0
            })
            .map((rule) => rule.id)

      const missingRequired = Array.from(new Set([...completion.missingRequired, ...missingCashRules]))

      const hasMissingRequired = missingRequired.length > 0
      if (hasMissingRequired && !force) {
        return { ok: false, error: "Required rules are not completed", missing: missingRequired }
      }

      const closedAt = interval.closedAt ?? new Date()
      const snapshot = await buildIntervalPaySnapshot(tx, interval.id, { closedAtOverride: closedAt })

      const closed = await tx.workInterval.update({
        where: { id: interval.id },
        data: {
          status: "completed",
          closedAt,
          closedByOwnerId: force ? session?.user.id ?? null : null,
          closeOverrideReason: force ? normalizedReason ?? null : null,
          calculatedMinutesWorked: snapshot?.minutesWorked ?? null,
          calculatedGrossPayCents: snapshot?.grossPayCents ?? null,
          payCalculatedAt: snapshot ? new Date() : null,
        },
      })

      await syncCashSessionFromWorkdayProcedures(tx, {
        workdayId: interval.workday.id,
        locationId: interval.workday.locationId,
      })
      await syncWorkdayRevenueFromCashSessions(tx, interval.workday.id)
      await syncWorkdayTipsFromCashSessions(tx, {
        workdayId: interval.workday.id,
        locationId: interval.workday.locationId,
      })

      await notifyOrganizationOwners(tx, {
        organizationId: interval.workday.organizationId,
        type: "shift",
        title: "Закрыта рабочая смена",
        message: notificationMessage,
        excludeUserId: session?.user.id ?? null,
      })

      return {
        ok: true,
        interval: closed,
        forced: force && hasMissingRequired,
        snapshot,
      }
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error, missing: (result as any).missing ?? [] }, { status: 400 })
    }

    return NextResponse.json({
      data: result.interval,
      forced: (result as any).forced ?? false,
      payrollSnapshot: (result as any).snapshot
        ? {
            minutesWorked: (result as any).snapshot.minutesWorked,
            grossPayCents: (result as any).snapshot.grossPayCents,
            unresolvedPercentRevenue: (result as any).snapshot.unresolvedPercentRevenue,
          }
        : null,
    })
  } catch (error) {
    if (isProceduresSchemaMissing(error)) {
      return closeWithoutProcedures()
    }
    console.error("[api/work-intervals/close]", error)
    return NextResponse.json(
      {
        error: "Не удалось закрыть смену.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }

}
