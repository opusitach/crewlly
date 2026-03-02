import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"
import { z } from "zod"
import { getSessionUser, getSessionUserWithOrg } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { DEFAULT_EMAIL_REGEX } from "@/lib/validation/email"
import { DEFAULT_PHONE_ERROR_MESSAGE, getPhoneValidationError, normalizePhone } from "@/lib/validation/phone"

const updateMeSchema = z
  .object({
    fullName: z.string().trim().min(1, "Имя слишком короткое").optional(),
    name: z.string().trim().min(1, "Имя слишком короткое").optional(),
    email: z.string().trim().regex(DEFAULT_EMAIL_REGEX, "Некорректный email").optional(),
    phone: z
      .string()
      .trim()
      .optional()
      .nullable()
      .refine((value) => value == null || getPhoneValidationError(value) === null, DEFAULT_PHONE_ERROR_MESSAGE),
    avatarUrl: z.string().trim().optional().nullable(),
  })
  .refine(
    (data) =>
      data.fullName !== undefined ||
      data.name !== undefined ||
      data.email !== undefined ||
      data.phone !== undefined ||
      data.avatarUrl !== undefined,
    {
      message: "Нет данных для обновления",
      path: ["email"],
    },
  )

function toUserResponse(user: {
  id: string
  fullName: string | null
  email: string
  phone: string | null
  avatarUrl: string | null
  locale: string
  status: string
  primaryMode: string | null
  onboardingReady: boolean
}) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    locale: user.locale,
    status: user.status,
    primaryMode: user.primaryMode,
    onboardingReady: user.onboardingReady,
  }
}

export async function GET() {
  try {
    const session = await getSessionUserWithOrg()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { user, organization, accessRole, membership } = session

    // Get default location for the organization
    let defaultLocation = null
    if (organization) {
      const { prisma } = await import("@/lib/prisma")
      defaultLocation = await prisma.location.findFirst({
        where: { organizationId: organization.id, isActive: true },
        orderBy: { createdAt: "asc" },
      })
    }

    return NextResponse.json({
      user: toUserResponse(user),
      organization: organization
        ? {
            id: organization.id,
            name: organization.name,
            timezone: organization.timezone,
            currency: organization.currency,
          }
        : null,
      accessRole: accessRole
        ? {
            id: accessRole.id,
            key: accessRole.key,
            name: accessRole.name,
          }
        : null,
      legacyRole: membership?.legacyRole ?? null,
      defaultLocation: defaultLocation
        ? {
            id: defaultLocation.id,
            name: defaultLocation.name,
          }
        : null,
    })
  } catch (error: unknown) {
    console.error("[auth/me] error", error)
    const message = error instanceof Error ? error.message : "Ошибка"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const json = await request.json().catch(() => null)
    const parsed = updateMeSchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const { fullName, name, email, phone, avatarUrl } = parsed.data
    const resolvedFullName = fullName ?? name

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(resolvedFullName !== undefined ? { fullName: resolvedFullName.trim() } : {}),
        ...(email !== undefined ? { email: email.trim() } : {}),
        ...(phone !== undefined ? { phone: normalizePhone(phone) } : {}),
        ...(avatarUrl !== undefined ? { avatarUrl: avatarUrl?.trim() || null } : {}),
      },
    })

    return NextResponse.json({
      user: toUserResponse(updatedUser),
    })
  } catch (error: unknown) {
    console.error("[auth/me PATCH] error", error)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Email уже используется" }, { status: 409 })
    }
    const message = error instanceof Error ? error.message : "Ошибка"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
