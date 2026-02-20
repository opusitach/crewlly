import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getCashAuthContext } from "@/lib/cash/access"
import { createCashSessionAuditLog, getCashSessionForOrganization } from "@/lib/cash/session-service"

type RouteContext = { params: Promise<{ id: string }> }

const receiptSchema = z.object({
  photoUrl: z.string().url(),
  receiptType: z.enum(["z_report", "x_report", "terminal", "other"]).default("other"),
  totalAmountCents: z.number().int().optional().nullable(),
  takenAt: z.string().datetime().optional().nullable(),
})

export async function GET(_request: Request, context: RouteContext) {
  const auth = await getCashAuthContext({ requireManage: true })
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await context.params
  const session = await prisma.$transaction((tx) =>
    getCashSessionForOrganization(tx, {
      sessionId: id,
      organizationId: auth.organizationId,
    }),
  )

  if (!session) {
    return NextResponse.json({ error: "Кассовая сессия не найдена" }, { status: 404 })
  }

  return NextResponse.json({ data: session.receiptUploads })
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await getCashAuthContext({ requireManage: true })
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await context.params
  const body = await request.json().catch(() => null)
  const parsed = receiptSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const payload = parsed.data

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
        return {
          ok: false as const,
          status: 409,
          error: "Сессия уже проверена. Добавление вложений заблокировано.",
        }
      }

      const created = await tx.receiptUpload.create({
        data: {
          cashSessionId: session.id,
          uploadedByEmployeeId: auth.employeeId,
          photoUrl: payload.photoUrl,
          receiptType: payload.receiptType,
          totalAmountCents: payload.totalAmountCents ?? null,
          takenAt: payload.takenAt ? new Date(payload.takenAt) : null,
        },
      })

      await createCashSessionAuditLog(tx, {
        cashSessionId: session.id,
        actorUserId: auth.userId,
        action: "receipt_uploaded",
        payload: {
          receiptType: payload.receiptType,
          totalAmountCents: payload.totalAmountCents ?? null,
        },
      })

      return { ok: true as const, data: created }
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ data: result.data }, { status: 201 })
  } catch (error) {
    console.error("[api/cash/sessions/[id]/receipts][POST]", error)
    return NextResponse.json(
      {
        error: "Не удалось сохранить вложение",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
