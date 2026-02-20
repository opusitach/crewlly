import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { verifyPassword, createSession, deleteUserSessions } from "@/lib/auth"

const loginSchema = z.object({
  email: z.string().email("Некорректный email"),
  password: z.string().min(1, "Введите пароль"),
})

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => null)
    const parsed = loginSchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    const { email, password } = parsed.data

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 })
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 })
    }

    if (user.status === "disabled") {
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
      },
      organization: membership?.organization ?? null,
      accessRole: membership?.accessRole ?? null,
    })
    res.cookies.set(cookie.name, cookie.value, cookie.options)
    return res
  } catch (error: unknown) {
    console.error("[auth/login] error", error)
    const message = error instanceof Error ? error.message : "Ошибка входа"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
