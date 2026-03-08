import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSessionUser } from "@/lib/auth"

const roleSchema = z
  .object({
    primaryMode: z.enum(["owner", "worker"]).optional(),
    role: z.enum(["owner", "worker", "employee"]).optional(),
  })
  .refine((data) => Boolean(data.primaryMode || data.role), {
    message: "Role is required",
    path: ["primaryMode"],
  })

export async function POST(request: Request) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const json = await request.json().catch(() => null)
    const parsed = roleSchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const { primaryMode, role } = parsed.data
    const resolvedPrimaryMode =
      primaryMode ?? (role === "employee" ? "worker" : role)

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { primaryMode: resolvedPrimaryMode, onboardingReady: false },
    })

    return NextResponse.json({
      user: {
        id: updatedUser.id,
        fullName: updatedUser.fullName,
        email: updatedUser.email,
        status: updatedUser.status,
        primaryMode: updatedUser.primaryMode,
        onboardingReady: updatedUser.onboardingReady,
      },
    })
  } catch (error: unknown) {
    console.error("[user/role] error", error)
    return NextResponse.json({ error: "Не удалось сохранить роль" }, { status: 500 })
  }
}

export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    return NextResponse.json({
      primaryMode: user.primaryMode,
    })
  } catch (error: unknown) {
    console.error("[user/role] error", error)
    return NextResponse.json({ error: "Не удалось получить роль" }, { status: 500 })
  }
}
