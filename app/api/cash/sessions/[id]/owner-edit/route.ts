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

type RouteContext = { params: Promise<{ id: string }> }

const ownerEditPayloadSchema = z.object({
  values: z.record(z.union([z.number(), z.string()])).default({}),
  reason: z.string().trim().min(1).max(500),
  lockVersion: z.number().int().optional(),
})

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await getCashAuthContext({ requireManage: true })
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!auth.isManagementRole) {
    return NextResponse.json(
      { error: "Только владелец или менеджер может выполнять правку кассы" },
      { status: 403 },
    )
  }

  const { id } = await context.params
  const body = await request.json().catch(() => null)
  const parsed = ownerEditPayloadSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const valuesParse = parseCashFieldValuesPayload(parsed.data.values)
  if (!valuesParse.ok) {
    return NextResponse.json({ error: valuesParse.error }, { status: 400 })
  }

  if (Object.keys(valuesParse.values).length === 0) {
    return NextResponse.json({ error: "Передайте хотя бы одно поле для правки" }, { status: 400 })
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const session = await getCashSessionForOrganization(tx, {
        sessionId: id,
        organizationId: auth.organizationId,
      })

      if (!session) {
        return { ok: false as const, status: 404, error: "Кассовая сессия не найдена" }
      }

      if (session.status !== "closed" && session.status !== "reviewed") {
        return {
          ok: false as const,
          status: 409,
          error: "Owner-правка доступна только для закрытой или проверенной кассы",
        }
      }

      if (parsed.data.lockVersion != null && parsed.data.lockVersion !== session.lockVersion) {
        return {
          ok: false as const,
          status: 409,
          error: "Сессия была изменена другим пользователем. Обновите данные и повторите попытку.",
        }
      }

      const validKeys = new Set(session.fieldValues.map((value) => value.fieldKeySnapshot))
      for (const key of Object.keys(valuesParse.values)) {
        if (!validKeys.has(key)) {
          return {
            ok: false as const,
            status: 400,
            error: `Поле ${key} отсутствует в снапшоте этой сессии`,
          }
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

      const statusAfterEdit = session.status === "reviewed" ? "closed" : session.status
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
          status: statusAfterEdit,
          reviewedAt: session.status === "reviewed" ? null : session.reviewedAt,
          reviewedByEmployeeId: session.status === "reviewed" ? null : session.reviewedByEmployeeId,
          openingCashCents: totals.openingCashCents,
          closingCashCents: totals.closingCashCents,
          expectedCashCents: 0,
          diffCashCents: 0,
          ownerEditedByUserId: auth.userId,
          ownerEditReason: parsed.data.reason,
          lockVersion: { increment: 1 },
        },
      })

      await createCashSessionAuditLog(tx, {
        cashSessionId: session.id,
        actorUserId: auth.userId,
        action: "owner_edit",
        reason: parsed.data.reason,
        payload: {
          changedKeys: Object.keys(valuesParse.values),
          revertedFromReviewed: session.status === "reviewed",
        },
      })

      await syncWorkdayRevenueFromCashSessions(tx, session.workdayId)
      await syncWorkdayTipsFromCashSessions(tx, {
        workdayId: session.workdayId,
        locationId: session.cashRegister.locationId,
      })

      const updated = await getCashSessionForOrganization(tx, {
        sessionId: session.id,
        organizationId: auth.organizationId,
      })

      return {
        ok: true as const,
        data: updated,
        downgradedFromReviewed: session.status === "reviewed",
      }
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({
      data: result.data,
      downgradedFromReviewed: result.downgradedFromReviewed,
    })
  } catch (error) {
    console.error("[api/cash/sessions/[id]/owner-edit]", error)
    return NextResponse.json(
      {
        error: "Не удалось выполнить owner-правку кассы",
      },
      { status: 500 },
    )
  }
}
