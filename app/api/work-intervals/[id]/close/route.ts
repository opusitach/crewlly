import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getAuthorizedInterval } from "@/lib/procedures/access"
import { getRequiredCompletion } from "@/lib/procedures/validation"
import { isClosedStatus, isOpenedStatus } from "@/lib/procedures/status"
import { getMissingCashProcedurePhotoFieldKeys, hasRequiredCashProcedureValues } from "@/lib/cash/procedure-values"
import { listCashRegisterFields } from "@/lib/cash/fields-query"
import { findWorkdayCashSourceAnswer } from "@/lib/cash/workday-cash-source"
import { getCloseCashSkipEligibility } from "@/lib/cash/close-skip"
import { toEventActorName, toEventDateLabel } from "@/lib/notifications/owner-events"
import { toNotificationDateOnly } from "@/lib/notifications/navigation"
import { finalizeWorkIntervalClose, isProceduresSchemaMissing } from "@/lib/work-intervals/close"

type RouteContext = { params: Promise<{ id: string }> }
const forceSchema = z.object({
  force: z.boolean().optional().default(false),
  skipCash: z.boolean().optional().default(false),
  reason: z.string().trim().min(1).max(500).optional().nullable(),
})

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params
  const { session, interval, hasManagementAccess, error, status } = await getAuthorizedInterval(id)
  if (error || !interval) {
    return NextResponse.json({ error }, { status })
  }

  const json = await request.json().catch(() => ({}))
  const parsed = forceSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const { force, skipCash, reason } = parsed.data
  const normalizedReason = typeof reason === "string" ? reason.trim() : undefined
  if (force && !hasManagementAccess) {
    return NextResponse.json({ error: "Только владелец или менеджер может принудительно закрыть смену" }, { status: 403 })
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
  const notificationWorkDate = toNotificationDateOnly(interval.workday.workDate)
  const notificationMessage = workDateLabel
    ? `${actorName} закрыл(а) рабочую смену (${workDateLabel}).`
    : `${actorName} закрыл(а) рабочую смену.`
  const notification = {
    organizationId: interval.workday.organizationId,
    title: "Закрыта рабочая смена",
    message: notificationMessage,
    payload: {
      view: "owner_cash",
      cashTab: "work_shifts",
      intervalId: interval.id,
      ...(notificationWorkDate ? { workDate: notificationWorkDate } : {}),
    },
    excludeUserId: session?.user.id ?? null,
  }

  const closeWithoutProcedures = async () => {
    if (!isOpenedStatus(interval.status)) {
      return NextResponse.json({ error: "Shift is not opened" }, { status: 409 })
    }
    const result = await prisma.$transaction(async (tx) => {
      return finalizeWorkIntervalClose(tx, {
        intervalId: interval.id,
        workdayId: interval.workday.id,
        locationId: interval.workday.locationId,
        closedAt: interval.closedAt ?? new Date(),
        closedByOwnerId: force ? session?.user.id ?? null : null,
        closeOverrideReason: force ? normalizedReason ?? null : null,
        notification,
        syncWorkday: false,
      })
    })
    return NextResponse.json({
      data: result.interval,
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
        selectionMode: "complete",
        fields: cashFields.map((field) => ({
          key: field.key,
          isRequired: field.isRequired,
          isPhotoRequired: field.isPhotoRequired,
        })),
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

      const shouldValidateSkipCash =
        skipCash && !force && !cashLockedByWorkday && missingCashRules.length > 0 && procedure.rules.some((rule) => rule.type === "CASH")
      const closeCashSkipEligibility = shouldValidateSkipCash
        ? await getCloseCashSkipEligibility(tx, {
            intervalId: interval.id,
            workdayId: interval.workday.id,
            workDate: interval.workday.workDate,
          })
        : null

      if (shouldValidateSkipCash && !closeCashSkipEligibility?.canSkip) {
        return {
          ok: false,
          error:
            closeCashSkipEligibility?.reason ??
            "Вы последний сотрудник с кассой в этом рабочем дне. Закрытие кассы обязательно.",
          missing: missingCashRules,
        }
      }

      const effectiveMissingCashRules = shouldValidateSkipCash ? [] : missingCashRules
      const missingRequired = Array.from(new Set([...completion.missingRequired, ...effectiveMissingCashRules]))

      const hasMissingRequired = missingRequired.length > 0
      if (hasMissingRequired && !force) {
        return { ok: false, error: "Required rules are not completed", missing: missingRequired }
      }

      const result = await finalizeWorkIntervalClose(tx, {
        intervalId: interval.id,
        workdayId: interval.workday.id,
        locationId: interval.workday.locationId,
        closedAt: interval.closedAt ?? new Date(),
        closedByOwnerId: force ? session?.user.id ?? null : null,
        closeOverrideReason: force ? normalizedReason ?? null : null,
        notification,
      })

      return {
        ok: true,
        interval: result.interval,
        forced: force && hasMissingRequired,
        snapshot: result.snapshot,
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
      },
      { status: 500 },
    )
  }
}
