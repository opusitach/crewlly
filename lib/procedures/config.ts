import { Prisma, type PrismaClient, type ProcedureWhen } from "@prisma/client"

export type DefaultRuleCounts = Record<ProcedureWhen, number>

type PrismaClientLike = Prisma.TransactionClient | PrismaClient

const EMPTY_COUNTS: DefaultRuleCounts = {
  OPEN: 0,
  CLOSE: 0,
}
const ASSUME_CONFIGURED_COUNTS: DefaultRuleCounts = {
  OPEN: 1,
  CLOSE: 1,
}

export async function getDefaultRuleCountsForPosition(
  tx: PrismaClientLike,
  positionId: string,
): Promise<DefaultRuleCounts> {
  const counts: DefaultRuleCounts = { ...EMPTY_COUNTS }
  try {
    const rules = await tx.ruleTemplate.findMany({
      where: {
        positionId,
        dayOfWeek: null,
      },
      select: {
        when: true,
      },
    })
    for (const rule of rules) {
      counts[rule.when] += 1
    }
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2021" || error.code === "P2022")
    ) {
      return { ...ASSUME_CONFIGURED_COUNTS }
    }
    throw error
  }

  return counts
}

export function isDefaultRulesetConfigured(counts: DefaultRuleCounts) {
  return counts.OPEN > 0 && counts.CLOSE > 0
}

export async function getDefaultRuleSetupByPosition(
  tx: PrismaClientLike,
  positionIds: string[],
) {
  if (positionIds.length === 0) return new Map<string, DefaultRuleCounts>()

  const setupByPositionId = new Map<string, DefaultRuleCounts>()

  for (const positionId of positionIds) {
    setupByPositionId.set(positionId, { ...EMPTY_COUNTS })
  }

  try {
    const rules = await tx.ruleTemplate.findMany({
      where: {
        positionId: { in: positionIds },
        dayOfWeek: null,
      },
      select: {
        positionId: true,
        when: true,
      },
    })
    for (const rule of rules) {
      const current = setupByPositionId.get(rule.positionId) ?? { ...EMPTY_COUNTS }
      current[rule.when] += 1
      setupByPositionId.set(rule.positionId, current)
    }
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2021" || error.code === "P2022")
    ) {
      for (const positionId of positionIds) {
        setupByPositionId.set(positionId, { ...ASSUME_CONFIGURED_COUNTS })
      }
      return setupByPositionId
    }
    throw error
  }

  return setupByPositionId
}
