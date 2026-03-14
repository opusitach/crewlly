import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getAuthorizedInterval } from "@/lib/procedures/access"
import { getRuleTemplatesForPositionAndDate } from "@/lib/procedures/templates"
import { ensureProceduresForInterval } from "@/lib/procedures/snapshots"
import { isPlannedStatus } from "@/lib/procedures/status"
import { computeIntervalCompensation, computeIntervalMinutesWorked, resolveIntervalPayComponents } from "@/lib/payroll/interval-compensation"
import { normalizeCashProcedurePhotoMap } from "@/lib/cash/procedure-values"
import { listCashRegisterFields } from "@/lib/cash/fields-query"
import {
  evaluateCashFormulaExpression,
  extractCashFormulaKeys,
  validateAndCompileCashFormulaSet,
} from "@/lib/cash/formula"
import { buildProcedureCashValueMap } from "@/lib/cash/tips-sync"
import { findWorkdayCashSourceAnswers } from "@/lib/cash/workday-cash-source"
import { getCloseCashSkipEligibility } from "@/lib/cash/close-skip"

const whenValues = ["OPEN", "CLOSE"] as const

type RouteContext = { params: Promise<{ id: string }> }

const isProceduresSchemaMissing = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  (error.code === "P2021" || error.code === "P2022")

const toMinutes = (from: Date, to: Date) => Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000))

type CashFormulaRow = {
  resultKey: string
  resultLabel: string
  expression: string
  isTipsSource: boolean
  displayOrder: number
}

type CashFormulaCalculationItem = {
  resultKey: string
  resultLabel: string
  valueCents: number | null
  isTipsSource: boolean
  displayOrder: number
}

type CashFormulaCalculationsPayload = {
  items: CashFormulaCalculationItem[]
  hasCashInput: boolean
  currency: string | null
  error: string | null
}

const sortFormulaRows = (formulas: CashFormulaRow[]) =>
  [...formulas].sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder
    return a.resultKey.localeCompare(b.resultKey)
  })

const toFormulaPlaceholderItems = (formulas: CashFormulaRow[]): CashFormulaCalculationItem[] =>
  sortFormulaRows(formulas).map((formula) => ({
    resultKey: formula.resultKey,
    resultLabel: formula.resultLabel,
    valueCents: null,
    isTipsSource: formula.isTipsSource,
    displayOrder: formula.displayOrder,
  }))

