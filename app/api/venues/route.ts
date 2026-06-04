import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSessionUser, getSessionUserWithOrg } from "@/lib/auth"
import { DEFAULT_TIMEZONE, timezoneSchema } from "@/lib/validation/timezone"
import { ensureInviteCodeForOrganization } from "@/lib/invite-codes"
import { ensureDefaultRolesAndPermissions } from "@/lib/rbac/default-role-permissions"

/**
 * Legacy venues API - maps to new organizations/locations structure
 * Kept for backwards compatibility with existing UI components
 */

const venueSchema = z.object({
  name: z.string().min(1, "Укажите название заведения"),
  address: z.string().optional(),
  city: z.string().optional(),
  timezone: timezoneSchema.default(DEFAULT_TIMEZONE),
  currency: z.string().default("CZK"),
})

export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const memberships = await prisma.organizationMember.findMany({
    where: {
      userId: user.id,
      isActive: true,
      organization: { status: "active" },
    },
    include: {
      organization: {
        include: {
          locations: {
            where: { isActive: true },
            orderBy: { createdAt: "asc" },
          },
        },
      },
      accessRole: {
        select: { id: true, key: true, name: true },
      },
    },
    orderBy: { joinedAt: "asc" },
  })

  const venues = memberships.map((membership) => {
    const organization = membership.organization
    const locations = organization.locations
    return {
      id: organization.id,
      name: organization.name,
      address: locations[0]?.addressText,
      city: null,
      timezone: organization.timezone,
      currency: organization.currency,
      ownerId: user.id,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
      locations: locations.map((loc) => ({
        id: loc.id,
        name: loc.name,
        addressText: loc.addressText,
      })),
      role: membership.accessRole?.key ?? membership.legacyRole ?? null,
    }
  })

  return NextResponse.json({ data: venues })
}

export async function POST(request: Request) {
  const session = await getSessionUserWithOrg()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const json = await request.json().catch(() => null)
  const parsed = venueSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { name, address, city, timezone, currency } = parsed.data

  // Check if user already has an organization
  if (session.organization) {
    // Update existing organization
    const org = await prisma.organization.update({
      where: { id: session.organization.id },
      data: { name, timezone, currency },
    })

    // Update first location's address
    const firstLocation = await prisma.location.findFirst({
      where: { organizationId: org.id },
      orderBy: { createdAt: "asc" },
    })

    if (firstLocation) {
      await prisma.location.update({
        where: { id: firstLocation.id },
        data: { addressText: [address, city].filter(Boolean).join(", ") || null },
      })
    }

    return NextResponse.json({
      data: {
        id: org.id,
        name: org.name,
        timezone: org.timezone,
        currency: org.currency,
      },
    })
  }

  // Create new organization with location
  const org = await prisma.organization.create({
    data: {
      name,
      timezone,
      currency,
      status: "active",
      createdByUserId: session.user.id,
    },
  })

  await prisma.location.create({
    data: {
      organizationId: org.id,
      name,
      addressText: [address, city].filter(Boolean).join(", ") || null,
    },
  })

  const { ownerRole } = await prisma.$transaction((tx) => ensureDefaultRolesAndPermissions(tx, org.id))

  await prisma.organizationMember.create({
    data: {
      organizationId: org.id,
      userId: session.user.id,
      accessRoleId: ownerRole.id,
      legacyRole: "owner",
      createdVia: "manual",
    },
  })

  await ensureInviteCodeForOrganization(prisma, org.id, session.user.id)

  return NextResponse.json({
    data: {
      id: org.id,
      name: org.name,
      timezone: org.timezone,
      currency: org.currency,
    },
  })
}
