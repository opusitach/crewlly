import { Prisma } from "@prisma/client"
import {
  evaluateCashFormulaExpression,
  extractCashFormulaKeys,
  validateAndCompileCashFormulaSet,
} from "./formula"
import { decodeCashProcedureValues } from "./procedure-values"
import { computeIntervalMinutesWorked } from "../payroll/interval-compensation"
import {
  allocateCentsByMinutes,
  allocateCentsEqual,
  normalizeTipsSplitMethod,
  type TipsSplitMethod,
} from "./tips-allocation"

type TipsSyncResult = {
  frozen: boolean
  totalAmountCents: number
  splitMethod: TipsSplitMethod | null
  allocationsCount: number
}

type ActiveCashFieldRow = {
  key: string
  inputStage: string
}

export async function syncWorkdayTipsFromCashSessions(
  tx: Prisma.TransactionClient,
  input: { workdayId: string; locationId: string },
): Promise<TipsSyncResult> {
  const workday = await tx.workday.findUnique({
    where: { id: input.workdayId },
    select: { id: true, status: true },
  })

  if (!workday) {
    throw new Error("Рабочий день не найден при синхронизации чаевых")
  }

  // After publication, tips are frozen and must not be recalculated.
  if (workday.status === "published") {
    return {
      frozen: true,
      totalAmountCents: 0,
      splitMethod: null,
      allocationsCount: 0,
    }
  }

  const [location, formulas, activeFieldRows] = await Promise.all([
    tx.location.findUnique({
      where: { id: input.locationId },
      select: { tipsSplitMethod: true },
    }),
    tx.cashRegisterFormula.findMany({
      where: {
        locationId: input.locationId,
      },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    }),
    tx.cashRegisterField.findMany({
      where: {
        locationId: input.locationId,
        isActive: true,
      },
      orderBy: [{ inputStage: "asc" }, { displayOrder: "asc" }, { key: "asc" }],
      select: {
        key: true,
        inputStage: true,
      },
    }),
  ])

  const splitMethod = normalizeTipsSplitMethod(location?.tipsSplitMethod)
  const tipsFormula = formulas.find((formula) => formula.isTipsSource)

  if (!tipsFormula) {
    await tx.tipsPool.deleteMany({
      where: { workdayId: input.workdayId },
    })

    return {
      frozen: false,
      totalAmountCents: 0,
      splitMethod: null,
      allocationsCount: 0,
    }
  }

  const formulaValidation = validateAndCompileCashFormulaSet(
    formulas.map((formula) => ({
      resultKey: formula.resultKey,
      resultLabel: formula.resultLabel,
      expression: formula.expression,
      displayOrder: formula.displayOrder,
    })),
    new Set(activeFieldRows.map((field) => field.key)),
  )
  if (!formulaValidation.ok) {
    throw new Error(formulaValidation.error)
  }

  const compiledTipsExpression = formulaValidation.compiledExpressionsByKey[tipsFormula.resultKey]
  if (!compiledTipsExpression) {
    throw new Error(`Не удалось подготовить формулу чаевых «${tipsFormula.resultLabel}»`)
  }

  const compiledTipsKeys = new Set(extractCashFormulaKeys(compiledTipsExpression))

  const totalAmountCents = await resolveTipsTotalAmountCents(tx, {
    workdayId: input.workdayId,
    locationId: input.locationId,
    formulaLabel: tipsFormula.resultLabel,
    compiledTipsExpression,
    compiledTipsKeys,
    activeFieldRows,
  })

  const pool = await tx.tipsPool.upsert({
    where: { workdayId: input.workdayId },
    create: {
      workdayId: input.workdayId,
      totalAmountCents,
      splitMethod,
    },
    update: {
      totalAmountCents,
      splitMethod,
    },
    select: {
      id: true,
    },
  })

  const intervals = await tx.workInterval.findMany({
    where: {
      workdayId: input.workdayId,
      status: { not: "canceled" },
    },
    select: {
      employeeId: true,
      startAt: true,
      endAt: true,
      openedAt: true,
      closedAt: true,
      breakMinutes: true,
      timeEntry: {
        select: {
          clockInAt: true,
          clockOutAt: true,
        },
      },
    },
  })

  const minutesByEmployee = new Map<string, number>()
  for (const interval of intervals) {
    const minutesWorked = computeIntervalMinutesWorked({
      interval: {
        startAt: interval.startAt,
        endAt: interval.endAt,
        openedAt: interval.openedAt,
        closedAt: interval.closedAt,
        breakMinutes: interval.breakMinutes,
      },
      timeEntry: interval.timeEntry,
    }).minutesWorked

    minutesByEmployee.set(interval.employeeId, (minutesByEmployee.get(interval.employeeId) ?? 0) + Math.max(0, minutesWorked))
  }

  const employeeIds = Array.from(minutesByEmployee.keys()).sort((a, b) => a.localeCompare(b))
  let allocations: Array<{ employeeId: string; amountCents: number; minutesCounted: number | null }> = []

  if (employeeIds.length > 0) {
    if (splitMethod === "equal") {
      const equalAllocations = allocateCentsEqual(totalAmountCents, employeeIds)
      allocations = employeeIds.map((employeeId) => ({
        employeeId,
        amountCents: equalAllocations.get(employeeId) ?? 0,
        minutesCounted: null,
      }))
    } else {
      const weighted = employeeIds.map((employeeId) => ({
        employeeId,
        minutes: minutesByEmployee.get(employeeId) ?? 0,
      }))

      const byMinutes = allocateCentsByMinutes(totalAmountCents, weighted)
      allocations = employeeIds.map((employeeId) => ({
        employeeId,
        amountCents: byMinutes.get(employeeId) ?? 0,
        minutesCounted: minutesByEmployee.get(employeeId) ?? 0,
      }))
    }
  }

  await tx.tipAllocation.deleteMany({
    where: { tipsPoolId: pool.id },
  })

  if (allocations.length > 0) {
    await tx.tipAllocation.createMany({
      data: allocations.map((item) => ({
        tipsPoolId: pool.id,
        employeeId: item.employeeId,
        amountCents: item.amountCents,
        minutesCounted: item.minutesCounted,
      })),
    })
  }

  return {
    frozen: false,
    totalAmountCents,
    splitMethod,
    allocationsCount: allocations.length,
  }
}

