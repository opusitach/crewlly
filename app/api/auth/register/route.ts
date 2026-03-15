import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { hashPassword, createSession, deleteUserSessions } from "@/lib/auth"
import { Prisma } from "@prisma/client"
import { DEFAULT_PHONE_ERROR_MESSAGE, getPhoneValidationError, normalizePhone } from "@/lib/validation/phone"
import { PASSWORD_POLICY_ERROR_MESSAGE, isStrongPassword } from "@/lib/validation/password"
import { auditActorFromSession, hashAuditIdentifier, logAuditEvent } from "@/lib/observability/audit"

const registerSchema = z
  .object({
    fullName: z.string().min(2, "Имя слишком короткое").optional(),
    name: z.string().min(2, "Имя слишком короткое").optional(),
    email: z.string().email("Некорректный email"),
    phone: z
      .string()
      .trim()
      .optional()
      .nullable()
      .refine((value) => value == null || getPhoneValidationError(value) === null, DEFAULT_PHONE_ERROR_MESSAGE),
    password: z.string().min(1, "Введите пароль").refine(isStrongPassword, PASSWORD_POLICY_ERROR_MESSAGE),
  })
  .refine((data) => Boolean(data.fullName || data.name), {
    message: "Имя обязательно",
    path: ["fullName"],
  })

export async function POST(request: Request) {
  let attemptedEmailHash: string | undefined

  try {
    const json = await request.json().catch(() => null)
    attemptedEmailHash =
      typeof json?.email === "string" ? hashAuditIdentifier(json.email) : undefined
    const parsed = registerSchema.safeParse(json)
    if (!parsed.success) {
      logAuditEvent(request, {
        event_type: "auth.register",
        outcome: "failure",
        status: 400,
        route: "/api/auth/register",
        reason: "validation_error",
        metadata: {
          email_hash: attemptedEmailHash,
        },
      })
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    const { fullName, name, email, password, phone } = parsed.data
    const resolvedName = fullName ?? name ?? ""
    const resolvedPhone = normalizePhone(phone)

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      logAuditEvent(request, {
        event_type: "auth.register",
        outcome: "failure",
        status: 409,
        route: "/api/auth/register",
        reason: "email_exists",
        metadata: {
          email_hash: attemptedEmailHash,
        },
      })
      return NextResponse.json({ error: "Email уже используется" }, { status: 409 })
    }

    const passwordHash = await hashPassword(password)
    const user = await prisma.user.create({
      data: {
        fullName: resolvedName,
        email,
        phone: resolvedPhone,
        passwordHash,
        status: "active",
        primaryMode: null,
        onboardingReady: false,
      },
    })

    await deleteUserSessions(user.id)
    const { cookie } = await createSession(user.id)
    const res = NextResponse.json({
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        status: user.status,
        primaryMode: user.primaryMode,
        onboardingReady: user.onboardingReady,
      },
    })
    res.cookies.set(cookie.name, cookie.value, cookie.options)
    logAuditEvent(request, {
      event_type: "auth.register",
      outcome: "success",
      status: 200,
      route: "/api/auth/register",
      actor: auditActorFromSession({ user }),
      metadata: {
        email_hash: attemptedEmailHash,
      },
    })
    return res
  } catch (error: unknown) {
    console.error("[auth/register] error", error)
    logAuditEvent(request, {
      event_type: "auth.register",
      outcome: "failure",
      status: 500,
      route: "/api/auth/register",
      reason: "server_error",
      metadata: {
        email_hash: attemptedEmailHash,
      },
    })
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return NextResponse.json({ error: "Email уже используется" }, { status: 409 })
      }
      return NextResponse.json({ error: "Не удалось завершить регистрацию" }, { status: 500 })
    }
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "База данных недоступна" }, { status: 500 })
    }
    return NextResponse.json({ error: "Внутренняя ошибка при регистрации" }, { status: 500 })
  }
}
