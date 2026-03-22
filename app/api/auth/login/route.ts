import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { verifyPassword, createSession, deleteUserSessions } from "@/lib/auth"
import { auditActorFromSession, hashAuditIdentifier, logAuditEvent } from "@/lib/observability/audit"

const loginSchema = z.object({
  email: z.string().email("Некорректный email"),
  password: z.string().min(1, "Введите пароль"),
})

export async function POST(request: Request) {
  let attemptedEmailHash: string | undefined

  try {
    const json = await request.json().catch(() => null)
    attemptedEmailHash =
      typeof json?.email === "string" ? hashAuditIdentifier(json.email) : undefined
    const parsed = loginSchema.safeParse(json)
    if (!parsed.success) {
      logAuditEvent(request, {
        event_type: "auth.login",
        outcome: "failure",
        status: 400,
        route: "/api/auth/login",
        reason: "validation_error",
        metadata: {
          email_hash: attemptedEmailHash,
        },
      })
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    const { email, password } = parsed.data

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      logAuditEvent(request, {
        event_type: "auth.login",
        outcome: "denied",
        status: 401,
        route: "/api/auth/login",
        reason: "invalid_credentials",
        metadata: {
          email_hash: attemptedEmailHash,
        },
      })
      return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 })
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      logAuditEvent(request, {
        event_type: "auth.login",
        outcome: "denied",
        status: 401,
        route: "/api/auth/login",
        actor: auditActorFromSession({ user }),
        reason: "invalid_credentials",
        metadata: {
          email_hash: attemptedEmailHash,
        },
      })
      return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 })
    }

    if (user.status === "disabled") {
      logAuditEvent(request, {
        event_type: "auth.login",
        outcome: "denied",
        status: 403,
        route: "/api/auth/login",
        actor: auditActorFromSession({ user }),
        reason: "disabled_account",
        metadata: {
          email_hash: attemptedEmailHash,
        },
      })
      return NextResponse.json({ error: "Аккаунт заблокирован" }, { status: 403 })
    }

    await deleteUserSessions(user.id)
    const { cookie } = await createSession(user.id)
    
    // Get organization membership if any
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id, isActive: true },
      include: {
        organization: true,
        accessRole: true,
      },
    })

    const res = NextResponse.json({
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        status: user.status,
        primaryMode: user.primaryMode,
        onboardingReady: user.onboardingReady,
        emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      },
      organization: membership?.organization ?? null,
      accessRole: membership?.accessRole ?? null,
      legacyRole: membership?.legacyRole ?? null,
    })
    res.cookies.set(cookie.name, cookie.value, cookie.options)
    logAuditEvent(request, {
      event_type: "auth.login",
      outcome: "success",
      status: 200,
      route: "/api/auth/login",
      actor: auditActorFromSession({
        user,
        organization: membership?.organization ?? null,
        accessRole: membership?.accessRole ?? null,
        membership: {
          legacyRole: membership?.legacyRole ?? null,
        },
      }),
      metadata: {
        email_hash: attemptedEmailHash,
        organization_selected: Boolean(membership?.organization),
      },
    })
    return res
  } catch (error: unknown) {
    console.error("[auth/login] error", error)
    logAuditEvent(request, {
      event_type: "auth.login",
      outcome: "failure",
      status: 500,
      route: "/api/auth/login",
      reason: "server_error",
      metadata: {
        email_hash: attemptedEmailHash,
      },
    })
    return NextResponse.json({ error: "Ошибка входа" }, { status: 500 })
  }
}