async function resolveTipsTotalAmountCents(
  tx: Prisma.TransactionClient,
  input: {
    workdayId: string
    locationId: string
    formulaLabel: string
    compiledTipsExpression: string
    compiledTipsKeys: Set<string>
    activeFieldRows: ActiveCashFieldRow[]
  },
) {
  const cashSessions = await tx.cashSession.findMany({
    where: {
      workdayId: input.workdayId,
      status: { in: ["closed", "reviewed"] },
      cashRegister: {
        locationId: input.locationId,
      },
    },
    select: {
      fieldValues: {
        select: {
          fieldKeySnapshot: true,
          valueCents: true,
        },
      },
    },
  })

  if (cashSessions.length > 0) {
    let total = 0
    for (const session of cashSessions) {
      const valueMap: Record<string, number> = {}

      for (const fieldValue of session.fieldValues) {
        valueMap[fieldValue.fieldKeySnapshot] = fieldValue.valueCents
      }

      total += evaluateTipsFormula({
        formulaLabel: input.formulaLabel,
        expression: input.compiledTipsExpression,
        formulaKeys: input.compiledTipsKeys,
        valueMap,
      })
    }

    if (!Number.isSafeInteger(total)) {
      throw new Error("Значение формулы чаевых выходит за безопасный диапазон целых чисел")
    }
    return total
  }

  return resolveTipsFromWorkIntervalProcedures(tx, input)
}

