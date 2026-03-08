import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getCashAuthContext, resolveOrganizationLocationId } from "@/lib/cash/access"
import { validateAndCompileCashFormulaSet } from "@/lib/cash/formula"
import {
  buildSessionFieldSnapshots,
  computeCashSessionSnapshotTotals,
  isCashInputStage,
  isValidCashFieldKey,
  sortCashFields,
  type CashFieldConfig,
} from "@/lib/cash/module"
import { listCashRegisterFields, setCashRegisterFieldPhotoRequired } from "@/lib/cash/fields-query"
import { syncWorkdayRevenueFromCashSessions } from "@/lib/cash/revenue-allocation"
import { syncWorkdayTipsFromCashSessions } from "@/lib/cash/tips-sync"

const fieldSchema = z.object({
  id: z.string().uuid().optional(),
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
  inputStage: z.enum(["open", "close"]),
  isRequired: z.boolean().default(true),
  isPhotoRequired: z.boolean().default(false),
  isRevenueBasis: z.boolean().default(false),
  isActive: z.boolean().default(true),
  displayOrder: z.number().int().default(0),
  defaultSign: z.number().int().default(1),
})

const formulaSchema = z.object({
  id: z.string().uuid().optional(),
  resultKey: z.string().trim().min(1),
  resultLabel: z.string().trim().min(1),
  expression: z.string().trim().min(1),
  isTipsSource: z.boolean().default(false),
  isRevenueSource: z.boolean().default(false),
  displayOrder: z.number().int().default(0),
})

const putPayloadSchema = z.object({
  locationId: z.string().uuid().optional(),
  fields: z.array(fieldSchema).min(1),
  formulas: z.array(formulaSchema).min(1).optional(),
  formula: formulaSchema.optional(),
  overwriteExistingSessions: z.boolean().default(false),
})

export async function GET(request: Request) {
  const auth = await getCashAuthContext({ requireManage: true })
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const url = new URL(request.url)
  const requestedLocationId = url.searchParams.get("locationId")
  const locationResult = await resolveOrganizationLocationId(auth.organizationId, requestedLocationId)
  if (!locationResult.ok) {
    return NextResponse.json({ error: locationResult.error }, { status: locationResult.status })
  }

  const [fields, formulas] = await Promise.all([
    listCashRegisterFields(prisma, {
      locationId: locationResult.locationId,
    }),
    prisma.cashRegisterFormula.findMany({
      where: { locationId: locationResult.locationId },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    }),
  ])
  return NextResponse.json({
    data: {
      locationId: locationResult.locationId,
      fields,
      formula: formulas[0] ?? null,
      formulas,
    },
  })
}

