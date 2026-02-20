import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { hashPassword, createSession, deleteUserSessions } from "@/lib/auth"
import { Prisma } from "@prisma/client"

const registerSchema = z
  .object({
    fullName: z.string().min(2, "Имя слишком короткое").optional(),
    name: z.string().min(2, "Имя слишком короткое").optional(),
    email: z.string().email("Некорректный email"),
    phone: z.string().optional().nullable(),
    password: z.string().min(6, "Пароль должен быть не менее 6 символов"),
  })
  .refine((data) => Boolean(data.fullName || data.name), {
    message: "Имя обязательно",
    path: ["fullName"],
  })

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => null)
    const parsed = registerSchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    const { fullName, name, email, password, phone } = parsed.data
    const resolvedName = fullName ?? name ?? ""
    const resolvedPhone = phone?.trim() || null

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
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
    return res
  } catch (error: unknown) {
    console.error("[auth/register] error", error)
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return NextResponse.json({ error: "Email уже используется" }, { status: 409 })
      }
      return NextResponse.json({ error: `Ошибка БД (${error.code})` }, { status: 500 })
    }
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "База данных недоступна" }, { status: 500 })
    }
    const message = error instanceof Error ? error.message : "Внутренняя ошибка при регистрации"
    return NextResponse.json(
      { error: message, details: String(error) },
      { status: 500 },
    )
  }
}
