import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getCashAuthContext } from "@/lib/cash/access"
import { createCashSessionAuditLog, getCashSessionForOrganization } from "@/lib/cash/session-service"

type RouteContext = { params: Promise<{ id: string }> }

const reviewPayloadSchema = z.object({
  note: z.string().trim().max(500).optional().nullable(),
  lockVersion: z.number().int().optional(),
})

export async function POST(request: Request, context: RouteContext) {
  const auth = await getCashAuthContext({ requireManage: true })
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await context.params
  const body = await request.json().catch(() => null)
  const parsed = reviewPayloadSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
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

      if (session.status === "reviewed") {
        return { ok: false as const, status: 409, error: "Сессия уже проверена" }
      }

      if (session.status !== "closed") {
        return {
          ok: false as const,
          status: 409,
          error: "Проверка доступна только после закрытия кассы",
        }
      }

      if (parsed.data.lockVersion != null && parsed.data.lockVersion !== session.lockVersion) {
        return {
          ok: false as const,
          status: 409,
          error: "Сессия была изменена другим пользователем. Обновите данные и повторите попытку.",
        }
      }

      await tx.cashSession.update({
        where: { id: session.id },
        data: {
          status: "reviewed",
          reviewedAt: new Date(),
          reviewedByEmployeeId: auth.employeeId,
          notes: parsed.data.note !== undefined ? parsed.data.note : session.notes,
          lockVersion: { increment: 1 },
        },
      })

      await createCashSessionAuditLog(tx, {
        cashSessionId: session.id,
        actorUserId: auth.userId,
        action: "session_reviewed",
        payload: parsed.data.note
          ? {
              note: parsed.data.note,
            }
          : undefined,
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
    console.error("[api/cash/sessions/[id]/review]", error)
    return NextResponse.json(
      {
        error: "Не удалось завершить проверку кассы",
      },
      { status: 500 },
    )
  }
}
