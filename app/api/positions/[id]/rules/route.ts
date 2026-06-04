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

const ruleCreateSchema = z.object({
  when: z.enum(whenValues),
  type: z.enum(typeValues),
  title: z.string().trim().min(1, "Название правила обязательно"),
  required: z.boolean().default(true),
  order: z.number().int().default(0),
  dayOfWeek: z.enum(dayValues).optional().nullable(),
  dayOfWeeks: z.array(z.enum(dayValues)).min(1).max(dayValues.length).optional(),
  checklistItems: z.array(checklistItemSchema).optional(),
})

function uniqueDays(days: DayValue[]) {
  return Array.from(new Set(days))
}

function resolveTargetDays(payload: { dayOfWeek?: DayValue | null; dayOfWeeks?: DayValue[] }) {
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

  return { ok: true as const, days: [payload.dayOfWeek ?? null] as Array<DayValue | null> }
}

function formatScopeLabel(dayOfWeek: DayValue | null) {
  return dayOfWeek == null ? "по умолчанию" : `на ${DAY_LABELS[dayOfWeek]}`
}

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, context: RouteContext) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: positionId } = await context.params
  const position = await prisma.position.findUnique({ where: { id: positionId } })
  if (!position) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const access = await resolveOrganizationAccess(user.id, position.organizationId)
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (!isOwnerOrManagerEffectiveRole(access)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const url = new URL(request.url)
  const whenParam = url.searchParams.get("when")
  const dayParam = url.searchParams.get("dayOfWeek")

  const whereClause: {
    positionId: string
    when?: (typeof whenValues)[number]
    dayOfWeek?: (typeof dayValues)[number] | null
  } = { positionId }

  if (whenParam && whenValues.includes(whenParam as (typeof whenValues)[number])) {
    whereClause.when = whenParam as (typeof whenValues)[number]
  }
  if (dayParam) {
    if (dayParam === "default") {
      whereClause.dayOfWeek = null
    } else if (dayValues.includes(dayParam as (typeof dayValues)[number])) {
      whereClause.dayOfWeek = dayParam as (typeof dayValues)[number]
    }
  }

  const rules = await prisma.ruleTemplate.findMany({
    where: whereClause,
    include: { checklistItems: { orderBy: { order: "asc" } } },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  })

  return NextResponse.json({ data: rules })
}

export async function POST(request: Request, context: RouteContext) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: positionId } = await context.params
  const position = await prisma.position.findUnique({ where: { id: positionId } })
  if (!position) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const access = await resolveOrganizationAccess(user.id, position.organizationId)
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (!isOwnerOrManagerEffectiveRole(access)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const json = await request.json().catch(() => null)
  const parsed = ruleCreateSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const payload = parsed.data
  const scope = resolveTargetDays(payload)
  if (!scope.ok) {
    return NextResponse.json({ error: scope.error }, { status: 400 })
  }
  const targetDays = scope.days

  if (payload.type === "CHECKLIST" && (!payload.checklistItems || payload.checklistItems.length === 0)) {
    return NextResponse.json({ error: "Для чек-листа нужен хотя бы один пункт" }, { status: 400 })
  }
  if (payload.type === "PHOTO") {
    for (const targetDay of targetDays) {
      const photoRulesCount = await prisma.ruleTemplate.count({
        where: {
          positionId,
          when: payload.when,
          dayOfWeek: targetDay,
          type: "PHOTO",
        },
      })
      if (photoRulesCount >= MAX_PHOTO_RULES_PER_STAGE) {
        return NextResponse.json(
          {
            error: `Не больше ${MAX_PHOTO_RULES_PER_STAGE} фото-правил для этапа ${
              payload.when === "OPEN" ? "открытия" : "закрытия"
            } (${formatScopeLabel(targetDay)}).`,
          },
          { status: 400 },
        )
      }
    }
  }
  const effectiveRequired = payload.when === "CLOSE" ? true : payload.required
  const effectiveTitle = payload.type === "CASH" ? CASH_RULE_TITLE : payload.title

  const createdRules = await prisma.$transaction(async (tx) => {
    const results = []
    for (const targetDay of targetDays) {
      const created = await tx.ruleTemplate.create({
        data: {
          positionId,
          when: payload.when,
          type: payload.type,
          title: effectiveTitle,
          required: effectiveRequired,
          order: payload.order,
          dayOfWeek: targetDay,
          checklistItems:
            payload.type === "CHECKLIST"
              ? {
                  create: payload.checklistItems?.map((item) => ({
                    title: item.title,
                    order: item.order,
                  })),
                }
              : undefined,
        },
        include: { checklistItems: { orderBy: { order: "asc" } } },
      })
      results.push(created)
    }
    return results
  })
  await syncScheduledProceduresForPosition(positionId)

  void logInternalAction(access, {
    action: INTERNAL_ACTIONS.POSITION_RULES_CREATE,
    entityType: "position",
    entityId: positionId,
    metadata: { ruleIds: createdRules.map((r) => r.id), when: payload.when, type: payload.type, count: createdRules.length },
  })

  return NextResponse.json(
    {
      data: createdRules.length === 1 ? createdRules[0] : createdRules,
      meta: { createdCount: createdRules.length },
    },
    { status: 201 },
  )
}
