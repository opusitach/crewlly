import { NextResponse } from "next/server"
import { getSessionUserWithOrg, hasOrganizationActionAccess } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { auditActorFromSession, logAuditEvent } from "@/lib/observability/audit"

const buildKey = (venueId: string) => `venue-settings-${venueId}`

export async function GET(request: Request, { params }: { params: Promise<{ venueId: string }> }) {
  const { venueId } = await params
  if (!venueId) {
    return NextResponse.json({ error: "venueId is required" }, { status: 400 })
  }
  const session = await getSessionUserWithOrg()
  if (!session?.organization) {
    logAuditEvent(request, {
      event_type: "venue.settings.read",
      outcome: "denied",
      status: 401,
      route: "/api/venues/[venueId]/settings",
      reason: "unauthorized",
    })
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const canManageSettings = session.organization.id === venueId && await hasOrganizationActionAccess(session, {
    permission: "settings:manage",
    allowManagementRole: true,
  })
  if (!canManageSettings) {
    logAuditEvent(request, {
      event_type: "venue.settings.read",
      outcome: "denied",
      status: 403,
      route: "/api/venues/[venueId]/settings",
      actor: auditActorFromSession(session),
      target: {
        type: "organization",
        id: venueId,
        organization_id: venueId,
      },
      reason: session.organization.id !== venueId ? "organization_mismatch" : "missing_settings_manage_permission",
    })
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const key = buildKey(venueId)
  const record = await prisma.appState.findUnique({ where: { key } })
  return NextResponse.json({ data: record?.data ?? null })
}

export async function PUT(request: Request, { params }: { params: Promise<{ venueId: string }> }) {
  const { venueId } = await params
  if (!venueId) {
    return NextResponse.json({ error: "venueId is required" }, { status: 400 })
  }
  const session = await getSessionUserWithOrg()
  if (!session?.organization) {
    logAuditEvent(request, {
      event_type: "venue.settings.write",
      outcome: "denied",
      status: 401,
      route: "/api/venues/[venueId]/settings",
      reason: "unauthorized",
    })
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const canManageSettings = session.organization.id === venueId && await hasOrganizationActionAccess(session, {
    permission: "settings:manage",
    allowManagementRole: true,
  })
  if (!canManageSettings) {
    logAuditEvent(request, {
      event_type: "venue.settings.write",
      outcome: "denied",
      status: 403,
      route: "/api/venues/[venueId]/settings",
      actor: auditActorFromSession(session),
      target: {
        type: "organization",
        id: venueId,
        organization_id: venueId,
      },
      reason: session.organization.id !== venueId ? "organization_mismatch" : "missing_settings_manage_permission",
    })
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const key = buildKey(venueId)
  const json = await request.json()
  if (json?.data === undefined) {
    return NextResponse.json({ error: "Missing data" }, { status: 400 })
  }

  const record = await prisma.appState.upsert({
    where: { key },
    create: { key, data: json.data },
    update: { data: json.data },
  })

  return NextResponse.json({ data: record.data })
}
