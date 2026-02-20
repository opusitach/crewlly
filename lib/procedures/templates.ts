import type { Prisma, PrismaClient, ProcedureWhen, RuleTemplate, RuleChecklistItemTemplate, Weekday } from "@prisma/client"

export type RuleTemplateWithItems = RuleTemplate & { checklistItems: RuleChecklistItemTemplate[] }

const WEEKDAY_BY_JS_DAY: Record<number, Weekday> = {
  0: "SUN",
  1: "MON",
  2: "TUE",
  3: "WED",
  4: "THU",
  5: "FRI",
  6: "SAT",
}

export function toWeekday(date: Date): Weekday {
  // Prisma returns DATE as midnight UTC; use UTC day to keep weekday stable across server timezones.
  return WEEKDAY_BY_JS_DAY[date.getUTCDay()]
}

const orderTemplates = (templates: RuleTemplateWithItems[]) =>
  templates
    .slice()
    .sort((a, b) => a.order - b.order || a.createdAt.getTime() - b.createdAt.getTime())
    .map((template) => ({
      ...template,
      checklistItems: template.checklistItems
        .slice()
        .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
    }))

type PrismaClientLike = Prisma.TransactionClient | PrismaClient

export async function getRuleTemplatesForPositionAndDate(
  tx: PrismaClientLike,
  positionId: string,
  date: Date,
): Promise<Record<ProcedureWhen, RuleTemplateWithItems[]>> {
  const dayOfWeek = toWeekday(date)
  const [defaultTemplates, overrideTemplates] = await Promise.all([
    tx.ruleTemplate.findMany({
      where: { positionId, dayOfWeek: null },
      include: { checklistItems: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
    tx.ruleTemplate.findMany({
      where: { positionId, dayOfWeek },
      include: { checklistItems: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
  ])

  const groupedDefault: Record<ProcedureWhen, RuleTemplateWithItems[]> = {
    OPEN: [],
    CLOSE: [],
  }
  const groupedOverride: Record<ProcedureWhen, RuleTemplateWithItems[]> = {
    OPEN: [],
    CLOSE: [],
  }

  for (const template of defaultTemplates) {
    groupedDefault[template.when].push(template)
  }
  for (const template of overrideTemplates) {
    groupedOverride[template.when].push(template)
  }

  return {
    OPEN: orderTemplates(groupedOverride.OPEN.length > 0 ? groupedOverride.OPEN : groupedDefault.OPEN),
    CLOSE: orderTemplates(groupedOverride.CLOSE.length > 0 ? groupedOverride.CLOSE : groupedDefault.CLOSE),
  }
}