async function resolveTipsFromWorkIntervalProcedures(
  tx: Prisma.TransactionClient,
  input: {
    workdayId: string
    formulaLabel: string
    compiledTipsExpression: string
    compiledTipsKeys: Set<string>
    activeFieldRows: ActiveCashFieldRow[]
  },
) {
  const sourceInterval = await tx.workInterval.findFirst({
    where: {
      workdayId: input.workdayId,
      status: { not: "canceled" },
      procedureAnswers: {
        some: {
          when: "CLOSE",
          type: "CASH",
          inputValue: { not: null },
        },
      },
    },
    select: {
      id: true,
    },
    orderBy: [{ closedAt: "desc" }, { endAt: "desc" }, { id: "desc" }],
  })

  if (!sourceInterval) {
    return 0
  }

  const [openAnswers, closeAnswers] = await Promise.all([
    tx.workIntervalProcedureAnswer.findMany({
      where: {
        workIntervalId: sourceInterval.id,
        when: "OPEN",
        type: "CASH",
        inputValue: { not: null },
      },
      select: {
        inputValue: true,
      },
      orderBy: [{ updatedAt: "asc" }, { createdAt: "asc" }],
    }),
    tx.workIntervalProcedureAnswer.findMany({
      where: {
        workIntervalId: sourceInterval.id,
        when: "CLOSE",
        type: "CASH",
        inputValue: { not: null },
      },
      select: {
        inputValue: true,
      },
      orderBy: [{ updatedAt: "asc" }, { createdAt: "asc" }],
    }),
  ])

  const openFieldKeys = input.activeFieldRows
    .filter((field) => field.inputStage === "open")
    .map((field) => field.key)
  const closeFieldKeys = input.activeFieldRows
    .filter((field) => field.inputStage === "close")
    .map((field) => field.key)

  const valueMap = buildProcedureCashValueMap({
    openPackedValues: openAnswers.map((answer) => answer.inputValue ?? ""),
    closePackedValues: closeAnswers.map((answer) => answer.inputValue ?? ""),
    openFieldKeys,
    closeFieldKeys,
    formulaKeys: input.compiledTipsKeys,
  })

  return evaluateTipsFormula({
    formulaLabel: input.formulaLabel,
    expression: input.compiledTipsExpression,
    formulaKeys: input.compiledTipsKeys,
    valueMap,
  })
}

function evaluateTipsFormula(input: {
  formulaLabel: string
  expression: string
  formulaKeys: Set<string>
  valueMap: Record<string, number>
}) {
  for (const key of input.formulaKeys) {
    if (!Object.prototype.hasOwnProperty.call(input.valueMap, key)) {
      input.valueMap[key] = 0
    }
  }

  const evaluated = evaluateCashFormulaExpression(input.expression, input.valueMap, input.formulaKeys)
  if (!evaluated.ok) {
    throw new Error(`Не удалось рассчитать чаевые по формуле «${input.formulaLabel}»: ${evaluated.error}`)
  }

  return evaluated.value
}

export function buildProcedureCashValueMap(input: {
  openPackedValues: string[]
  closePackedValues: string[]
  openFieldKeys: string[]
  closeFieldKeys: string[]
  formulaKeys: Set<string>
}) {
  const valueMap: Record<string, number> = {}
  for (const key of input.formulaKeys) {
    valueMap[key] = 0
  }

  for (const packed of input.openPackedValues) {
    const decoded = decodeCashProcedureValues(packed, input.openFieldKeys)
    for (const [key, token] of Object.entries(decoded)) {
      if (!token.trim()) continue
      const parsed = Number(token)
      if (!Number.isInteger(parsed)) continue
      const parsedCents = parsed * 100
      if (!Number.isSafeInteger(parsedCents)) continue
      valueMap[key] = parsedCents
    }
  }

  for (const packed of input.closePackedValues) {
    const decoded = decodeCashProcedureValues(packed, input.closeFieldKeys)
    for (const [key, token] of Object.entries(decoded)) {
      if (!token.trim()) continue
      const parsed = Number(token)
      if (!Number.isInteger(parsed)) continue
      const parsedCents = parsed * 100
      if (!Number.isSafeInteger(parsedCents)) continue
      valueMap[key] = parsedCents
    }
  }

  return valueMap
}
