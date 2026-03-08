import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getCashAuthContext } from "@/lib/cash/access"
import {
  buildSessionFieldSnapshots,
  computeCashSessionSnapshotTotals,
  isCashInputStage,
  parseCashFieldValuesPayload,
  sortCashFields,
  type CashFieldConfig,
} from "@/lib/cash/module"
import {
  createCashSessionAuditLog,
  getCashSessionForOrganization,
  replaceCashSessionFieldSnapshots,
} from "@/lib/cash/session-service"
import { syncWorkdayRevenueFromCashSessions } from "@/lib/cash/revenue-allocation"
import { syncWorkdayTipsFromCashSessions } from "@/lib/cash/tips-sync"
import { notifyOrganizationOwners, toEventActorName, toEventDateLabel } from "@/lib/notifications/owner-events"
import { toNotificationDateOnly } from "@/lib/notifications/navigation"

type RouteContext = { params: Promise<{ id: string }> }

const closePayloadSchema = z.object({
  values: z.record(z.union([z.number(), z.string()])).default({}),
  notes: z.string().trim().max(500).optional().nullable(),
  lockVersion: z.number().int().optional(),
})

export async function POST(request: Request, context: RouteContext) {
  const auth = await getCashAuthContext({ requireManage: true })
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await context.params
  const body = await request.json().catch(() => null)
  const parsed = closePayloadSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const valuesParse = parseCashFieldValuesPayload(parsed.data.values)
  if (!valuesParse.ok) {
    return NextResponse.json({ error: valuesParse.error }, { status: 400 })
  }

  const actor = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { fullName: true, email: true },
  })
  const actorName = toEventActorName(actor ?? {}, "Сотрудник")

  try {
    const result = await prisma.$transaction(async (tx) => {
      const session = await getCashSessionForOrganization(tx, {
        sessionId: id,
        organizationId: auth.organizationId,
      })

      if (!session) {
        return { ok: false as const, status: 404, error: "Кассовая сессия не найдена" }
      }

      if (session.workday.status === "published") {
        return {
          ok: false as const,
          status: 409,
          error: "Рабочий день уже опубликован. Изменение значений кассы запрещено.",
        }
      }

      if (session.status !== "open" && session.status !== "closing_draft") {
        return {
          ok: false as const,
          status: 409,
          error: "Закрыть можно только открытую кассу",
        }
      }

      if (parsed.data.lockVersion != null && parsed.data.lockVersion !== session.lockVersion) {
        return {
          ok: false as const,
          status: 409,
          error: "Сессия была изменена другим пользователем. Обновите данные и повторите попытку.",
        }
      }

      const sessionFields: CashFieldConfig[] = []
      for (const fieldValue of session.fieldValues) {
        if (!isCashInputStage(fieldValue.inputStage)) {
          return {
            ok: false as const,
            status: 500,
            error: `Некорректный input_stage в снапшоте: ${fieldValue.fieldKeySnapshot}`,
          }
        }

        sessionFields.push({
          id: fieldValue.cashRegisterFieldId,
          key: fieldValue.fieldKeySnapshot,
          label: fieldValue.fieldLabelSnapshot,
          inputStage: fieldValue.inputStage,
          isRequired: fieldValue.isRequiredSnapshot,
          isRevenueBasis: fieldValue.isRevenueBasisSnapshot,
          displayOrder: 0,
        })
      }

      const closeFields = sessionFields.filter((field) => field.inputStage === "close")
      const closeFieldKeys = new Set(closeFields.map((field) => field.key))

      for (const key of Object.keys(valuesParse.values)) {
        if (!closeFieldKeys.has(key)) {
          return {
            ok: false as const,
            status: 400,
            error: `Поле ${key} не относится к закрытию кассы`,
          }
        }
      }

      const missingRequiredCloseFields = closeFields
        .filter((field) => field.isRequired)
        .filter((field) => !Object.prototype.hasOwnProperty.call(valuesParse.values, field.key))
        .map((field) => field.key)

      if (missingRequiredCloseFields.length > 0) {
        return {
          ok: false as const,
          status: 400,
          error: `Не заполнены обязательные поля закрытия: ${missingRequiredCloseFields.join(", ")}`,
        }
      }

      const existingByKey = Object.fromEntries(
        session.fieldValues.map((value) => [value.fieldKeySnapshot, { valueCents: value.valueCents }]),
      )

      const snapshotsResult = buildSessionFieldSnapshots({
        fields: sortCashFields(sessionFields),
        values: valuesParse.values,
        existingByKey,
      })

      if (!snapshotsResult.ok) {
        return {
          ok: false as const,
          status: 400,
          error: snapshotsResult.error,
        }
      }

      const totals = computeCashSessionSnapshotTotals({
        allFields: sessionFields,
        fieldValues: snapshotsResult.snapshots,
      })

      if (!totals.ok) {
        return {
          ok: false as const,
          status: 400,
          error: totals.error,
        }
      }

      await replaceCashSessionFieldSnapshots(tx, session.id, snapshotsResult.snapshots)

      await tx.cashSession.update({
        where: { id: session.id },
        data: {
          status: "closed",
          closedAt: new Date(),
          closedByEmployeeId: auth.employeeId,
          openingCashCents: totals.openingCashCents,
          closingCashCents: totals.closingCashCents,
          expectedCashCents: 0,
          diffCashCents: 0,
          notes: parsed.data.notes !== undefined ? parsed.data.notes : session.notes,
          lockVersion: { increment: 1 },
        },
      })

      await createCashSessionAuditLog(tx, {
        cashSessionId: session.id,
        actorUserId: auth.userId,
        action: "session_closed",
        payload: {
          values: valuesParse.values,
        },
      })

      await syncWorkdayRevenueFromCashSessions(tx, session.workdayId)
      await syncWorkdayTipsFromCashSessions(tx, {
        workdayId: session.workdayId,
        locationId: session.cashRegister.locationId,
      })

      const cashRegister = await tx.cashRegister.findUnique({
        where: { id: session.cashRegister.id },
        select: { name: true },
      })
      const workDateLabel = toEventDateLabel(session.workday.workDate)
      const notificationWorkDate = toNotificationDateOnly(session.workday.workDate)
      const notificationMessage = workDateLabel
        ? `${actorName} закрыл(а) кассовую смену «${cashRegister?.name || "Касса"}» (${workDateLabel}).`
        : `${actorName} закрыл(а) кассовую смену «${cashRegister?.name || "Касса"}».`

      await notifyOrganizationOwners(tx, {
        organizationId: auth.organizationId,
        type: "cash",
        title: "Закрыта кассовая смена",
        message: notificationMessage,
        payload: {
          view: "owner_cash",
          cashTab: "review_queue",
          cashSessionId: session.id,
          ...(notificationWorkDate ? { workDate: notificationWorkDate } : {}),
        },
        excludeUserId: auth.userId,
      })

      const updated = await getCashSessionForOrganization(tx, {
        sessionId: session.id,
        organizationId: auth.organizationId,
      })

      return {
        ok: true as const,
        data: updated,
      }
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ data: result.data })
  } catch (error) {
    console.error("[api/cash/sessions/[id]/close]", error)
    return NextResponse.json(
      {
        error: "Не удалось закрыть кассу",
      },
      { status: 500 },
    )
  }
}
