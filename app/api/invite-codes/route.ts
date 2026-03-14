import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSessionUserWithOrg, hasOrganizationActionAccess } from "@/lib/auth"
import { createInviteCode } from "@/lib/invite-codes"
import { auditActorFromSession, logAuditEvent } from "@/lib/observability/audit"

const inviteCodeCreateSchema = z.object({
  expiresAt: z.string().datetime().optional(),
  maxUses: z.number().int().positive().optional(),
})

export async function GET(request: Request) {
  const session = await getSessionUserWithOrg()
  if (!session?.organization || !session.membership) {
    logAuditEvent(request, {
      event_type: "invite_code.read",
      outcome: "denied",
      status: 401,
      route: "/api/invite-codes",
      reason: "unauthorized",
    })
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const canManageInviteCodes = await hasOrganizationActionAccess(session, {
    permission: "employee:create",
    allowManagementRole: true,
  })
  if (!canManageInviteCodes) {
    logAuditEvent(request, {
      event_type: "invite_code.read",
      outcome: "denied",
      status: 403,
      route: "/api/invite-codes",
      actor: auditActorFromSession(session),
      target: {
        type: "organization",
        id: session.organization.id,
        organization_id: session.organization.id,
      },
      reason: "missing_employee_create_permission",
    })
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const invitation = await prisma.invitationCode.findFirst({
    where: {
      organizationId: session.organization.id,
      status: "active",
    },
    orderBy: { createdAt: "desc" },
  })

  if (!invitation || !invitation.code) {
    const created = await createInviteCode(prisma, {
      organizationId: session.organization.id,
      createdByUserId: session.user.id,
    })

    logAuditEvent(request, {
      event_type: "invite_code.read",
      outcome: "success",
      status: 200,
      route: "/api/invite-codes",
      actor: auditActorFromSession(session),
      target: {
        type: "organization",
        id: session.organization.id,
        organization_id: session.organization.id,
      },
      metadata: {
        created_on_read: true,
        invite_code_id: created.invitationId,
      },
    })
    return NextResponse.json({
      data: {
        id: created.invitationId,
        code: created.code,
        status: "active",
        expiresAt: created.expiresAt?.toISOString() ?? null,
        maxUses: created.maxUses,
        usesCount: created.usesCount,
        createdAt: new Date().toISOString(),
      },
    })
  }

  logAuditEvent(request, {
    event_type: "invite_code.read",
    outcome: "success",
    status: 200,
    route: "/api/invite-codes",
    actor: auditActorFromSession(session),
    target: {
      type: "organization",
      id: session.organization.id,
      organization_id: session.organization.id,
    },
    metadata: {
      invite_code_id: invitation.id,
      uses_count: invitation.usesCount,
    },
  })
  return NextResponse.json({
    data: {
      id: invitation.id,
      code: invitation.code,
      status: invitation.status,
      expiresAt: invitation.expiresAt?.toISOString() ?? null,
      maxUses: invitation.maxUses,
      usesCount: invitation.usesCount,
      createdAt: invitation.createdAt.toISOString(),
    },
  })
}

export async function POST(request: Request) {
  const session = await getSessionUserWithOrg()
  if (!session?.organization || !session.membership) {
    logAuditEvent(request, {
      event_type: "invite_code.create",
      outcome: "denied",
      status: 401,
      route: "/api/invite-codes",
      reason: "unauthorized",
    })
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const canManageInviteCodes = await hasOrganizationActionAccess(session, {
    permission: "employee:create",
    allowManagementRole: true,
  })
  if (!canManageInviteCodes) {
    logAuditEvent(request, {
      event_type: "invite_code.create",
      outcome: "denied",
      status: 403,
      route: "/api/invite-codes",
      actor: auditActorFromSession(session),
      target: {
        type: "organization",
        id: session.organization.id,
        organization_id: session.organization.id,
      },
      reason: "missing_employee_create_permission",
    })
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const json = await request.json().catch(() => ({}))
  const parsed = inviteCodeCreateSchema.safeParse(json)
  if (!parsed.success) {
    logAuditEvent(request, {
      event_type: "invite_code.create",
      outcome: "failure",
      status: 400,
      route: "/api/invite-codes",
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

  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null
  const maxUses = parsed.data.maxUses ?? null

  const created = await createInviteCode(prisma, {
    organizationId: session.organization.id,
    createdByUserId: session.user.id,
    expiresAt,
    maxUses,
  })

  logAuditEvent(request, {
    event_type: "invite_code.create",
    outcome: "success",
    status: 200,
    route: "/api/invite-codes",
    actor: auditActorFromSession(session),
    target: {
      type: "organization",
      id: session.organization.id,
      organization_id: session.organization.id,
    },
    metadata: {
      invite_code_id: created.invitationId,
      max_uses: created.maxUses,
    },
  })
  return NextResponse.json({
    data: {
      invitationId: created.invitationId,
      code: created.code,
      expiresAt: created.expiresAt?.toISOString() ?? null,
      maxUses: created.maxUses,
      usesCount: created.usesCount,
    },
  })
}
