import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getAuthorizedInterval } from "@/lib/procedures/access"
import { getRuleTemplatesForPositionAndDate } from "@/lib/procedures/templates"
import { ensureProceduresForInterval } from "@/lib/procedures/snapshots"
import { isClosedStatus, isPlannedStatus } from "@/lib/procedures/status"
import {
  decodeCashProcedureValues,
  getMissingCashProcedurePhotoFieldKeys,
  normalizeCashProcedurePackedInput,
  normalizeCashProcedurePhotoMap,
} from "@/lib/cash/procedure-values"
import { listCashRegisterFields } from "@/lib/cash/fields-query"
import { findWorkdayCashSourceAnswer } from "@/lib/cash/workday-cash-source"
import { syncCashSessionFromWorkdayProcedures } from "@/lib/cash/session-sync"

const whenValues = ["OPEN", "CLOSE"] as const
const typeValues = ["CHECKLIST", "INPUT", "PHOTO", "CASH"] as const

const checklistItemSchema = z.object({
  itemId: z.string().uuid(),
  isChecked: z.boolean(),
})

const cashPhotoSchema = z.object({
  photoS3Key: z.string().trim().max(1000).optional().nullable(),
  photoUrl: z.string().trim().max(3000).optional().nullable(),
})

const answerSchema = z.object({
  ruleId: z.string().uuid(),
  type: z.enum(typeValues),
  inputValue: z.string().max(150).optional().nullable(),
  cashPhotos: z.record(cashPhotoSchema).optional(),
  photoS3Key: z.string().optional().nullable(),
  photoUrl: z.string().optional().nullable(),
  photoComment: z.string().max(300).optional().nullable(),
  checklistItems: z.array(checklistItemSchema).optional(),
})

const payloadSchema = z.object({
  when: z.enum(whenValues),
  answers: z.array(answerSchema),
})

type RouteContext = { params: Promise<{ id: string }> }

