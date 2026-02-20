import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSessionUser } from "@/lib/auth"
import { hashInviteCode, normalizeInviteCode } from "@/lib/invite-codes"

const joinVenueSchema = z.object({
  inviteCode: z.string().min(1, "Укажите код приглашения"),
})

const getRequestIp = (request: Request) => {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? null
  }
  return request.headers.get("x-real-ip") ?? null
}

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const json = await request.json().catch(() => null)
  const parsed = joinVenueSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const normalizedCode = normalizeInviteCode(parsed.data.inviteCode)
  if (!normalizedCode) {
    return NextResponse.json({ error: "Неверный код", code: "INVALID_CODE" }, { status: 400 })
  }

  const codeHash = hashInviteCode(normalizedCode)
  const now = new Date()
  const ip = getRequestIp(request)
  const userAgent = request.headers.get("user-agent")

  const result = await prisma.$transaction(async (tx) => {
    const invitation = await tx.invitationCode.findFirst({
      where: { status: "active", codeHash },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
    })

    if (!invitation?.organization || invitation.organization.status !== "active") {
      return { error: "INVALID_CODE" as const }
    }

    if (invitation.expiresAt && invitation.expiresAt < now) {
      return { error: "CODE_EXPIRED" as const }
    }

    if (invitation.maxUses !== null && invitation.usesCount >= invitation.maxUses) {
      return { error: "CODE_LIMIT_REACHED" as const }
    }

    const existingMember = await tx.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: invitation.organizationId,
          userId: user.id,
        },
      },
    })

    if (existingMember?.isActive) {
      return {
        status: "ALREADY_MEMBER" as const,
        organizationId: invitation.organizationId,
        organizationName: invitation.organization.name,
      }
    }

    if (existingMember && !existingMember.isActive) {
      return { error: "MEMBERSHIP_BLOCKED" as const }
    }

    const workerRole = await tx.accessRole.findFirst({
      where: {
        organizationId: invitation.organizationId,
        key: "worker",
        isActive: true,
      },
      select: { id: true },
    })

    await tx.organizationMember.create({
      data: {
        organizationId: invitation.organizationId,
        userId: user.id,
        accessRoleId: workerRole?.id ?? null,
        legacyRole: "worker",
        createdVia: "invite_code",
        isActive: true,
      },
    })

    await tx.employee.upsert({
      where: {
        organizationId_userId: {
          organizationId: invitation.organizationId,
          userId: user.id,
        },
      },
      create: {
        organizationId: invitation.organizationId,
        userId: user.id,
        payType: "hourly",
        employmentStatus: "active",
      },
      update: {
        employmentStatus: "active",
      },
    })

    await tx.invitationCode.update({
      where: { id: invitation.id },
      data: { usesCount: { increment: 1 } },
    })

    await tx.invitationRedemption.create({
      data: {
        invitationId: invitation.id,
        organizationId: invitation.organizationId,
        userId: user.id,
        redeemedAt: now,
        ip,
        userAgent,
      },
    })

    return {
      status: "JOINED" as const,
      organizationId: invitation.organizationId,
      organizationName: invitation.organization.name,
    }
  })

  if ("error" in result) {
    if (result.error === "CODE_EXPIRED") {
      return NextResponse.json({ error: "Код приглашения истек", code: result.error }, { status: 400 })
    }
    if (result.error === "CODE_LIMIT_REACHED") {
      return NextResponse.json({ error: "Лимит использования кода исчерпан", code: result.error }, { status: 400 })
    }
    if (result.error === "MEMBERSHIP_BLOCKED") {
      return NextResponse.json(
        { error: "Вы уже есть в этом заведении, но доступ заблокирован", code: result.error },
        { status: 403 },
      )
    }
    return NextResponse.json({ error: "Неверный код", code: result.error }, { status: 400 })
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      primaryMode: "worker",
      status: "active",
      onboardingReady: true,
      activeOrganizationId: result.organizationId,
    },
  })

  return NextResponse.json({
    data: {
      success: true,
      status: result.status,
      organizationId: result.organizationId,
      organizationName: result.organizationName,
    },
  })
}
