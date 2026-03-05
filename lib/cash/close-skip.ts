import { Prisma, type Weekday } from "@prisma/client"
import { toWeekday } from "@/lib/procedures/templates"

type CloseCashSkipDb = Pick<Prisma.TransactionClient, "workInterval" | "workIntervalProcedure" | "ruleTemplate">

type CloseCashRuleTemplateRow = {
  positionId: string
  type: string
  dayOfWeek: Weekday | null
}

type ActiveIntervalRow = {
  id: string
  positionId: string | null
}

export type CloseCashSkipEligibility = {
  hasCloseCashRule: boolean
  canSkip: boolean
  remainingCashEmployees: number
  totalCashEmployees: number
  reason: string | null
}

const ACTIVE_WORKDAY_STATUSES = ["scheduled", "in_progress"] as const

const buildDefaultEligibility = (): CloseCashSkipEligibility => ({
  hasCloseCashRule: false,
  canSkip: false,
  remainingCashEmployees: 0,
  totalCashEmployees: 0,
  reason: null,
})

async function resolvePositionIdsWithEffectiveCloseCashRule(
  db: CloseCashSkipDb,
  positionIds: string[],
  workDate: Date,
) {
  if (positionIds.length === 0) {
    return new Set<string>()
  }

  const weekday = toWeekday(workDate)
  const templates = (await db.ruleTemplate.findMany({
    where: {
      positionId: { in: positionIds },
      when: "CLOSE",
      OR: [{ dayOfWeek: null }, { dayOfWeek: weekday }],
    },
    select: {
      positionId: true,
      type: true,
      dayOfWeek: true,
    },
  })) as CloseCashRuleTemplateRow[]

  const templatesByPosition = new Map<string, CloseCashRuleTemplateRow[]>()
  for (const template of templates) {
    const bucket = templatesByPosition.get(template.positionId) ?? []
    bucket.push(template)
    templatesByPosition.set(template.positionId, bucket)
  }

  const result = new Set<string>()
  for (const positionId of positionIds) {
    const items = templatesByPosition.get(positionId) ?? []
    const hasOverride = items.some((item) => item.dayOfWeek === weekday)
    const effectiveItems = hasOverride ? items.filter((item) => item.dayOfWeek === weekday) : items.filter((item) => item.dayOfWeek == null)
    if (effectiveItems.some((item) => item.type === "CASH")) {
      result.add(positionId)
    }
  }

  return result
}

export async function getCloseCashSkipEligibility(
  db: CloseCashSkipDb,
  input: {
    intervalId: string
    workdayId: string
    workDate: Date
  },
): Promise<CloseCashSkipEligibility> {
  const activeIntervals = (await db.workInterval.findMany({
    where: {
      workdayId: input.workdayId,
      status: { in: [...ACTIVE_WORKDAY_STATUSES] },
    },
    select: {
      id: true,
      positionId: true,
    },
  })) as ActiveIntervalRow[]

  const currentInterval = activeIntervals.find((interval) => interval.id === input.intervalId)
  if (!currentInterval) {
    return buildDefaultEligibility()
  }

  const intervalsWithPosition = activeIntervals.filter((interval) => Boolean(interval.positionId))
  if (intervalsWithPosition.length === 0) {
    return buildDefaultEligibility()
  }

  const intervalIds = intervalsWithPosition.map((interval) => interval.id)
  const snapshotRules = await db.workIntervalProcedure.findMany({
    where: {
      workIntervalId: { in: intervalIds },
      when: "CLOSE",
      rules: {
        some: {
          type: "CASH",
        },
      },
    },
    select: {
      workIntervalId: true,
    },
  })

  const intervalIdsWithCloseCashSnapshot = new Set(snapshotRules.map((item) => item.workIntervalId))
  const unresolvedPositionIds = Array.from(
    new Set(
      intervalsWithPosition
        .filter((interval) => !intervalIdsWithCloseCashSnapshot.has(interval.id))
        .map((interval) => interval.positionId)
        .filter((positionId): positionId is string => Boolean(positionId)),
    ),
  )
  const positionIdsWithCloseCashRule = await resolvePositionIdsWithEffectiveCloseCashRule(
    db,
    unresolvedPositionIds,
    input.workDate,
  )

  const cashEligibleIntervals = intervalsWithPosition.filter(
    (interval) =>
      intervalIdsWithCloseCashSnapshot.has(interval.id) ||
      (interval.positionId ? positionIdsWithCloseCashRule.has(interval.positionId) : false),
  )

  const hasCloseCashRule = cashEligibleIntervals.some((interval) => interval.id === input.intervalId)
  if (!hasCloseCashRule) {
    return buildDefaultEligibility()
  }

  const remainingCashEmployees = cashEligibleIntervals.filter((interval) => interval.id !== input.intervalId).length

  return {
    hasCloseCashRule: true,
    canSkip: remainingCashEmployees > 0,
    remainingCashEmployees,
    totalCashEmployees: cashEligibleIntervals.length,
    reason:
      remainingCashEmployees > 0
        ? null
        : "Вы последний сотрудник с кассой в этом рабочем дне. Закрытие кассы обязательно.",
  }
}
