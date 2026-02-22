import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getAuthorizedInterval } from "@/lib/procedures/access"
import { getRuleTemplatesForPositionAndDate } from "@/lib/procedures/templates"
import { ensureProceduresForInterval } from "@/lib/procedures/snapshots"
import { getRequiredCompletion } from "@/lib/procedures/validation"
import { isClosedStatus, isOpenedStatus, isPlannedStatus } from "@/lib/procedures/status"
import { getMissingCashProcedurePhotoFieldKeys, hasRequiredCashProcedureValues } from "@/lib/cash/procedure-values"
import { listCashRegisterFields } from "@/lib/cash/fields-query"
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
    return NextResponse.json({ error: "Only owner can force open a shift" }, { status: 403 })
  }
  if (force && !normalizedReason) {
    return NextResponse.json({ error: "Reason is required for force open" }, { status: 400 })
  }

  if (isOpenedStatus(interval.status)) {
    return NextResponse.json({ error: "Shift already opened" }, { status: 409 })
  }
  if (isClosedStatus(interval.status)) {
    return NextResponse.json({ error: "Shift already closed" }, { status: 409 })
  }
  if (!interval.positionId) {
    return NextResponse.json({ error: "Position is required for this interval" }, { status: 400 })
  }

  const actorName = toEventActorName(
    { fullName: session?.user.fullName, email: session?.user.email },
    "Сотрудник",
  )
  const workDateLabel = toEventDateLabel(interval.workday.workDate)
  const notificationMessage = workDateLabel
    ? `${actorName} открыл(а) рабочую смену (${workDateLabel}).`
    : `${actorName} открыл(а) рабочую смену.`

  const openWithoutProcedures = async () => {
    if (!isPlannedStatus(interval.status)) {
      return NextResponse.json({ error: "Shift cannot be opened in current status" }, { status: 409 })
    }
    const opened = await prisma.$transaction(async (tx) => {
      const updated = await tx.workInterval.update({
        where: { id: interval.id },
        data: {
          status: "in_progress",
          openedAt: interval.openedAt ?? new Date(),
          openedByOwnerId: force ? session?.user.id ?? null : null,
          openOverrideReason: force ? normalizedReason ?? null : null,
        },
      })

      await notifyOrganizationOwners(tx, {
        organizationId: interval.workday.organizationId,
        type: "shift",
        title: "Открыта рабочая смена",
        message: notificationMessage,
        excludeUserId: session?.user.id ?? null,
      })

      return updated
    })

    return NextResponse.json({
      data: opened,
      warning: "Таблицы процедур недоступны. Смена открыта без проверки чек-листа.",
      code: "PROCEDURES_SCHEMA_MISSING",
    })
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const templatesByWhen = await getRuleTemplatesForPositionAndDate(
        tx,
        interval.positionId as string,
        interval.workday.workDate,
      )
      await ensureProceduresForInterval(tx, interval.id, templatesByWhen, true)

      const procedure = await tx.workIntervalProcedure.findUnique({
        where: { workIntervalId_when: { workIntervalId: interval.id, when: "OPEN" } },
        include: {
          rules: { include: { checklistItems: true } },
        },
      })

      if (!procedure) {
        return { ok: false, error: "Procedure not found" }
      }

      const answers = await tx.workIntervalProcedureAnswer.findMany({
        where: { workIntervalId: interval.id, when: "OPEN" },
        include: { checklistItems: true },
      })
      const answersByRuleId = new Map(answers.map((answer) => [answer.ruleId, answer]))
      const completion = getRequiredCompletion(procedure.rules, answersByRuleId)
      const cashFields = await listCashRegisterFields(tx, {
        locationId: interval.workday.locationId,
        isActive: true,
        inputStage: "open",
      })
      const workdayCashSource = await findWorkdayCashSourceAnswer(tx, {
        workdayId: interval.workday.id,
        when: "OPEN",
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
              const missingPhotoKeys = getMissingCashProcedurePhotoFieldKeys({
                packed: answer?.inputValue ?? null,
                fields: cashFields.map((field) => ({
                  key: field.key,
                  isRequired: field.isRequired,
                  isPhotoRequired: field.isPhotoRequired,
                })),
                photosRaw: answer?.cashPhotosJson,
              })

              if (missingPhotoKeys.length > 0) return true
              if (!rule.required) return false

              return !hasRequiredCashProcedureValues(
                answer?.inputValue ?? null,
                cashFields.map((field) => ({ key: field.key, isRequired: field.isRequired })),
              )
            })
            .map((rule) => rule.id)

      const missingRequired = Array.from(new Set([...completion.missingRequired, ...missingCashRules]))

      const hasMissingRequired = missingRequired.length > 0
      if (hasMissingRequired && !force) {
        return { ok: false, error: "Required rules are not completed", missing: missingRequired }
      }

      if (!isPlannedStatus(interval.status)) {
        return { ok: false, error: "Shift cannot be opened in current status" }
      }

      const opened = await tx.workInterval.update({
        where: { id: interval.id },
        data: {
          status: "in_progress",
          openedAt: interval.openedAt ?? new Date(),
          openedByOwnerId: force ? session?.user.id ?? null : null,
          openOverrideReason: force ? normalizedReason ?? null : null,
        },
      })

      await notifyOrganizationOwners(tx, {
        organizationId: interval.workday.organizationId,
        type: "shift",
        title: "Открыта рабочая смена",
        message: notificationMessage,
        excludeUserId: session?.user.id ?? null,
      })

      return {
        ok: true,
        interval: opened,
        forced: force && hasMissingRequired,
      }
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error, missing: (result as any).missing ?? [] }, { status: 400 })
    }

    return NextResponse.json({
      data: result.interval,
      forced: (result as any).forced ?? false,
    })
  } catch (error) {
    if (isProceduresSchemaMissing(error)) {
      return openWithoutProcedures()
    }
    console.error("[api/work-intervals/open]", error)
    return NextResponse.json(
      {
        error: "Не удалось открыть смену.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
