import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSessionUser } from "@/lib/auth"
import { resolveOrganizationAccess } from "@/lib/organization-access"
import { auditActorFromSession, logAuditEvent } from "@/lib/observability/audit"
import { logInternalAction, INTERNAL_ACTIONS } from "@/lib/observability/internal-audit"

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

  const access = await resolveOrganizationAccess(user.id, organizationId)
  if (!access) {
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
      reason: "access_denied",
    })
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { activeOrganizationId: organizationId },
  })

  const defaultLocation = await prisma.location.findFirst({
    where: { organizationId, isActive: true },
    orderBy: { createdAt: "asc" },
  })

  logAuditEvent(request, {
    event_type: "organization.switch",
    outcome: "success",
    status: 200,
    route: "/api/venues/select",
    actor: auditActorFromSession({
      user,
      organization: access.organization,
      accessRole: access.membership?.accessRole ?? null,
      membership: access.membership ? { legacyRole: access.membership.legacyRole } : null,
    }),
    target: {
      type: "organization",
      id: organizationId,
      organization_id: organizationId,
      location_id: defaultLocation?.id ?? null,
    },
  })

  void logInternalAction(access, {
    action: INTERNAL_ACTIONS.ORGANIZATION_OPEN,
    entityType: "organization",
    entityId: organizationId,
  })

  return NextResponse.json({
    organization: {
      id: access.organization.id,
      name: access.organization.name,
      timezone: access.organization.timezone,
      currency: access.organization.currency,
    },
    accessRole: access.membership?.accessRole
      ? {
          id: access.membership.accessRole.id,
          key: access.membership.accessRole.key,
          name: access.membership.accessRole.name,
        }
      : null,
    legacyRole: access.membership?.legacyRole ?? access.effectiveRoleKey,
    defaultLocation: defaultLocation
      ? {
          id: defaultLocation.id,
          name: defaultLocation.name,
        }
      : null,
  })
}
