import { NextResponse } from "next/server"
import { z } from "zod"
import { PasswordResetError, startPasswordReset } from "@/lib/auth/password-reset"
import { hashAuditIdentifier, logAuditEvent } from "@/lib/observability/audit"

const requestSchema = z.object({
  email: z.string().email("Некорректный email"),
})

export async function POST(request: Request) {
  let attemptedEmailHash: string | undefined

  try {
    const json = await request.json().catch(() => null)
    attemptedEmailHash =
      typeof json?.email === "string" ? hashAuditIdentifier(json.email) : undefined
    const parsed = requestSchema.safeParse(json)

    if (!parsed.success) {
      logAuditEvent(request, {
        event_type: "auth.password_reset.request",
        outcome: "failure",
        status: 400,
        route: "/api/auth/password-reset/request",
        reason: "validation_error",
        metadata: {
          email_hash: attemptedEmailHash,
        },
      })

      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const challenge = await startPasswordReset(parsed.data.email)

    logAuditEvent(request, {
      event_type: "auth.password_reset.request",
      outcome: "success",
      status: 200,
      route: "/api/auth/password-reset/request",
      metadata: {
        email_hash: attemptedEmailHash,
      },
    })

    return NextResponse.json({
      passwordResetRequested: true,
      pendingPasswordReset: {
        email: challenge.email,
        expiresAt: challenge.expiresAt.toISOString(),
        resendAvailableAt: challenge.resendAvailableAt.toISOString(),
      },
    })
  } catch (error) {
    if (error instanceof PasswordResetError) {
      logAuditEvent(request, {
        event_type: "auth.password_reset.request",
        outcome: error.status >= 500 ? "failure" : "denied",
        status: error.status,
        route: "/api/auth/password-reset/request",
        reason: error.code,
        metadata: {
          email_hash: attemptedEmailHash,
        },
      })

      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("[auth/password-reset/request] error", error)
    logAuditEvent(request, {
      event_type: "auth.password_reset.request",
      outcome: "failure",
      status: 500,
      route: "/api/auth/password-reset/request",
      reason: "server_error",
      metadata: {
        email_hash: attemptedEmailHash,
      },
    })

    return NextResponse.json({ error: "Не удалось отправить код восстановления" }, { status: 500 })
  }
}
