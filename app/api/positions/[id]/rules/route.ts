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

const ruleCreateSchema = z.object({
  when: z.enum(whenValues),
  type: z.enum(typeValues),
  title: z.string().trim().min(1, "Название правила обязательно"),
  required: z.boolean().default(true),
  order: z.number().int().default(0),
  dayOfWeek: z.enum(dayValues).optional().nullable(),
  checklistItems: z.array(checklistItemSchema).optional(),
})

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, context: RouteContext) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!isOwnerRole(session.membership)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id: positionId } = await context.params
  const position = await prisma.position.findUnique({ where: { id: positionId } })
  if (!position || position.organizationId !== session.organization.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
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
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!isOwnerRole(session.membership)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id: positionId } = await context.params
  const position = await prisma.position.findUnique({ where: { id: positionId } })
  if (!position || position.organizationId !== session.organization.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const json = await request.json().catch(() => null)
  const parsed = ruleCreateSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const payload = parsed.data
  if (payload.type === "CHECKLIST" && (!payload.checklistItems || payload.checklistItems.length === 0)) {
    return NextResponse.json({ error: "Для чек-листа нужен хотя бы один пункт" }, { status: 400 })
  }
  if (payload.type === "PHOTO") {
    const photoRulesCount = await prisma.ruleTemplate.count({
      where: {
        positionId,
        when: payload.when,
        dayOfWeek: payload.dayOfWeek ?? null,
        type: "PHOTO",
      },
    })
    if (photoRulesCount >= MAX_PHOTO_RULES_PER_STAGE) {
      return NextResponse.json(
        {
          error: `Не больше ${MAX_PHOTO_RULES_PER_STAGE} фото-правил для этапа ${
            payload.when === "OPEN" ? "открытия" : "закрытия"
          } (${payload.dayOfWeek ? "по дню недели" : "по умолчанию"}).`,
        },
        { status: 400 },
      )
    }
  }
  const effectiveRequired = payload.when === "CLOSE" ? true : payload.required
  const effectiveTitle = payload.type === "CASH" ? CASH_RULE_TITLE : payload.title

  const created = await prisma.ruleTemplate.create({
    data: {
      positionId,
      when: payload.when,
      type: payload.type,
      title: effectiveTitle,
      required: effectiveRequired,
      order: payload.order,
      dayOfWeek: payload.dayOfWeek ?? null,
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
  await syncScheduledProceduresForPosition(positionId)

  return NextResponse.json({ data: created }, { status: 201 })
}
