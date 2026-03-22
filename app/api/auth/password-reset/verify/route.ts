import { NextResponse } from "next/server"
import { z } from "zod"
import { PasswordResetError, verifyPasswordReset } from "@/lib/auth/password-reset"
import { hashAuditIdentifier, logAuditEvent } from "@/lib/observability/audit"

const verifySchema = z.object({
  email: z.string().email("Некорректный email"),
  code: z.string().trim().length(6, "Введите 6-значный код"),
})

export async function POST(request: Request) {
  let attemptedEmailHash: string | undefined

  try {
    const json = await request.json().catch(() => null)
    attemptedEmailHash =
      typeof json?.email === "string" ? hashAuditIdentifier(json.email) : undefined
    const parsed = verifySchema.safeParse(json)

    if (!parsed.success) {
      logAuditEvent(request, {
        event_type: "auth.password_reset.verify",
        outcome: "failure",
        status: 400,
        route: "/api/auth/password-reset/verify",
        reason: "validation_error",
        metadata: {
          email_hash: attemptedEmailHash,
        },
      })

      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const verification = await verifyPasswordReset(parsed.data.email, parsed.data.code)

    logAuditEvent(request, {
      event_type: "auth.password_reset.verify",
      outcome: "success",
      status: 200,
      route: "/api/auth/password-reset/verify",
      metadata: {
        email_hash: attemptedEmailHash,
      },
    })

    return NextResponse.json({
      verified: true,
      passwordReset: {
        email: verification.email,
        resetToken: verification.resetToken,
        resetTokenExpiresAt: verification.resetTokenExpiresAt.toISOString(),
      },
    })
  } catch (error) {
    if (error instanceof PasswordResetError) {
      logAuditEvent(request, {
        event_type: "auth.password_reset.verify",
        outcome: error.status >= 500 ? "failure" : "denied",
        status: error.status,
        route: "/api/auth/password-reset/verify",
        reason: error.code,
        metadata: {
          email_hash: attemptedEmailHash,
        },
      })

      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("[auth/password-reset/verify] error", error)
    logAuditEvent(request, {
      event_type: "auth.password_reset.verify",
      outcome: "failure",
      status: 500,
      route: "/api/auth/password-reset/verify",
      reason: "server_error",
      metadata: {
        email_hash: attemptedEmailHash,
      },
    })

    return NextResponse.json({ error: "Не удалось подтвердить код" }, { status: 500 })
  }
}