export async function PUT(request: Request) {
  const auth = await getCashAuthContext({ requireManage: true })
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!auth.isManagementRole) {
    return NextResponse.json({ error: "Только владелец или менеджер может менять настройки кассы" }, { status: 403 })
  }

  const json = await request.json().catch(() => null)
  const parsed = putPayloadSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const payload = parsed.data
  const rawFormulas = payload.formulas ?? (payload.formula ? [payload.formula] : [])
  const locationResult = await resolveOrganizationLocationId(auth.organizationId, payload.locationId)
  if (!locationResult.ok) {
    return NextResponse.json({ error: locationResult.error }, { status: locationResult.status })
  }

  const normalizedFields = payload.fields.map((field) => ({
    ...field,
    key: field.key.trim().toLowerCase(),
    label: field.label.trim(),
    defaultSign: field.defaultSign === -1 ? -1 : 1,
    isPhotoRequired: Boolean(field.isPhotoRequired),
  }))

  const duplicateKey = findDuplicateKey(normalizedFields.map((field) => field.key))
  if (duplicateKey) {
    return NextResponse.json({ error: "Названия полей должны быть уникальными." }, { status: 400 })
  }

  for (const field of normalizedFields) {
    if (!isValidCashFieldKey(field.key)) {
      return NextResponse.json(
        {
          error: "Не удалось сохранить одно из полей. Измените название и попробуйте снова.",
        },
        { status: 400 },
      )
    }
  }

  const activeFields = normalizedFields.filter((field) => field.isActive)
  if (activeFields.length === 0) {
    return NextResponse.json({ error: "Нужно оставить хотя бы одно активное поле" }, { status: 400 })
  }

  if (rawFormulas.length === 0) {
    return NextResponse.json({ error: "Добавьте хотя бы одну формулу" }, { status: 400 })
  }

  const normalizedFormulas = rawFormulas.map((formula, index) => ({
    ...formula,
    resultKey: formula.resultKey.trim().toLowerCase(),
    resultLabel: formula.resultLabel.trim(),
    expression: formula.expression.trim(),
    isTipsSource: Boolean(formula.isTipsSource),
    isRevenueSource: Boolean(formula.isRevenueSource),
    displayOrder: Number.isInteger(formula.displayOrder) ? formula.displayOrder : index,
  }))

  const duplicateFormulaKey = findDuplicateKey(normalizedFormulas.map((formula) => formula.resultKey))
  if (duplicateFormulaKey) {
    return NextResponse.json({ error: "Названия расчетов должны быть уникальными." }, { status: 400 })
  }

  for (const formula of normalizedFormulas) {
    if (!isValidCashFieldKey(formula.resultKey)) {
      return NextResponse.json(
        {
          error: "Не удалось сохранить один из расчетов. Измените название и попробуйте снова.",
        },
        { status: 400 },
      )
    }
  }

  const tipsSourceFormulas = normalizedFormulas.filter((formula) => formula.isTipsSource)
  if (tipsSourceFormulas.length > 1) {
    return NextResponse.json(
      {
        error: "Только один расчет может быть отмечен как источник чаевых.",
      },
      { status: 400 },
    )
  }

  const revenueSourceFormulas = normalizedFormulas.filter((formula) => formula.isRevenueSource)
  if (revenueSourceFormulas.length > 1) {
    return NextResponse.json(
      {
        error: "Только один расчет может быть отмечен как источник выручки.",
      },
      { status: 400 },
    )
  }

  const mixedRoleFormula = normalizedFormulas.find((formula) => formula.isTipsSource && formula.isRevenueSource)
  if (mixedRoleFormula) {
    return NextResponse.json(
      {
        error: `В расчете «${mixedRoleFormula.resultLabel}» нельзя одновременно включать «Расчет чаевых» и «Данные для выручки».`,
      },
      { status: 400 },
    )
  }

  const activeRevenueBasis = activeFields.filter((field) => field.isRevenueBasis)
  if (activeRevenueBasis.length > 1) {
    return NextResponse.json(
      {
        error: "Для расчета зарплаты можно выбрать только одно поле-источник выручки",
      },
      { status: 400 },
    )
  }

  if (activeRevenueBasis.length === 1 && activeRevenueBasis[0].inputStage !== "close") {
    return NextResponse.json(
      {
        error: "Поле-источник выручки должно быть полем закрытия",
      },
      { status: 400 },
    )
  }

  const allowedFieldKeys = new Set(activeFields.map((field) => field.key))
  const conflictingFormula = normalizedFormulas.find((formula) => allowedFieldKeys.has(formula.resultKey))
  if (conflictingFormula) {
    return NextResponse.json(
      {
        error: `Название расчета «${conflictingFormula.resultLabel}» конфликтует с названием поля. Переименуйте расчет.`,
      },
      { status: 400 },
    )
  }

  const formulaValidation = validateAndCompileCashFormulaSet(
    normalizedFormulas.map((formula) => ({
      resultKey: formula.resultKey,
      resultLabel: formula.resultLabel,
      expression: formula.expression,
      displayOrder: formula.displayOrder,
    })),
    allowedFieldKeys,
  )
  if (!formulaValidation.ok) {
    return NextResponse.json(
      {
        error: formulaValidation.error,
      },
      { status: 400 },
    )
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const [existingFields, existingFormulas] = await Promise.all([
        tx.cashRegisterField.findMany({
          where: { locationId: locationResult.locationId },
        }),
        tx.cashRegisterFormula.findMany({
          where: { locationId: locationResult.locationId },
        }),
      ])
      const existingById = new Map(existingFields.map((field) => [field.id, field]))
      const existingFormulaById = new Map(existingFormulas.map((formula) => [formula.id, formula]))
      const keepIds: string[] = []
      const keepFormulaIds: string[] = []

      for (const field of normalizedFields) {
        if (field.id && existingById.has(field.id)) {
          const updated = await tx.cashRegisterField.update({
            where: { id: field.id },
            data: {
              key: field.key,
              label: field.label,
              inputStage: field.inputStage,
              isRequired: field.isRequired,
              isRevenueBasis: field.isActive ? field.isRevenueBasis : false,
              isActive: field.isActive,
              displayOrder: field.displayOrder,
              defaultSign: field.defaultSign,
            },
          })
          await setCashRegisterFieldPhotoRequired(tx, {
            id: updated.id,
            isPhotoRequired: field.isPhotoRequired,
          })
          keepIds.push(updated.id)
          continue
        }

        const upserted = await tx.cashRegisterField.upsert({
          where: {
            locationId_key: {
              locationId: locationResult.locationId,
              key: field.key,
            },
          },
          create: {
            locationId: locationResult.locationId,
            key: field.key,
            label: field.label,
            inputStage: field.inputStage,
            isRequired: field.isRequired,
            isRevenueBasis: field.isActive ? field.isRevenueBasis : false,
            isActive: field.isActive,
            displayOrder: field.displayOrder,
            defaultSign: field.defaultSign,
          },
          update: {
            label: field.label,
            inputStage: field.inputStage,
            isRequired: field.isRequired,
            isRevenueBasis: field.isActive ? field.isRevenueBasis : false,
            isActive: field.isActive,
            displayOrder: field.displayOrder,
            defaultSign: field.defaultSign,
          },
        })
        await setCashRegisterFieldPhotoRequired(tx, {
          id: upserted.id,
          isPhotoRequired: field.isPhotoRequired,
        })
        keepIds.push(upserted.id)
      }

      if (keepIds.length > 0) {
        await tx.cashRegisterField.updateMany({
          where: {
            locationId: locationResult.locationId,
            id: { notIn: keepIds },
            isActive: true,
          },
          data: {
            isActive: false,
            isRevenueBasis: false,
          },
        })
      }

      for (const formula of normalizedFormulas) {
        if (formula.id && existingFormulaById.has(formula.id)) {
          const updated = await tx.cashRegisterFormula.update({
            where: { id: formula.id },
            data: {
              resultKey: formula.resultKey,
              resultLabel: formula.resultLabel,
              expression: formula.expression,
              isTipsSource: formula.isTipsSource,
              isRevenueSource: formula.isRevenueSource,
              displayOrder: formula.displayOrder,
            },
          })
          keepFormulaIds.push(updated.id)
          continue
        }

        const upserted = await tx.cashRegisterFormula.upsert({
          where: {
            locationId_resultKey: {
              locationId: locationResult.locationId,
              resultKey: formula.resultKey,
            },
          },
          create: {
            locationId: locationResult.locationId,
            resultKey: formula.resultKey,
            resultLabel: formula.resultLabel,
            expression: formula.expression,
            isTipsSource: formula.isTipsSource,
            isRevenueSource: formula.isRevenueSource,
            displayOrder: formula.displayOrder,
          },
          update: {
            resultLabel: formula.resultLabel,
            expression: formula.expression,
            isTipsSource: formula.isTipsSource,
            isRevenueSource: formula.isRevenueSource,
            displayOrder: formula.displayOrder,
          },
        })
        keepFormulaIds.push(upserted.id)
      }

      if (keepFormulaIds.length > 0) {
        await tx.cashRegisterFormula.deleteMany({
          where: {
            locationId: locationResult.locationId,
            id: { notIn: keepFormulaIds },
          },
        })
      }

      const activeFieldsForOverwrite = await listCashRegisterFields(tx, {
        locationId: locationResult.locationId,
        isActive: true,
      })
      const invalidStoredField = activeFieldsForOverwrite.find((field) => !isCashInputStage(field.inputStage))
      if (invalidStoredField) {
        throw new Error(`Некорректный input_stage в поле кассы: ${invalidStoredField.key}`)
      }

      let overwriteStats: { affectedSessions: number; affectedWorkdays: number } | null = null
      if (payload.overwriteExistingSessions) {
        overwriteStats = await overwriteCashSettingsInOpenAndClosedSessions(tx, {
          locationId: locationResult.locationId,
          fields: activeFieldsForOverwrite.map((field) => ({
            id: field.id,
            key: field.key,
            label: field.label,
            inputStage: field.inputStage as "open" | "close",
            isRequired: field.isRequired,
            isPhotoRequired: field.isPhotoRequired,
            isRevenueBasis: field.isRevenueBasis,
            displayOrder: field.displayOrder,
          })),
          actorUserId: auth.userId,
        })
      }

      const [nextFields, nextFormulas] = await Promise.all([
        listCashRegisterFields(tx, {
          locationId: locationResult.locationId,
        }),
        tx.cashRegisterFormula.findMany({
          where: { locationId: locationResult.locationId },
          orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
        }),
      ])
      return {
        fields: nextFields,
        formula: nextFormulas[0] ?? null,
        formulas: nextFormulas,
        overwrite: overwriteStats,
      }
    })

    return NextResponse.json({ data: result })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        {
          error:
            "Конфликт сохранения. Проверьте уникальность названий полей и расчетов, единственный источник чаевых/выручки и выбор источника выручки для полей.",
        },
        { status: 409 },
      )
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2004") {
      return NextResponse.json(
        {
          error:
            "Проверка ограничений не пройдена. Убедитесь, что в формуле активен только один спец-тоггл и для каждой роли выбран только один расчет.",
        },
        { status: 400 },
      )
    }

    console.error("[api/cash/settings][PUT]", error)
    return NextResponse.json(
      {
        error: "Не удалось сохранить настройки кассы",
      },
      { status: 500 },
    )
  }
}

