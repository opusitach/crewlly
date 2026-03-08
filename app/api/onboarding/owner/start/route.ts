import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getSessionUser } from "@/lib/auth"
import { DEFAULT_TIMEZONE, timezoneSchema } from "@/lib/validation/timezone"
import { ensureInviteCodeForOrganization } from "@/lib/invite-codes"
import { ensureDefaultRolesAndPermissions } from "@/lib/rbac/default-role-permissions"

const startSchema = z.object({
  timezone: timezoneSchema.optional(),
  forceNew: z.boolean().optional(),
})

export async function POST(request: Request) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const json = await request.json().catch(() => ({}))
    const parsed = startSchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const forceNew = parsed.data.forceNew === true
    const activeMemberships = await prisma.organizationMember.findMany({
      where: {
        userId: user.id,
        isActive: true,
      },
      include: {
        accessRole: {
          select: {
            key: true,
          },
        },
      },
    })
    const hasOwnerMembership = activeMemberships.some(
      (membership) => (membership.accessRole?.key ?? membership.legacyRole ?? null) === "owner",
    )
    const hasManagerMembership = activeMemberships.some(
      (membership) => (membership.accessRole?.key ?? membership.legacyRole ?? null) === "manager",
    )

    if (!hasOwnerMembership && hasManagerMembership) {
      return NextResponse.json(
        { error: "Менеджер не может создавать новое заведение" },
        { status: 403 },
      )
    }

    if (!forceNew) {
      const existing = await prisma.organizationMember.findFirst({
        where: {
          userId: user.id,
          isActive: true,
          OR: [{ accessRole: { key: "owner" } }, { legacyRole: "owner" }],
          organization: { status: "draft" },
        },
        include: { organization: true },
      })

      if (existing?.organizationId) {
        return NextResponse.json({ organization_id: existing.organizationId, step: 1 })
      }
    }

    const timezone = parsed.data.timezone ?? DEFAULT_TIMEZONE

    const organization = await prisma.$transaction(async (tx) => {
      await tx.timezone.upsert({
        where: { name: timezone },
        create: { name: timezone },
        update: {},
      })

      const org = await tx.organization.create({
        data: {
          name: "Новая организация",
          timezone,
          status: "draft",
          createdByUserId: user.id,
        },
      })

      const { ownerRole } = await ensureDefaultRolesAndPermissions(tx, org.id)

      await tx.organizationMember.upsert({
        where: {
          organizationId_userId: { organizationId: org.id, userId: user.id },
        },
        create: {
          organizationId: org.id,
          userId: user.id,
          accessRoleId: ownerRole.id,
          legacyRole: "owner",
          isActive: true,
          createdVia: "manual",
        },
        update: {},
      })

      await tx.user.update({
        where: { id: user.id },
        data: { activeOrganizationId: org.id },
      })

      return org
    })

    await ensureInviteCodeForOrganization(prisma, organization.id, user.id)

    return NextResponse.json({ organization_id: organization.id, step: 1 })
  } catch (error) {
    const code =
      error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined
    console.error("[onboarding][owner][start] error", { code, error })
    return NextResponse.json({ error: "Не удалось начать онбординг владельца" }, { status: 500 })
  }
}