const isProceduresSchemaMissing = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  (error.code === "P2021" || error.code === "P2022")

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params
  const { interval, effectiveStatus, error, status } = await getAuthorizedInterval(id)
  if (error || !interval) {
    return NextResponse.json({ error }, { status })
  }
  const resolvedStatus = effectiveStatus ?? interval.status

  if (isClosedStatus(resolvedStatus)) {
    return NextResponse.json({ error: "Shift is closed" }, { status: 409 })
  }
  if (!interval.positionId) {
    return NextResponse.json({ error: "Position is required for this interval" }, { status: 400 })
  }

  const json = await request.json().catch(() => null)
  const parsed = payloadSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { when, answers } = parsed.data
  if (when === "CLOSE" && resolvedStatus !== "in_progress") {
    return NextResponse.json({ error: "Close rules can be filled only for opened shifts" }, { status: 409 })
  }
  const allowUpdate = isPlannedStatus(resolvedStatus)

  try {
    await prisma.$transaction(async (tx) => {
      const templatesByWhen = await getRuleTemplatesForPositionAndDate(
        tx,
        interval.positionId as string,
        interval.workday.workDate,
      )
      await ensureProceduresForInterval(tx, interval.id, templatesByWhen, allowUpdate)

      const procedure = await tx.workIntervalProcedure.findUnique({
        where: { workIntervalId_when: { workIntervalId: interval.id, when } },
        include: { rules: { include: { checklistItems: true } } },
      })

      if (!procedure) {
        throw new Error("Procedure not found")
      }

      const cashFields = await listCashRegisterFields(tx, {
        locationId: interval.workday.locationId,
        isActive: true,
        inputStage: when === "OPEN" ? "open" : "close",
      })
      const cashFieldsByKey = new Map(cashFields.map((field) => [field.key, field]))
      const cashFieldKeys = cashFields.map((field) => field.key)
      const workdayCashSource = await findWorkdayCashSourceAnswer(tx, {
        workdayId: interval.workday.id,
        when,
        selectionMode: "complete",
        fields: cashFields.map((field) => ({
          key: field.key,
          isRequired: field.isRequired,
          isPhotoRequired: field.isPhotoRequired,
        })),
      })

      const ruleById = new Map(procedure.rules.map((rule) => [rule.id, rule]))
      let touchedCashRule = false
      for (const payload of answers) {
        const rule = ruleById.get(payload.ruleId)
        if (!rule) {
          continue
        }

        if (rule.type === "CASH" && workdayCashSource && workdayCashSource.workIntervalId !== interval.id) {
          // Cash is already set for this workday by another interval.
          continue
        }
        if (rule.type === "CASH") {
          touchedCashRule = true
        }

        let inputValue: string | null = null
        let cashPhotosJson: Record<string, { photoS3Key: string | null; photoUrl: string | null }> | null = null
        if (rule.type === "INPUT") {
          inputValue = (payload.inputValue ?? "").slice(0, 150)
        } else if (rule.type === "CASH") {
          const normalized = normalizeCashProcedurePackedInput(payload.inputValue ?? "")
          if (!normalized.ok) {
            throw new Error(`VALIDATION_ERROR:${normalized.error}`)
          }
          if (normalized.packed.length > 150) {
            throw new Error("VALIDATION_ERROR:Слишком много данных кассы. Сократите количество заполненных значений.")
          }
          inputValue = normalized.packed

          const decodedValues = decodeCashProcedureValues(inputValue, cashFieldKeys)
          const normalizedCashPhotos = normalizeCashProcedurePhotoMap(payload.cashPhotos ?? {}, new Set(cashFieldKeys))

          const missingPhotoKeys = getMissingCashProcedurePhotoFieldKeys({
            packed: inputValue,
            fields: cashFields.map((field) => ({
              key: field.key,
              isRequired: false,
              isPhotoRequired: field.isPhotoRequired,
            })),
            photosRaw: normalizedCashPhotos,
          })

          if (missingPhotoKeys.length > 0) {
            const missingLabels = missingPhotoKeys.map((key) => cashFieldsByKey.get(key)?.label || key)
            throw new Error(`VALIDATION_ERROR:Загрузите фото для полей кассы: ${missingLabels.join(", ")}`)
          }

          // If a field has no valid integer token, its photo is ignored.
          const filteredCashPhotos = Object.fromEntries(
            Object.entries(normalizedCashPhotos).filter(([key]) => {
              const token = decodedValues[key] ?? ""
              return token.length > 0
            }),
          )
          cashPhotosJson = Object.keys(filteredCashPhotos).length > 0 ? filteredCashPhotos : null
        }

        const photoS3Key = rule.type === "PHOTO" ? payload.photoS3Key ?? null : null
        const photoUrl = rule.type === "PHOTO" ? payload.photoUrl ?? null : null
        const photoComment = rule.type === "PHOTO" ? payload.photoComment?.trim() || null : null
        const cashPhotosValue = cashPhotosJson
          ? (cashPhotosJson as Prisma.InputJsonValue)
          : Prisma.DbNull

        const answer = await tx.workIntervalProcedureAnswer.upsert({
          where: { workIntervalId_ruleId: { workIntervalId: interval.id, ruleId: rule.id } },
          create: {
            workIntervalId: interval.id,
            ruleId: rule.id,
            when,
            type: rule.type,
            inputValue,
            photoS3Key,
            photoUrl,
            cashPhotosJson: cashPhotosValue,
            photoComment,
            photoDeletedAt: null,
          },
          update: {
            when,
            type: rule.type,
            inputValue,
            photoS3Key,
            photoUrl,
            cashPhotosJson: cashPhotosValue,
            photoComment,
            photoDeletedAt: null,
          },
        })

        if (rule.type === "CHECKLIST") {
          const stateByItemId = new Map((payload.checklistItems ?? []).map((item) => [item.itemId, item.isChecked]))
          for (const item of rule.checklistItems) {
            const isChecked = stateByItemId.get(item.id) ?? false
            await tx.workIntervalProcedureAnswerChecklistItem.upsert({
              where: {
                answerId_itemId: {
                  answerId: answer.id,
                  itemId: item.id,
                },
              },
              create: {
                answerId: answer.id,
                itemId: item.id,
                isChecked,
              },
              update: {
                isChecked,
              },
            })
          }
        } else {
          await tx.workIntervalProcedureAnswerChecklistItem.deleteMany({ where: { answerId: answer.id } })
        }
      }

      if (touchedCashRule) {
        await syncCashSessionFromWorkdayProcedures(tx, {
          workdayId: interval.workday.id,
          locationId: interval.workday.locationId,
        })
      }
    })
  } catch (err: any) {
    if (err instanceof Error && err.message.startsWith("VALIDATION_ERROR:")) {
      return NextResponse.json({ error: err.message.replace("VALIDATION_ERROR:", "") }, { status: 400 })
    }

    if (isProceduresSchemaMissing(err)) {
      return NextResponse.json({
        ok: true,
        warning: "Таблицы процедур недоступны. Ответы не сохранены.",
        code: "PROCEDURES_SCHEMA_MISSING",
      })
    }
    const message = err?.message || "Failed to save answers"
    const statusCode = message === "Procedure not found" ? 404 : 500
    return NextResponse.json({ error: message }, { status: statusCode })
  }

  return NextResponse.json({ ok: true })
}
