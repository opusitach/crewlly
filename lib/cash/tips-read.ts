import { prisma } from "@/lib/prisma"
import {
  evaluateCashFormulaExpression,
  extractCashFormulaKeys,
  validateAndCompileCashFormulaSet,
} from "@/lib/cash/formula"

type TipsReadDb = Pick<typeof prisma, "cashSession" | "cashRegisterFormula" | "cashRegisterField">

type WorkdayTipsTarget = {
  workdayId: string
  locationId: string
}

type CompiledTipsFormula = {
  expression: string
  formulaKeys: Set<string>
}

function toCentsFromCashSessionUnits(value: number) {
  if (!Number.isSafeInteger(value)) {
    throw new Error("Некорректное значение поля кассовой сессии")
  }
  const cents = value * 100
  if (!Number.isSafeInteger(cents)) {
    throw new Error("Значение поля кассовой сессии выходит за безопасный диапазон cents")
  }
  return cents
}

export async function computeWorkdayTipsTotalsFromCashSessions(
  db: TipsReadDb,
  targets: WorkdayTipsTarget[],
) {
  const workdayToLocation = new Map<string, string>()
  for (const target of targets) {
    if (!target.workdayId || !target.locationId) continue
    if (!workdayToLocation.has(target.workdayId)) {
      workdayToLocation.set(target.workdayId, target.locationId)
    }
  }

  const workdayIds = Array.from(workdayToLocation.keys())
  if (workdayIds.length === 0) return new Map<string, number>()

  const sessions = await db.cashSession.findMany({
    where: {
      workdayId: { in: workdayIds },
      status: { in: ["closed", "reviewed"] },
    },
    select: {
      workdayId: true,
      fieldValues: {
        select: {
          fieldKeySnapshot: true,
          valueCents: true,
        },
      },
    },
  })

  if (sessions.length === 0) return new Map<string, number>()

  const sessionsByWorkdayId = new Map<string, typeof sessions>()
  for (const session of sessions) {
    const list = sessionsByWorkdayId.get(session.workdayId) ?? []
    list.push(session)
    sessionsByWorkdayId.set(session.workdayId, list)
  }

  const locationIds = Array.from(new Set(workdayToLocation.values()))

  const [formulaRows, activeFieldRows] = await Promise.all([
    db.cashRegisterFormula.findMany({
      where: {
        locationId: { in: locationIds },
      },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      select: {
        locationId: true,
        resultKey: true,
        resultLabel: true,
        expression: true,
        isTipsSource: true,
        displayOrder: true,
      },
    }),
    db.cashRegisterField.findMany({
      where: {
        locationId: { in: locationIds },
        isActive: true,
      },
      select: {
        locationId: true,
        key: true,
      },
    }),
  ])

  const formulasByLocationId = new Map<string, typeof formulaRows>()
  for (const formula of formulaRows) {
    const list = formulasByLocationId.get(formula.locationId) ?? []
    list.push(formula)
    formulasByLocationId.set(formula.locationId, list)
  }

  const activeFieldKeysByLocationId = new Map<string, Set<string>>()
  for (const field of activeFieldRows) {
    const keys = activeFieldKeysByLocationId.get(field.locationId) ?? new Set<string>()
    keys.add(field.key)
    activeFieldKeysByLocationId.set(field.locationId, keys)
  }

  const observedFieldKeysByLocationId = new Map<string, Set<string>>()
  for (const [workdayId, daySessions] of sessionsByWorkdayId.entries()) {
    const locationId = workdayToLocation.get(workdayId)
    if (!locationId) continue
    const keys = observedFieldKeysByLocationId.get(locationId) ?? new Set<string>()
    for (const session of daySessions) {
      for (const fieldValue of session.fieldValues) {
        keys.add(fieldValue.fieldKeySnapshot)
      }
    }
    observedFieldKeysByLocationId.set(locationId, keys)
  }

  const compiledByLocationId = new Map<string, CompiledTipsFormula>()

  for (const locationId of locationIds) {
    const formulas = formulasByLocationId.get(locationId) ?? []
    if (formulas.length === 0) continue

    const tipsFormula = formulas.find((formula) => formula.isTipsSource)
    if (!tipsFormula) continue

    const activeKeys = activeFieldKeysByLocationId.get(locationId) ?? new Set<string>()
    const observedKeys = observedFieldKeysByLocationId.get(locationId) ?? new Set<string>()
    const allowedFieldKeys = new Set<string>([...activeKeys, ...observedKeys])

    const validation = validateAndCompileCashFormulaSet(
      formulas.map((formula) => ({
        resultKey: formula.resultKey,
        resultLabel: formula.resultLabel,
        expression: formula.expression,
        displayOrder: formula.displayOrder,
      })),
      allowedFieldKeys,
    )
    if (!validation.ok) continue

    const compiledExpression = validation.compiledExpressionsByKey[tipsFormula.resultKey]
    if (!compiledExpression) continue

    compiledByLocationId.set(locationId, {
      expression: compiledExpression,
      formulaKeys: new Set(extractCashFormulaKeys(compiledExpression)),
    })
  }

  const tipsByWorkdayId = new Map<string, number>()

  for (const [workdayId, daySessions] of sessionsByWorkdayId.entries()) {
    const locationId = workdayToLocation.get(workdayId)
    if (!locationId) continue

    const compiled = compiledByLocationId.get(locationId)
    if (!compiled) continue

    let totalCents = 0
    let failed = false

    for (const session of daySessions) {
      const valueMap: Record<string, number> = {}
      for (const fieldValue of session.fieldValues) {
        valueMap[fieldValue.fieldKeySnapshot] = toCentsFromCashSessionUnits(fieldValue.valueCents)
      }
      for (const key of compiled.formulaKeys) {
        if (!Object.prototype.hasOwnProperty.call(valueMap, key)) {
          valueMap[key] = 0
        }
      }

      const evaluated = evaluateCashFormulaExpression(compiled.expression, valueMap, compiled.formulaKeys)
      if (!evaluated.ok || !Number.isSafeInteger(evaluated.value)) {
        failed = true
        break
      }
      const nextTotal = totalCents + evaluated.value
      if (!Number.isSafeInteger(nextTotal)) {
        failed = true
        break
      }
      totalCents = nextTotal
    }

    if (!failed) {
      tipsByWorkdayId.set(workdayId, totalCents)
    }
  }

  return tipsByWorkdayId
}
