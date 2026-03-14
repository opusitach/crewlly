import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSessionUserWithOrg, hasOrganizationActionAccess } from "@/lib/auth"
import { auditActorFromSession, logAuditEvent } from "@/lib/observability/audit"

const locationCreateSchema = z.object({
  name: z.string().min(1, "Название обязательно"),
  addressText: z.string().optional().nullable(),
})

export async function GET() {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const locations = await prisma.location.findMany({
    where: {
      organizationId: session.organization.id,
      isActive: true,
    },
    include: {
      workingHours: {
        orderBy: { weekday: "asc" },
      },
      _count: {
        select: {
          workdays: true,
          cashRegisters: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json({ data: locations })
}

export async function POST(request: Request) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    logAuditEvent(request, {
      event_type: "location.create",
      outcome: "denied",
      status: 401,
      route: "/api/locations",
      reason: "unauthorized",
    })
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const canManageLocations = await hasOrganizationActionAccess(session, {
    permission: "settings:manage",
    allowManagementRole: true,
  })
  if (!canManageLocations) {
    logAuditEvent(request, {
      event_type: "location.create",
      outcome: "denied",
      status: 403,
      route: "/api/locations",
      actor: auditActorFromSession(session),
      target: {
        type: "organization",
        id: session.organization.id,
        organization_id: session.organization.id,
      },
      reason: "missing_settings_manage_permission",
    })
    return NextResponse.json({ error: "Недостаточно прав для управления локациями" }, { status: 403 })
  }

  const json = await request.json().catch(() => null)
  const parsed = locationCreateSchema.safeParse(json)
  if (!parsed.success) {
    logAuditEvent(request, {
      event_type: "location.create",
      outcome: "failure",
      status: 400,
      route: "/api/locations",
      actor: auditActorFromSession(session),
      target: {
        type: "organization",
        id: session.organization.id,
        organization_id: session.organization.id,
      },
      reason: "validation_error",
    })
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { name, addressText } = parsed.data

  // Check for duplicate name
  const existing = await prisma.location.findFirst({
    where: { organizationId: session.organization.id, name },
  })

  if (existing) {
    logAuditEvent(request, {
      event_type: "location.create",
      outcome: "failure",
      status: 409,
      route: "/api/locations",
      actor: auditActorFromSession(session),
      target: {
        type: "organization",
        id: session.organization.id,
        organization_id: session.organization.id,
      },
      reason: "duplicate_name",
      metadata: {
        location_name: name,
      },
    })
    return NextResponse.json({ error: "Локация с таким названием уже существует" }, { status: 409 })
  }

  const location = await prisma.location.create({
    data: {
      organizationId: session.organization.id,
      name,
      addressText,
    },
  })

  // Create default cash register
  await prisma.cashRegister.create({
    data: {
      locationId: location.id,
      name: "Main",
    },
  })

  logAuditEvent(request, {
    event_type: "location.create",
    outcome: "success",
    status: 200,
    route: "/api/locations",
    actor: auditActorFromSession(session),
    target: {
      type: "location",
      id: location.id,
      organization_id: session.organization.id,
      location_id: location.id,
    },
    metadata: {
      location_name: location.name,
    },
  })
  return NextResponse.json({ data: location })
}
