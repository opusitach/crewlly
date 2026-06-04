import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"
import { z } from "zod"
import { getSessionUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { resolveOrganizationAccess } from "@/lib/organization-access"
import { getActiveInternalSession } from "@/lib/internal-access/session"
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
  emailVerifiedAt?: Date | null
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
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
  }
}

export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let organization = null
    let accessRole = null
    let legacyRole: string | null = null
    let defaultLocation = null

    // Internal-only fields: never populated for regular users.
    let activeInternalSession: {
      id: string
      organizationId: string
      accessLevel: string
      startedAt: string
    } | null = null

    if (user.isInternal) {
      const session = await getActiveInternalSession(user.id)
      if (session) {
        activeInternalSession = {
          id: session.id,
          organizationId: session.organizationId,
          accessLevel: session.accessLevel,
          startedAt: session.startedAt.toISOString(),
        }
      }
    }

    if (user.activeOrganizationId) {
      // Internal users with an active session: bind the resolution to that session's level.
      const access = await resolveOrganizationAccess(user.id, user.activeOrganizationId, {
        useActiveInternalSession: user.isInternal,
      })
      if (access) {
        organization = {
          id: access.organization.id,
          name: access.organization.name,
          timezone: access.organization.timezone,
          currency: access.organization.currency,
        }
        accessRole = access.membership?.accessRole
          ? {
              id: access.membership.accessRole.id,
              key: access.membership.accessRole.key,
              name: access.membership.accessRole.name,
            }
          : null
        // For internal access, membership is null — fall back to effectiveRoleKey
        legacyRole = access.membership?.legacyRole ?? access.effectiveRoleKey
        defaultLocation = await prisma.location.findFirst({
          where: { organizationId: access.organizationId, isActive: true },
          orderBy: { createdAt: "asc" },
        })
      }
    }

    return NextResponse.json({
      user: toUserResponse(user),
      organization,
      accessRole,
      legacyRole,
      defaultLocation: defaultLocation
        ? { id: defaultLocation.id, name: defaultLocation.name }
        : null,
      // Internal-only fields. For non-internal users these are intentionally absent.
      ...(user.isInternal
        ? {
            isInternal: true,
            activeInternalSession,
          }
        : {}),
    })
  } catch (error: unknown) {
    console.error("[auth/me] error", error)
    return NextResponse.json({ error: "Не удалось загрузить профиль" }, { status: 500 })
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

    if (email !== undefined && email.trim() !== user.email) {
      return NextResponse.json(
        { error: "Изменение email требует отдельного подтверждения и пока недоступно" },
        { status: 400 },
      )
    }

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
    return NextResponse.json({ error: "Не удалось обновить профиль" }, { status: 500 })
  }
}
