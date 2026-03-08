import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSessionUser } from "@/lib/auth"
import { hashInviteCode, normalizeInviteCode } from "@/lib/invite-codes"

const employeeOnboardingSchema = z.object({
  fullName: z.string().min(1, "Укажите имя"),
  invitationToken: z.string().optional(),
  invitationCode: z.string().optional(),
  positionIds: z.array(z.string().uuid()).optional(),
})

function getRequestIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? null
  }
  return request.headers.get("x-real-ip") ?? null
}

export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const invitationCodeParam = searchParams.get("invitationCode") ?? searchParams.get("inviteCode")
  if (invitationCodeParam) {
    const normalizedCode = normalizeInviteCode(invitationCodeParam)
    if (!normalizedCode) {
      return NextResponse.json({ error: "Неверный код" }, { status: 400 })
    }

    const codeHash = hashInviteCode(normalizedCode)
    const invitation = await prisma.invitationCode.findFirst({
      where: { status: "active", codeHash },
      include: {
        organization: {
          select: { id: true, name: true },
        },
      },
    })

    if (!invitation?.organization) {
      return NextResponse.json({ error: "Неверный код" }, { status: 404 })
    }

    if (invitation.expiresAt && invitation.expiresAt < new Date()) {
      return NextResponse.json({ error: "Код приглашения истёк" }, { status: 400 })
    }

    if (invitation.maxUses !== null && invitation.usesCount >= invitation.maxUses) {
      return NextResponse.json({ error: "Лимит использования кода исчерпан" }, { status: 400 })
    }

    const positions = await prisma.position.findMany({
      where: { organizationId: invitation.organizationId, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    })

    return NextResponse.json({
      data: {
        organization: invitation.organization,
        positions,
      },
    })
  }

  // Check if user is already a member of any organization
  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id, isActive: true },
    include: {
      organization: true,
      accessRole: true,
    },
  })

  // Get employee record if exists
  const employee = membership
    ? await prisma.employee.findFirst({
        where: { userId: user.id, organizationId: membership.organizationId },
        include: {
          employeePositions: { include: { position: true } },
          employeeLocations: { include: { location: true } },
          payComponents: {
            where: { isActive: true },
            orderBy: [{ priority: "desc" }, { componentType: "asc" }],
            select: {
              componentType: true,
              amountCents: true,
              rateBp: true,
              isActive: true,
              priority: true,
            },
          },
        },
      })
    : null

  return NextResponse.json({
    data: {
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        primaryMode: user.primaryMode,
      },
      organization: membership?.organization ?? null,
      accessRole: membership?.accessRole ?? null,
      employee,
    },
  })
}

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const json = await request.json().catch(() => null)
  const parsed = employeeOnboardingSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { fullName, invitationToken, invitationCode, positionIds } = parsed.data

  if (invitationCode) {
    const normalizedCode = normalizeInviteCode(invitationCode)
    if (!normalizedCode) {
      return NextResponse.json({ error: "Неверный код", code: "INVALID_CODE" }, { status: 400 })
    }

    const codeHash = hashInviteCode(normalizedCode)
    const now = new Date()
    const ip = getRequestIp(request)
    const userAgent = request.headers.get("user-agent")

    const redemption = await prisma.$transaction(async (tx) => {
      const invitation = await tx.invitationCode.findFirst({
        where: { status: "active", codeHash },
      })

      if (!invitation) {
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
        include: { accessRole: true },
      })

      if (existingMember) {
        return {
          status: "ALREADY_MEMBER" as const,
          organizationId: invitation.organizationId,
          role: existingMember.accessRole?.key ?? existingMember.legacyRole ?? "worker",
          membershipStatus: existingMember.isActive ? "active" : "blocked",
        }
      }

      const workerRole = await tx.accessRole.findFirst({
        where: { organizationId: invitation.organizationId, key: "worker" },
      })

      const membership = await tx.organizationMember.create({
        data: {
          organizationId: invitation.organizationId,
          userId: user.id,
          accessRoleId: workerRole?.id ?? null,
          legacyRole: "worker",
          createdVia: "invite_code",
          isActive: true,
        },
        include: { accessRole: true },
      })

      const employee = await tx.employee.upsert({
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

      if (positionIds && positionIds.length > 0) {
        const positions = await tx.position.findMany({
          where: {
            id: { in: positionIds },
            organizationId: invitation.organizationId,
            isActive: true,
          },
          select: { id: true },
          orderBy: { sortOrder: "asc" },
        })

        if (positions.length > 0) {
          await tx.employeePosition.createMany({
            data: positions.map((pos, index) => ({
              employeeId: employee.id,
              positionId: pos.id,
              isPrimary: index === 0,
            })),
            skipDuplicates: true,
          })
        }
      }

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
        role: membership.accessRole?.key ?? membership.legacyRole ?? "worker",
        membershipStatus: membership.isActive ? "active" : "blocked",
        employeeId: employee.id,
      }
    })

    if ("error" in redemption) {
      const message =
        redemption.error === "CODE_EXPIRED"
          ? "Код приглашения истёк"
          : redemption.error === "CODE_LIMIT_REACHED"
            ? "Лимит использования кода исчерпан"
            : "Неверный код"
      return NextResponse.json({ error: message, code: redemption.error }, { status: 400 })
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        fullName,
        primaryMode: "worker",
        status: "active",
        onboardingReady: true,
        activeOrganizationId: redemption.organizationId,
      },
    })

    return NextResponse.json({
      data: {
        success: true,
        status: redemption.status,
        organizationId: redemption.organizationId,
        role: redemption.role,
        membershipStatus: redemption.membershipStatus,
        employeeId: redemption.status === "JOINED" ? redemption.employeeId : null,
      },
    })
  }

  // If invitation token is provided, accept the invitation
  if (invitationToken) {
    const invitation = await prisma.invitation.findUnique({
      where: { token: invitationToken },
      include: { accessRole: true },
    })

    if (!invitation) {
      return NextResponse.json({ error: "Приглашение не найдено" }, { status: 404 })
    }

    if (invitation.acceptedAt) {
      return NextResponse.json({ error: "Приглашение уже использовано" }, { status: 400 })
    }

    if (invitation.expiresAt < new Date()) {
      return NextResponse.json({ error: "Приглашение истекло" }, { status: 400 })
    }

    // Create organization membership
    await prisma.organizationMember.upsert({
      where: {
        organizationId_userId: {
          organizationId: invitation.organizationId,
          userId: user.id,
        },
      },
      create: {
        organizationId: invitation.organizationId,
        userId: user.id,
        accessRoleId: invitation.accessRoleId,
        legacyRole: "worker",
      },
      update: {
        accessRoleId: invitation.accessRoleId,
        isActive: true,
      },
    })

    // Create employee record
    const employee = await prisma.employee.upsert({
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

    // Link to location if specified in invitation
    if (invitation.locationId) {
      await prisma.employeeLocation.upsert({
        where: {
          employeeId_locationId: {
            employeeId: employee.id,
            locationId: invitation.locationId,
          },
        },
        create: {
          employeeId: employee.id,
          locationId: invitation.locationId,
          isPrimary: true,
        },
        update: {},
      })
    }

    // Mark invitation as accepted
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    })

    await prisma.user.update({
      where: { id: user.id },
      data: {
        fullName,
        primaryMode: "worker",
        status: "active",
        onboardingReady: true,
        activeOrganizationId: invitation.organizationId,
      },
    })

    return NextResponse.json({
      data: {
        success: true,
        organizationId: invitation.organizationId,
        employeeId: employee.id,
      },
    })
  }

  // No invitation - user is registered but not yet connected to any organization
  await prisma.user.update({
    where: { id: user.id },
    data: {
      fullName,
      primaryMode: "worker",
      status: "active",
      onboardingReady: true,
    },
  })

  return NextResponse.json({
    data: {
      success: true,
      message: "Профиль обновлён. Ожидайте приглашение от работодателя.",
    },
  })
}