async function overwriteCashSettingsInOpenAndClosedSessions(
  tx: Prisma.TransactionClient,
  input: {
    locationId: string
    fields: CashFieldConfig[]
    actorUserId: string
  },
) {
  const cashSessions = await tx.cashSession.findMany({
    where: {
      cashRegister: {
        locationId: input.locationId,
      },
      status: { in: ["open", "closing_draft", "closed"] },
    },
    select: {
      id: true,
      status: true,
      workdayId: true,
      fieldValues: {
        select: {
          fieldKeySnapshot: true,
          valueCents: true,
        },
      },
    },
  })

  if (cashSessions.length === 0) {
    return {
      affectedSessions: 0,
      affectedWorkdays: 0,
    }
  }

  const configFields: CashFieldConfig[] = sortCashFields(input.fields)

  const affectedWorkdayIds = new Set<string>()

  for (const cashSession of cashSessions) {
    const existingByKey = Object.fromEntries(
      cashSession.fieldValues.map((value) => [value.fieldKeySnapshot, { valueCents: value.valueCents }]),
    )

    const snapshotResult = buildSessionFieldSnapshots({
      fields: configFields,
      values: {},
      existingByKey,
    })

    if (!snapshotResult.ok) {
      throw new Error(snapshotResult.error)
    }

    const totals = computeCashSessionSnapshotTotals({
      allFields: configFields,
      fieldValues: snapshotResult.snapshots,
    })

    if (!totals.ok) {
      throw new Error(totals.error)
    }

    await tx.cashSessionFieldValue.deleteMany({
      where: { cashSessionId: cashSession.id },
    })

    await tx.cashSessionFieldValue.createMany({
      data: snapshotResult.snapshots.map((snapshot) => ({
        cashSessionId: cashSession.id,
        cashRegisterFieldId: snapshot.cashRegisterFieldId || null,
        fieldKeySnapshot: snapshot.fieldKeySnapshot,
        fieldLabelSnapshot: snapshot.fieldLabelSnapshot,
        inputStage: snapshot.inputStage,
        isRequiredSnapshot: snapshot.isRequiredSnapshot,
        valueCents: snapshot.valueCents,
        isRevenueBasisSnapshot: snapshot.isRevenueBasisSnapshot,
        source: snapshot.source ?? "manual",
      })),
    })

    await tx.cashSession.update({
      where: { id: cashSession.id },
      data: {
        openingCashCents: totals.openingCashCents,
        closingCashCents: totals.closingCashCents,
        expectedCashCents: 0,
        diffCashCents: 0,
        formulaExpressionSnapshot: null,
        formulaResultLabelSnapshot: null,
        lockVersion: { increment: 1 },
      },
    })

    await tx.cashSessionAuditLog.create({
      data: {
        cashSessionId: cashSession.id,
        actorUserId: input.actorUserId,
        action: "overwrite_applied",
        reason: "Применено принудительное overwrite настроек кассы",
      },
    })

    if (cashSession.status === "closed") {
      affectedWorkdayIds.add(cashSession.workdayId)
    }
  }

  for (const workdayId of affectedWorkdayIds) {
    await syncWorkdayRevenueFromCashSessions(tx, workdayId)
    await syncWorkdayTipsFromCashSessions(tx, {
      workdayId,
      locationId: input.locationId,
    })
  }

  return {
    affectedSessions: cashSessions.length,
    affectedWorkdays: affectedWorkdayIds.size,
  }
}

function findDuplicateKey(keys: string[]) {
  const seen = new Set<string>()
  for (const key of keys) {
    if (seen.has(key)) {
      return key
    }
    seen.add(key)
  }
  return null
}
