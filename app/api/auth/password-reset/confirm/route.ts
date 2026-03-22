import { NextResponse } from "next/server"
import { z } from "zod"
import { PasswordResetError, confirmPasswordReset } from "@/lib/auth/password-reset"
import { PASSWORD_POLICY_ERROR_MESSAGE, isStrongPassword } from "@/lib/validation/password"
import { hashAuditIdentifier, logAuditEvent } from "@/lib/observability/audit"

const confirmSchema = z.object({
  email: z.string().email("Некорректный email"),
  resetToken: z.string().trim().min(1, "Сессия восстановления не найдена"),
  password: z.string().min(1, "Введите пароль").refine(isStrongPassword, PASSWORD_POLICY_ERROR_MESSAGE),
})

export async function POST(request: Request) {
  let attemptedEmailHash: string | undefined

  try {
    const json = await request.json().catch(() => null)
    attemptedEmailHash =
      typeof json?.email === "string" ? hashAuditIdentifier(json.email) : undefined
    const parsed = confirmSchema.safeParse(json)

    if (!parsed.success) {
      logAuditEvent(request, {
        event_type: "auth.password_reset.confirm",
        outcome: "failure",
        status: 400,
        route: "/api/auth/password-reset/confirm",
        reason: "validation_error",
        metadata: {
          email_hash: attemptedEmailHash,
        },
      })

      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    await confirmPasswordReset(parsed.data.email, parsed.data.resetToken, parsed.data.password)

    logAuditEvent(request, {
      event_type: "auth.password_reset.confirm",
      outcome: "success",
      status: 200,
      route: "/api/auth/password-reset/confirm",
      metadata: {
        email_hash: attemptedEmailHash,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof PasswordResetError) {
      logAuditEvent(request, {
        event_type: "auth.password_reset.confirm",
        outcome: error.status >= 500 ? "failure" : "denied",
        status: error.status,
        route: "/api/auth/password-reset/confirm",
        reason: error.code,
        metadata: {
          email_hash: attemptedEmailHash,
        },
      })

      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("[auth/password-reset/confirm] error", error)
    logAuditEvent(request, {
      event_type: "auth.password_reset.confirm",
      outcome: "failure",
      status: 500,
      route: "/api/auth/password-reset/confirm",
      reason: "server_error",
      metadata: {
        email_hash: attemptedEmailHash,
      },
    })

    return NextResponse.json({ error: "Не удалось обновить пароль" }, { status: 500 })
  }
}
