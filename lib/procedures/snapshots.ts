import type { Prisma, PrismaClient, ProcedureWhen } from "@prisma/client"
import type { RuleTemplateWithItems } from "@/lib/procedures/templates"

type ChecklistTemplateItem = RuleTemplateWithItems["checklistItems"][number]

const buildChecklistItemCreate = (item: ChecklistTemplateItem) => ({
  templateItemId: item.id,
  title: item.title,
  order: item.order,
})

const getEffectiveRequired = (when: ProcedureWhen, required: boolean) => (when === "CLOSE" ? true : required)

const buildRuleCreate = (template: RuleTemplateWithItems) => ({
  templateId: template.id,
  templateUpdatedAt: template.updatedAt,
  type: template.type,
  title: template.title,
  required: getEffectiveRequired(template.when, template.required),
  order: template.order,
  checklistItems:
    template.type === "CHECKLIST"
      ? {
          create: template.checklistItems.map(buildChecklistItemCreate),
        }
      : undefined,
})

type PrismaClientLike = Prisma.TransactionClient | PrismaClient

const syncChecklistItems = async (
  tx: PrismaClientLike,
  ruleId: string,
  existingItems: Array<{ id: string; templateItemId: string | null }>,
  templateItems: ChecklistTemplateItem[],
) => {
  if (templateItems.length === 0) {
    if (existingItems.length > 0) {
      await tx.workIntervalProcedureRuleChecklistItem.deleteMany({ where: { ruleId } })
    }
    return
  }

  const existingByTemplateId = new Map(
    existingItems.filter((item) => item.templateItemId).map((item) => [item.templateItemId as string, item]),
  )
  const keepItemIds: string[] = []

  for (const templateItem of templateItems) {
    const match = existingByTemplateId.get(templateItem.id)
    if (match) {
      keepItemIds.push(match.id)
      await tx.workIntervalProcedureRuleChecklistItem.update({
        where: { id: match.id },
        data: {
          title: templateItem.title,
          order: templateItem.order,
          templateItemId: templateItem.id,
        },
      })
    } else {
      const created = await tx.workIntervalProcedureRuleChecklistItem.create({
        data: {
          ruleId,
          templateItemId: templateItem.id,
          title: templateItem.title,
          order: templateItem.order,
        },
      })
      keepItemIds.push(created.id)
    }
  }

  if (keepItemIds.length > 0) {
    await tx.workIntervalProcedureRuleChecklistItem.deleteMany({
      where: { ruleId, id: { notIn: keepItemIds } },
    })
  } else {
    await tx.workIntervalProcedureRuleChecklistItem.deleteMany({ where: { ruleId } })
  }
}

const syncProcedureRules = async (
  tx: PrismaClientLike,
  procedureId: string,
  templates: RuleTemplateWithItems[],
) => {
  const existingRules = await tx.workIntervalProcedureRule.findMany({
    where: { procedureId },
    include: { checklistItems: true },
  })
  const existingByTemplateId = new Map(
    existingRules.filter((rule) => rule.templateId).map((rule) => [rule.templateId as string, rule]),
  )
  const keepRuleIds: string[] = []

  for (const template of templates) {
    const existing = existingByTemplateId.get(template.id)
    if (existing) {
      keepRuleIds.push(existing.id)
      await tx.workIntervalProcedureRule.update({
        where: { id: existing.id },
        data: {
          type: template.type,
          title: template.title,
          required: getEffectiveRequired(template.when, template.required),
          order: template.order,
          templateId: template.id,
          templateUpdatedAt: template.updatedAt,
        },
      })

      if (template.type === "CHECKLIST") {
        await syncChecklistItems(tx, existing.id, existing.checklistItems, template.checklistItems)
      } else if (existing.checklistItems.length > 0) {
        await tx.workIntervalProcedureRuleChecklistItem.deleteMany({ where: { ruleId: existing.id } })
      }
    } else {
      const created = await tx.workIntervalProcedureRule.create({
        data: {
          procedureId,
          ...buildRuleCreate(template),
        },
      })
      keepRuleIds.push(created.id)
    }
  }

  if (keepRuleIds.length > 0) {
    await tx.workIntervalProcedureRule.deleteMany({
      where: { procedureId, id: { notIn: keepRuleIds } },
    })
  } else {
    await tx.workIntervalProcedureRule.deleteMany({ where: { procedureId } })
  }
}

const ensureProcedure = async (
  tx: PrismaClientLike,
  workIntervalId: string,
  when: ProcedureWhen,
  templates: RuleTemplateWithItems[],
  allowUpdate: boolean,
) => {
  const existing = await tx.workIntervalProcedure.findUnique({
    where: { workIntervalId_when: { workIntervalId, when } },
  })

  if (!existing) {
    await tx.workIntervalProcedure.create({
      data: {
        workIntervalId,
        when,
        totalRequired: templates.filter((template) => getEffectiveRequired(template.when, template.required)).length,
        rules: {
          create: templates.map(buildRuleCreate),
        },
      },
    })
    return
  }

  if (!allowUpdate) return

  await tx.workIntervalProcedure.update({
    where: { id: existing.id },
    data: {
      totalRequired: templates.filter((template) => getEffectiveRequired(template.when, template.required)).length,
    },
  })

  await syncProcedureRules(tx, existing.id, templates)
}

export const ensureProceduresForInterval = async (
  tx: PrismaClientLike,
  workIntervalId: string,
  templatesByWhen: Record<ProcedureWhen, RuleTemplateWithItems[]>,
  allowUpdate: boolean,
) => {
  await ensureProcedure(tx, workIntervalId, "OPEN", templatesByWhen.OPEN, allowUpdate)
  await ensureProcedure(tx, workIntervalId, "CLOSE", templatesByWhen.CLOSE, allowUpdate)
}
