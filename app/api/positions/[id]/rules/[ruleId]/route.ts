import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSessionUserWithOrg, isOwnerRole } from "@/lib/auth"
import { syncScheduledProceduresForPosition } from "@/lib/procedures/scheduled-sync"

const whenValues = ["OPEN", "CLOSE"] as const
const typeValues = ["CHECKLIST", "INPUT", "PHOTO", "CASH"] as const
const dayValues = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const
const MAX_PHOTO_RULES_PER_STAGE = 10
const CASH_RULE_TITLE = "Касса"

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
  checklistItems: z.array(checklistItemSchema).optional(),
})

type RouteContext = { params: Promise<{ id: string; ruleId: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!isOwnerRole(session.membership)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id: positionId, ruleId } = await context.params

  const rule = await prisma.ruleTemplate.findUnique({
    where: { id: ruleId },
    include: { position: true, checklistItems: true },
  })
  if (!rule || rule.positionId !== positionId || rule.position.organizationId !== session.organization.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const json = await request.json().catch(() => null)
  const parsed = ruleUpdateSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const payload = parsed.data
  const nextType = payload.type ?? rule.type
  const nextWhen = payload.when ?? rule.when
  const nextDayOfWeek = payload.dayOfWeek === undefined ? rule.dayOfWeek : payload.dayOfWeek
  const nextRequired =
    nextWhen === "CLOSE" ? true : payload.required === undefined ? rule.required : payload.required
  const nextTitle =
    nextType === "CASH"
      ? CASH_RULE_TITLE
      : payload.title === undefined
        ? rule.title
        : payload.title

  if (nextType === "CHECKLIST") {
    if (payload.checklistItems && payload.checklistItems.length === 0) {
      return NextResponse.json({ error: "Для чек-листа нужен хотя бы один пункт" }, { status: 400 })
    }

    const hasIncomingItems = Array.isArray(payload.checklistItems) && payload.checklistItems.length > 0
    const hasExistingItems = rule.checklistItems.length > 0
    if (!hasIncomingItems && (!hasExistingItems || rule.type !== "CHECKLIST")) {
      return NextResponse.json(
        { error: "Нельзя сохранить тип «Чек-лист» без пунктов" },
        { status: 400 },
      )
    }
  }

  if (nextType === "PHOTO") {
    const photoRulesCount = await prisma.ruleTemplate.count({
      where: {
        id: { not: ruleId },
        positionId,
        when: nextWhen,
        dayOfWeek: nextDayOfWeek,
        type: "PHOTO",
      },
    })
    if (photoRulesCount >= MAX_PHOTO_RULES_PER_STAGE) {
      return NextResponse.json(
        {
          error: `Не больше ${MAX_PHOTO_RULES_PER_STAGE} фото-правил для этапа ${
            nextWhen === "OPEN" ? "открытия" : "закрытия"
          } (${nextDayOfWeek ? "по дню недели" : "по умолчанию"}).`,
        },
        { status: 400 },
      )
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedRule = await tx.ruleTemplate.update({
      where: { id: ruleId },
      data: {
        when: nextWhen,
        type: payload.type ?? undefined,
        title: nextTitle,
        required: nextRequired,
        order: payload.order ?? undefined,
        dayOfWeek: payload.dayOfWeek === undefined ? undefined : payload.dayOfWeek,
      },
    })

    if (nextType !== "CHECKLIST") {
      await tx.ruleChecklistItemTemplate.deleteMany({ where: { ruleTemplateId: ruleId } })
    } else if (payload.checklistItems) {
      await tx.ruleChecklistItemTemplate.deleteMany({ where: { ruleTemplateId: ruleId } })
      if (payload.checklistItems.length > 0) {
        await tx.ruleChecklistItemTemplate.createMany({
          data: payload.checklistItems.map((item) => ({
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

    return { ...updatedRule, checklistItems }
  })
  await syncScheduledProceduresForPosition(positionId)

  return NextResponse.json({ data: updated })
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!isOwnerRole(session.membership)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id: positionId, ruleId } = await context.params
  const rule = await prisma.ruleTemplate.findUnique({
    where: { id: ruleId },
    include: { position: true },
  })

  if (!rule || rule.positionId !== positionId || rule.position.organizationId !== session.organization.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  await prisma.ruleTemplate.delete({ where: { id: ruleId } })
  await syncScheduledProceduresForPosition(positionId)
  return NextResponse.json({ ok: true })
}
