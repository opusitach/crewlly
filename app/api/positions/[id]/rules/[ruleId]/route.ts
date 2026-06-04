import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSessionUser } from "@/lib/auth"
import { resolveOrganizationAccess, isOwnerOrManagerEffectiveRole } from "@/lib/organization-access"
import { syncScheduledProceduresForPosition } from "@/lib/procedures/scheduled-sync"
import { logInternalAction, INTERNAL_ACTIONS } from "@/lib/observability/internal-audit"

const whenValues = ["OPEN", "CLOSE"] as const
const typeValues = ["CHECKLIST", "INPUT", "PHOTO", "CASH"] as const
const dayValues = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const
const MAX_PHOTO_RULES_PER_STAGE = 10
const CASH_RULE_TITLE = "Касса"
type DayValue = (typeof dayValues)[number]

const DAY_LABELS: Record<DayValue, string> = {
  MON: "понедельник",
  TUE: "вторник",
  WED: "среду",
  THU: "четверг",
  FRI: "пятницу",
  SAT: "субботу",
  SUN: "воскресенье",
}

const checklistItemSchema = z.object({
  title: z.string().trim().min(1, "Название пункта обязательно"),
  order: z.number().int().default(0),
})

const ruleUpdateSchema = z.object({
  when: z.enum(whenValues).optional(),
  type: z.enum(typeValues).optional(),
  title: z.string().trim().min(1).optional(),
  required: z.boolean().optional(),
  order: z.number().int().optional(),
  dayOfWeek: z.enum(dayValues).optional().nullable(),
  dayOfWeeks: z.array(z.enum(dayValues)).min(1).max(dayValues.length).optional(),
  checklistItems: z.array(checklistItemSchema).optional(),
})

function uniqueDays(days: DayValue[]) {
  return Array.from(new Set(days))
}

function resolveTargetDays(
  payload: { dayOfWeek?: DayValue | null; dayOfWeeks?: DayValue[] },
  fallbackDayOfWeek: DayValue | null,
) {
  if (payload.dayOfWeeks !== undefined) {
    if (payload.dayOfWeek !== undefined) {
      return { ok: false as const, error: "Используйте либо dayOfWeek, либо dayOfWeeks" }
    }
    const deduped = uniqueDays(payload.dayOfWeeks)
    if (deduped.length === 0) {
      return { ok: false as const, error: "Нужно выбрать хотя бы один день недели" }
    }
    return { ok: true as const, days: deduped as Array<DayValue | null> }
  }

  if (payload.dayOfWeek !== undefined) {
    return { ok: true as const, days: [payload.dayOfWeek ?? null] as Array<DayValue | null> }
  }

  return { ok: true as const, days: [fallbackDayOfWeek ?? null] as Array<DayValue | null> }
}

function formatScopeLabel(dayOfWeek: DayValue | null) {
  return dayOfWeek == null ? "по умолчанию" : `на ${DAY_LABELS[dayOfWeek]}`
}

