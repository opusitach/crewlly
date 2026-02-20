import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSessionUser } from "@/lib/auth"

const selectVenueSchema = z.object({
  organizationId: z.string().uuid(),
})

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const json = await request.json().catch(() => null)
  const parsed = selectVenueSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { organizationId } = parsed.data

  const membership = await prisma.organizationMember.findFirst({
    where: {
      organizationId,
      userId: user.id,
      isActive: true,
      ...(user.primaryMode === "owner"
        ? {
            OR: [{ accessRole: { key: "owner" } }, { legacyRole: "owner" }],
          }
        : {}),
      organization: { status: "active" },
    },
  })

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { activeOrganizationId: organizationId },
  })

  const [organization, defaultLocation] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId } }),
    prisma.location.findFirst({
      where: { organizationId, isActive: true },
      orderBy: { createdAt: "asc" },
    }),
  ])

  if (!organization) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 })
  }

  return NextResponse.json({
    organization: {
      id: organization.id,
      name: organization.name,
      timezone: organization.timezone,
      currency: organization.currency,
    },
    defaultLocation: defaultLocation
      ? {
          id: defaultLocation.id,
          name: defaultLocation.name,
        }
      : null,
  })
}
