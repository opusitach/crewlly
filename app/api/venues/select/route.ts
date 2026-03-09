import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSessionUser } from "@/lib/auth"
import { auditActorFromSession, logAuditEvent } from "@/lib/observability/audit"

const selectVenueSchema = z.object({
  organizationId: z.string().uuid(),
})

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) {
    logAuditEvent(request, {
      event_type: "organization.switch",
      outcome: "denied",
      status: 401,
      route: "/api/venues/select",
      reason: "unauthorized",
    })
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const json = await request.json().catch(() => null)
  const parsed = selectVenueSchema.safeParse(json)
  if (!parsed.success) {
    logAuditEvent(request, {
      event_type: "organization.switch",
      outcome: "failure",
      status: 400,
      route: "/api/venues/select",
      actor: auditActorFromSession({ user }),
      reason: "validation_error",
    })
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
    include: {
      accessRole: {
        select: {
          id: true,
          key: true,
          name: true,
        },
      },
    },
  })

  if (!membership) {
    logAuditEvent(request, {
      event_type: "organization.switch",
      outcome: "denied",
      status: 403,
      route: "/api/venues/select",
      actor: auditActorFromSession({ user }),
      target: {
        type: "organization",
        id: organizationId,
        organization_id: organizationId,
      },
      reason: "membership_required",
    })
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
    logAuditEvent(request, {
      event_type: "organization.switch",
      outcome: "failure",
      status: 404,
      route: "/api/venues/select",
      actor: auditActorFromSession({ user }),
      target: {
        type: "organization",
        id: organizationId,
        organization_id: organizationId,
      },
      reason: "organization_not_found",
    })
    return NextResponse.json({ error: "Organization not found" }, { status: 404 })
  }

  logAuditEvent(request, {
    event_type: "organization.switch",
    outcome: "success",
    status: 200,
    route: "/api/venues/select",
    actor: auditActorFromSession({
      user,
      organization,
      accessRole: membership.accessRole,
      membership: {
        legacyRole: membership.legacyRole,
      },
    }),
    target: {
      type: "organization",
      id: organizationId,
      organization_id: organizationId,
      location_id: defaultLocation?.id ?? null,
    },
  })
  return NextResponse.json({
    organization: {
      id: organization.id,
      name: organization.name,
      timezone: organization.timezone,
      currency: organization.currency,
    },
    accessRole: membership.accessRole
      ? {
          id: membership.accessRole.id,
          key: membership.accessRole.key,
          name: membership.accessRole.name,
        }
      : null,
    legacyRole: membership.legacyRole ?? null,
    defaultLocation: defaultLocation
      ? {
          id: defaultLocation.id,
          name: defaultLocation.name,
        }
      : null,
  })
}