type RouteContext = { params: Promise<{ id: string; ruleId: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: positionId, ruleId } = await context.params

  const rule = await prisma.ruleTemplate.findUnique({
    where: { id: ruleId },
    include: { position: true, checklistItems: true },
  })
  if (!rule || rule.positionId !== positionId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const access = await resolveOrganizationAccess(user.id, rule.position.organizationId)
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  if (!isOwnerOrManagerEffectiveRole(access)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const json = await request.json().catch(() => null)
  const parsed = ruleUpdateSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const payload = parsed.data
  const nextType = payload.type ?? rule.type
  const nextWhen = payload.when ?? rule.when
  const scope = resolveTargetDays(payload, rule.dayOfWeek)
  if (!scope.ok) {
    return NextResponse.json({ error: scope.error }, { status: 400 })
  }
  const targetDays = scope.days
  const nextDayOfWeek = targetDays[0] ?? null
  const nextRequired =
    nextWhen === "CLOSE" ? true : payload.required === undefined ? rule.required : payload.required
  const nextTitle =
    nextType === "CASH"
      ? CASH_RULE_TITLE
      : payload.title === undefined
        ? rule.title
        : payload.title

  const checklistItemsForSave =
    nextType === "CHECKLIST"
      ? (
          payload.checklistItems ??
          (rule.type === "CHECKLIST" ? rule.checklistItems.map((item) => ({ title: item.title, order: item.order })) : [])
        ).map((item) => ({
          title: item.title,
          order: item.order,
        }))
      : []

  if (nextType === "CHECKLIST") {
    if (payload.checklistItems && payload.checklistItems.length === 0) {
      return NextResponse.json({ error: "Для чек-листа нужен хотя бы один пункт" }, { status: 400 })
    }
    if (checklistItemsForSave.length === 0) {
      return NextResponse.json(
        { error: "Нельзя сохранить тип «Чек-лист» без пунктов" },
        { status: 400 },
      )
    }
  }

  if (nextType === "PHOTO") {
    for (const targetDay of targetDays) {
      const photoRulesCount = await prisma.ruleTemplate.count({
        where: {
          id: { not: ruleId },
          positionId,
          when: nextWhen,
          dayOfWeek: targetDay,
          type: "PHOTO",
        },
      })
      if (photoRulesCount >= MAX_PHOTO_RULES_PER_STAGE) {
        return NextResponse.json(
          {
            error: `Не больше ${MAX_PHOTO_RULES_PER_STAGE} фото-правил для этапа ${
              nextWhen === "OPEN" ? "открытия" : "закрытия"
            } (${formatScopeLabel(targetDay)}).`,
          },
          { status: 400 },
        )
      }
    }
  }

  const updatedRules = await prisma.$transaction(async (tx) => {
    const updatedRule = await tx.ruleTemplate.update({
      where: { id: ruleId },
      data: {
        when: nextWhen,
        type: payload.type ?? undefined,
        title: nextTitle,
        required: nextRequired,
        order: payload.order ?? undefined,
        dayOfWeek: nextDayOfWeek,
      },
    })

    if (nextType !== "CHECKLIST") {
      await tx.ruleChecklistItemTemplate.deleteMany({ where: { ruleTemplateId: ruleId } })
    } else if (payload.checklistItems || rule.type !== "CHECKLIST") {
      await tx.ruleChecklistItemTemplate.deleteMany({ where: { ruleTemplateId: ruleId } })
      if (checklistItemsForSave.length > 0) {
        await tx.ruleChecklistItemTemplate.createMany({
          data: checklistItemsForSave.map((item) => ({
            ruleTemplateId: ruleId,
            title: item.title,
            order: item.order,
          })),
        })
      }
    }

    const checklistItems = await tx.ruleChecklistItemTemplate.findMany({
      where: { ruleTemplateId: ruleId },
      orderBy: { order: "asc" },
    })

    const clonedRules = []
    for (const targetDay of targetDays.slice(1)) {
      const clonedRule = await tx.ruleTemplate.create({
        data: {
          positionId,
          when: nextWhen,
          type: nextType,
          title: nextTitle,
          required: nextRequired,
          order: payload.order ?? rule.order,
          dayOfWeek: targetDay,
          checklistItems:
            nextType === "CHECKLIST"
              ? {
                  create: checklistItemsForSave.map((item) => ({
                    title: item.title,
                    order: item.order,
                  })),
                }
              : undefined,
        },
        include: { checklistItems: { orderBy: { order: "asc" } } },
      })
      clonedRules.push(clonedRule)
    }

    return [{ ...updatedRule, checklistItems }, ...clonedRules]
  })
  await syncScheduledProceduresForPosition(positionId)

  void logInternalAction(access, {
    action: INTERNAL_ACTIONS.POSITION_RULES_UPDATE,
    entityType: "rule_template",
    entityId: ruleId,
    metadata: { positionId, changedFields: Object.keys(payload) },
  })

  return NextResponse.json({
    data: updatedRules.length === 1 ? updatedRules[0] : updatedRules,
    meta: targetDays.length > 1 ? { savedCount: updatedRules.length } : undefined,
  })
}

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: positionId, ruleId } = await context.params
  const rule = await prisma.ruleTemplate.findUnique({
    where: { id: ruleId },
    include: { position: true },
  })

  if (!rule || rule.positionId !== positionId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const access = await resolveOrganizationAccess(user.id, rule.position.organizationId)
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  if (!isOwnerOrManagerEffectiveRole(access)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await prisma.ruleTemplate.delete({ where: { id: ruleId } })
  await syncScheduledProceduresForPosition(positionId)

  void logInternalAction(access, {
    action: INTERNAL_ACTIONS.POSITION_RULES_DELETE,
    entityType: "rule_template",
    entityId: ruleId,
    metadata: { positionId },
  })

  return NextResponse.json({ ok: true })
}
