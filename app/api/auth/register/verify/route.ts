import { NextResponse } from "next/server"
import { z } from "zod"
import { createSession } from "@/lib/auth"
import { PendingRegistrationError, verifyPendingRegistration } from "@/lib/auth/pending-registration"
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
        event_type: "auth.register.verify",
        outcome: "failure",
        status: 400,
        route: "/api/auth/register/verify",
        reason: "validation_error",
        metadata: {
          email_hash: attemptedEmailHash,
        },
      })

      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const user = await verifyPendingRegistration(parsed.data.email, parsed.data.code)
    const { cookie } = await createSession(user.id)

    const response = NextResponse.json({
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        status: user.status,
        primaryMode: user.primaryMode,
        onboardingReady: user.onboardingReady,
        emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      },
      organization: null,
      accessRole: null,
      legacyRole: null,
    })
    response.cookies.set(cookie.name, cookie.value, cookie.options)

    logAuditEvent(request, {
      event_type: "auth.register.verify",
      outcome: "success",
      status: 200,
      route: "/api/auth/register/verify",
      metadata: {
        email_hash: attemptedEmailHash,
      },
    })

    return response
  } catch (error) {
    if (error instanceof PendingRegistrationError) {
      logAuditEvent(request, {
        event_type: "auth.register.verify",
        outcome: error.status >= 500 ? "failure" : "denied",
        status: error.status,
        route: "/api/auth/register/verify",
        reason: error.code,
        metadata: {
          email_hash: attemptedEmailHash,
        },
      })

      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("[auth/register/verify] error", error)
    logAuditEvent(request, {
      event_type: "auth.register.verify",
      outcome: "failure",
      status: 500,
      route: "/api/auth/register/verify",
      reason: "server_error",
      metadata: {
        email_hash: attemptedEmailHash,
      },
    })

    return NextResponse.json({ error: "Не удалось подтвердить email" }, { status: 500 })
  }
}