function buildCashFormulaCalculations(input: {
  formulas: CashFormulaRow[]
  allowedFieldKeys: Set<string>
  openPackedValues: string[]
  closePackedValues: string[]
  openFieldKeys: string[]
  closeFieldKeys: string[]
  currency: string | null
}): CashFormulaCalculationsPayload {
  const hasCashInput =
    input.openPackedValues.some((value) => value.trim().length > 0) ||
    input.closePackedValues.some((value) => value.trim().length > 0)

  if (input.formulas.length === 0) {
    return {
      items: [],
      hasCashInput,
      currency: input.currency,
      error: null,
    }
  }

  const formulaValidation = validateAndCompileCashFormulaSet(
    input.formulas.map((formula) => ({
      resultKey: formula.resultKey,
      resultLabel: formula.resultLabel,
      expression: formula.expression,
      displayOrder: formula.displayOrder,
    })),
    input.allowedFieldKeys,
  )

  if (!formulaValidation.ok) {
    return {
      items: toFormulaPlaceholderItems(input.formulas),
      hasCashInput,
      currency: input.currency,
      error: formulaValidation.error,
    }
  }

  const formulaMetaByKey = new Map(input.formulas.map((formula) => [formula.resultKey, formula]))
  const dependencyKeys = new Set<string>()
  for (const formula of formulaValidation.orderedFormulas) {
    const compiledExpression = formulaValidation.compiledExpressionsByKey[formula.resultKey] ?? formula.expression
    for (const key of extractCashFormulaKeys(compiledExpression)) {
      dependencyKeys.add(key)
    }
  }

  const valueMap = buildProcedureCashValueMap({
    openPackedValues: input.openPackedValues,
    closePackedValues: input.closePackedValues,
    openFieldKeys: input.openFieldKeys,
    closeFieldKeys: input.closeFieldKeys,
    formulaKeys: dependencyKeys,
  })

  const items: CashFormulaCalculationItem[] = []
  for (const formula of formulaValidation.orderedFormulas) {
    const meta = formulaMetaByKey.get(formula.resultKey)
    const compiledExpression = formulaValidation.compiledExpressionsByKey[formula.resultKey] ?? formula.expression
    const formulaKeys = new Set(extractCashFormulaKeys(compiledExpression))
    for (const key of formulaKeys) {
      if (!Object.prototype.hasOwnProperty.call(valueMap, key)) {
        valueMap[key] = 0
      }
    }

    const evaluation = evaluateCashFormulaExpression(compiledExpression, valueMap, formulaKeys)
    if (!evaluation.ok) {
      return {
        items: toFormulaPlaceholderItems(input.formulas),
        hasCashInput,
        currency: input.currency,
        error: `Ошибка в формуле «${meta?.resultLabel ?? formula.resultLabel ?? formula.resultKey}»: ${evaluation.error}`,
      }
    }

    valueMap[formula.resultKey] = evaluation.value
    items.push({
      resultKey: formula.resultKey,
      resultLabel: meta?.resultLabel ?? formula.resultLabel ?? formula.resultKey,
      valueCents: evaluation.value,
      isTipsSource: Boolean(meta?.isTipsSource),
      displayOrder: meta?.displayOrder ?? formula.displayOrder ?? items.length,
    })
  }

  return {
    items,
    hasCashInput,
    currency: input.currency,
    error: null,
  }
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params
  const {
    session,
    interval,
    hasManagementAccess,
    effectiveStatus,
    effectiveOpenedAt,
    effectiveClosedAt,
    error,
    status,
  } = await getAuthorizedInterval(id)
  if (error || !interval) {
    return NextResponse.json({ error }, { status })
  }
  const resolvedStatus = effectiveStatus ?? interval.status
  const resolvedOpenedAt = effectiveOpenedAt ?? interval.openedAt ?? interval.timeEntry?.clockInAt ?? null
  const resolvedClosedAt = effectiveClosedAt ?? interval.closedAt ?? interval.timeEntry?.clockOutAt ?? null

  if (!interval.positionId) {
    return NextResponse.json({ error: "Position is required for this interval" }, { status: 400 })
  }

  const url = new URL(request.url)
  const whenParam = url.searchParams.get("when")
  const whenFilter = whenValues.includes(whenParam as (typeof whenValues)[number])
    ? (whenParam as (typeof whenValues)[number])
    : null

  try {
    const allowUpdate = isPlannedStatus(resolvedStatus)
    const templatesByWhen = await getRuleTemplatesForPositionAndDate(
      prisma,
      interval.positionId,
      interval.workday.workDate,
    )
    await prisma.$transaction(async (tx) => {
      await ensureProceduresForInterval(tx, interval.id, templatesByWhen, allowUpdate)
    })

    const intervalComponents = interval.useCustomPay
      ? await prisma.workIntervalPayComponent.findMany({
          where: { workIntervalId: interval.id, isActive: true },
          orderBy: [{ priority: "desc" }, { componentType: "asc" }],
        })
      : []
    const employeeComponents = interval.useCustomPay
      ? []
      : await prisma.employeePayComponent.findMany({
          where: { employeeId: interval.employeeId, isActive: true },
          orderBy: [{ priority: "desc" }, { componentType: "asc" }],
        })
    const payComponents = resolveIntervalPayComponents({
      useCustomPay: interval.useCustomPay,
      intervalComponents: intervalComponents.map((component) => ({
        componentType: component.componentType,
        amountCents: component.amountCents,
        rateBp: component.rateBp,
        isActive: component.isActive,
      })),
      employeeComponents: employeeComponents.map((component) => ({
        componentType: component.componentType,
        amountCents: component.amountCents,
        rateBp: component.rateBp,
        isActive: component.isActive,
      })),
    })
    const componentByType = new Map(payComponents.map((component) => [component.componentType, component]))
    const hourlyComponent = componentByType.get("hourly")
    const fixedComponent = componentByType.get("fixed_shift")
    const percentComponent = componentByType.get("percent_revenue")

    const startedAt = resolvedOpenedAt ?? interval.startAt
    const elapsedUntil = resolvedStatus === "in_progress" ? new Date() : resolvedClosedAt ?? interval.endAt
    const elapsedMinutes = toMinutes(startedAt, elapsedUntil)
    const baseMinutes = computeIntervalMinutesWorked({
      interval: {
        startAt: interval.startAt,
        endAt: interval.endAt,
        openedAt: resolvedOpenedAt ?? undefined,
        closedAt: resolvedClosedAt ?? undefined,
        breakMinutes: interval.breakMinutes,
      },
      timeEntry: interval.timeEntry,
    })

    const effectiveMinutes = resolvedStatus === "in_progress" ? elapsedMinutes : baseMinutes.minutesWorked
    const compensation = computeIntervalCompensation({
      interval: {
        status: resolvedStatus,
        revenueCents: interval.revenueCents,
      },
      minutesWorked: effectiveMinutes,
      components: payComponents,
    })
    const salaryMessage =
      percentComponent && interval.revenueCents == null ? "Зарплата расчитается после смены" : null
    const estimatedSalaryCents = salaryMessage
      ? null
      : compensation.grossPayCents > 0
        ? compensation.grossPayCents
        : null

    const procedures = await prisma.workIntervalProcedure.findMany({
      where: {
        workIntervalId: interval.id,
        ...(whenFilter ? { when: whenFilter } : {}),
      },
      include: {
        rules: {
          include: {
            checklistItems: { orderBy: { order: "asc" } },
            answers: {
              where: { workIntervalId: interval.id },
              include: { checklistItems: true },
            },
          },
          orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: { when: "asc" },
    })

    const [cashFields, cashFormulas] = await Promise.all([
      listCashRegisterFields(prisma, {
        locationId: interval.workday.locationId,
        isActive: true,
      }),
      prisma.cashRegisterFormula.findMany({
        where: { locationId: interval.workday.locationId },
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      }),
    ])

    const cashFieldsByWhen = {
      OPEN: cashFields
        .filter((field) => field.inputStage === "open")
        .map((field) => ({
          key: field.key,
          label: field.label,
          isRequired: field.isRequired,
          isPhotoRequired: field.isPhotoRequired,
        })),
      CLOSE: cashFields
        .filter((field) => field.inputStage === "close")
        .map((field) => ({
          key: field.key,
          label: field.label,
          isRequired: field.isRequired,
          isPhotoRequired: field.isPhotoRequired,
        })),
    }

    const cashSourceByWhen = await findWorkdayCashSourceAnswers(prisma, {
      workdayId: interval.workday.id,
      whens: whenFilter ? [whenFilter] : undefined,
      selection: {
        mode: "complete",
        fieldsByWhen: {
          OPEN: cashFieldsByWhen.OPEN.map((field) => ({
            key: field.key,
            isRequired: field.isRequired,
            isPhotoRequired: field.isPhotoRequired,
          })),
          CLOSE: cashFieldsByWhen.CLOSE.map((field) => ({
            key: field.key,
            isRequired: field.isRequired,
            isPhotoRequired: field.isPhotoRequired,
          })),
        },
      },
    })

    const openPackedValues: string[] = []
    const closePackedValues: string[] = []

    const sourceOpenPacked = (cashSourceByWhen.OPEN?.inputValue ?? "").trim()
    if (sourceOpenPacked) {
      openPackedValues.push(sourceOpenPacked)
    } else {
      for (const procedure of procedures) {
        if (procedure.when !== "OPEN") continue
        for (const rule of procedure.rules) {
          if (rule.type !== "CASH") continue
          const packed = (rule.answers[0]?.inputValue ?? "").trim()
          if (!packed) continue
          openPackedValues.push(packed)
        }
      }
    }

    const sourceClosePacked = (cashSourceByWhen.CLOSE?.inputValue ?? "").trim()
    if (sourceClosePacked) {
      closePackedValues.push(sourceClosePacked)
    } else {
      for (const procedure of procedures) {
        if (procedure.when !== "CLOSE") continue
        for (const rule of procedure.rules) {
          if (rule.type !== "CASH") continue
          const packed = (rule.answers[0]?.inputValue ?? "").trim()
          if (!packed) continue
          closePackedValues.push(packed)
        }
      }
    }

    const formulaCalculations = buildCashFormulaCalculations({
      formulas: cashFormulas.map((formula) => ({
        resultKey: formula.resultKey,
        resultLabel: formula.resultLabel,
        expression: formula.expression,
        isTipsSource: formula.isTipsSource,
        displayOrder: formula.displayOrder,
      })),
      allowedFieldKeys: new Set(cashFields.map((field) => field.key)),
      openPackedValues,
      closePackedValues,
      openFieldKeys: cashFieldsByWhen.OPEN.map((field) => field.key),
      closeFieldKeys: cashFieldsByWhen.CLOSE.map((field) => field.key),
      currency: session?.organization?.currency ?? null,
    })

    const shouldResolveCloseCashSkip =
      resolvedStatus === "in_progress" &&
      procedures.some((procedure) => procedure.when === "CLOSE" && procedure.rules.some((rule) => rule.type === "CASH"))
    const closeCashSkipEligibility = shouldResolveCloseCashSkip
      ? await getCloseCashSkipEligibility(prisma, {
          intervalId: interval.id,
          workdayId: interval.workday.id,
          workDate: interval.workday.workDate,
        })
      : null

    const formatted = procedures.map((procedure) => {
      const cashSource = cashSourceByWhen[procedure.when]
      const cashLockedByWorkday = Boolean(cashSource && cashSource.workIntervalId !== interval.id)

      return {
        id: procedure.id,
        when: procedure.when,
        totalRequired: procedure.totalRequired,
        completedRequired: procedure.completedRequired,
        cashClosePolicy:
          procedure.when === "CLOSE" &&
          !cashLockedByWorkday &&
          closeCashSkipEligibility?.hasCloseCashRule
            ? {
                canSkip: closeCashSkipEligibility.canSkip,
                reason: closeCashSkipEligibility.reason,
                remainingCashEmployees: closeCashSkipEligibility.remainingCashEmployees,
              }
            : null,
        rules: procedure.rules.map((rule) => {
          const currentAnswer = rule.answers[0] ?? null

          const mappedAnswer =
            rule.type === "CASH" && cashSource
              ? {
                  id: cashSource.answerId,
                  type: "CASH" as const,
                  inputValue: cashSource.inputValue,
                  photoS3Key: null,
                  photoUrl: null,
                  cashPhotos: normalizeCashProcedurePhotoMap(
                    cashSource.cashPhotosJson,
                    new Set(cashFieldsByWhen[procedure.when].map((field) => field.key)),
                  ),
                  photoComment: null,
                  photoDeletedAt: null,
                  checklistItems: [] as Array<{ itemId: string; isChecked: boolean }>,
                }
              : currentAnswer
                ? {
                    id: currentAnswer.id,
                    type: currentAnswer.type,
                    inputValue: currentAnswer.inputValue,
                    photoS3Key: currentAnswer.photoS3Key,
                    photoUrl: currentAnswer.photoUrl,
                    cashPhotos: normalizeCashProcedurePhotoMap(
                      currentAnswer.cashPhotosJson,
                      new Set((rule.type === "CASH" ? cashFieldsByWhen[procedure.when] : []).map((field) => field.key)),
                    ),
                    photoComment: currentAnswer.photoComment,
                    photoDeletedAt: currentAnswer.photoDeletedAt?.toISOString() ?? null,
                    checklistItems: currentAnswer.checklistItems.map((item) => ({
                      itemId: item.itemId,
                      isChecked: item.isChecked,
                    })),
                  }
                : null

          return {
            id: rule.id,
            type: rule.type,
            title: rule.title,
            required: rule.required,
            order: rule.order,
            cashFields: rule.type === "CASH" ? cashFieldsByWhen[procedure.when] : [],
            cashLocked: rule.type === "CASH" ? cashLockedByWorkday : false,
            cashLockMessage:
              rule.type === "CASH" && cashLockedByWorkday
                ? "Значения уже установлены другим сотрудником для этого рабочего дня"
                : null,
            cashSourceIntervalId: rule.type === "CASH" ? cashSource?.workIntervalId ?? null : null,
            checklistItems: rule.checklistItems.map((item) => ({
              id: item.id,
              title: item.title,
              order: item.order,
            })),
            answer: mappedAnswer,
          }
        }),
      }
    })

    return NextResponse.json({
      data: {
        interval: {
          id: interval.id,
          status: resolvedStatus,
          startAt: interval.startAt.toISOString(),
          endAt: interval.endAt.toISOString(),
          openedAt: resolvedOpenedAt?.toISOString() ?? null,
          closedAt: resolvedClosedAt?.toISOString() ?? null,
          positionId: interval.positionId,
          workDate: interval.workday.workDate.toISOString().split("T")[0],
          payPreview: {
            hourlyRateCents: hourlyComponent?.amountCents ?? null,
            fixedShiftRateCents: fixedComponent?.amountCents ?? null,
            percentRevenueBp: percentComponent?.rateBp ?? null,
            elapsedMinutes,
            estimatedSalaryCents:
              estimatedSalaryCents != null && estimatedSalaryCents > 0 ? estimatedSalaryCents : null,
            salaryMessage,
            currency: session?.organization?.currency ?? null,
          },
          canForce: hasManagementAccess,
        },
        procedures: formatted,
        formulaCalculations,
      },
    })
  } catch (error) {
    if (isProceduresSchemaMissing(error)) {
      return NextResponse.json({
        data: {
          interval: {
            id: interval.id,
            status: resolvedStatus,
            startAt: interval.startAt.toISOString(),
            endAt: interval.endAt.toISOString(),
            openedAt: resolvedOpenedAt?.toISOString() ?? null,
            closedAt: resolvedClosedAt?.toISOString() ?? null,
            positionId: interval.positionId,
            workDate: interval.workday.workDate.toISOString().split("T")[0],
            payPreview: null,
            canForce: hasManagementAccess,
          },
          procedures: [],
          formulaCalculations: {
            items: [],
            hasCashInput: false,
            currency: session?.organization?.currency ?? null,
            error: null,
          },
        },
        warning: "Таблицы процедур недоступны. Чек-листы временно отключены.",
        code: "PROCEDURES_SCHEMA_MISSING",
      })
    }
    console.error("[api/work-intervals/procedures]", error)
    return NextResponse.json(
      {
        error: "Не удалось загрузить процедуры смены.",
      },
      { status: 500 },
    )
  }
}
