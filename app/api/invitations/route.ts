import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSessionUserWithOrg, hasPermission } from "@/lib/auth"
import crypto from "crypto"
import { auditActorFromSession, hashAuditIdentifier, logAuditEvent } from "@/lib/observability/audit"

const invitationCreateSchema = z.object({
  email: z.string().email("Некорректный email"),
  accessRoleKey: z.enum(["manager", "worker"]).default("worker"),
  locationId: z.string().uuid().optional(),
})

export async function GET(request: Request) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    logAuditEvent(request, {
      event_type: "invitation.list",
      outcome: "denied",
      status: 401,
      route: "/api/invitations",
      reason: "unauthorized",
    })
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(request.url)
  const status = url.searchParams.get("status") // pending | accepted | expired

  const whereClause: {
    organizationId: string
    acceptedAt?: null | { not: null }
    expiresAt?: { lt?: Date; gte?: Date }
  } = {
    organizationId: session.organization.id,
  }

  if (status === "pending") {
    whereClause.acceptedAt = null
    whereClause.expiresAt = { gte: new Date() }
  } else if (status === "accepted") {
    whereClause.acceptedAt = { not: null }
  } else if (status === "expired") {
    whereClause.acceptedAt = null
    whereClause.expiresAt = { lt: new Date() }
  }

  const invitations = await prisma.invitation.findMany({
    where: whereClause,
    include: {
      accessRole: { select: { id: true, key: true, name: true } },
      location: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  logAuditEvent(request, {
    event_type: "invitation.list",
    outcome: "success",
    status: 200,
    route: "/api/invitations",
    actor: auditActorFromSession(session),
    target: {
      type: "organization",
      id: session.organization.id,
      organization_id: session.organization.id,
    },
    metadata: {
      status_filter: status,
      result_count: invitations.length,
    },
  })
  return NextResponse.json({
    data: invitations.map((inv) => ({
      id: inv.id,
      email: inv.email,
      accessRole: inv.accessRole,
      location: inv.location,
      token: inv.token,
      expiresAt: inv.expiresAt.toISOString(),
      acceptedAt: inv.acceptedAt?.toISOString(),
      createdAt: inv.createdAt.toISOString(),
      isExpired: inv.expiresAt < new Date(),
      isAccepted: !!inv.acceptedAt,
    })),
  })
}

export async function POST(request: Request) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    logAuditEvent(request, {
      event_type: "invitation.create",
      outcome: "denied",
      status: 401,
      route: "/api/invitations",
      reason: "unauthorized",
    })
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Check permission
  const canInvite = await hasPermission(session.user.id, session.organization.id, "employee:create")
  if (!canInvite) {
    logAuditEvent(request, {
      event_type: "invitation.create",
      outcome: "denied",
      status: 403,
      route: "/api/invitations",
      actor: auditActorFromSession(session),
      target: {
        type: "organization",
        id: session.organization.id,
        organization_id: session.organization.id,
      },
      reason: "missing_employee_create_permission",
    })
    return NextResponse.json({ error: "Нет прав для приглашения сотрудников" }, { status: 403 })
  }

  const json = await request.json().catch(() => null)
  const parsed = invitationCreateSchema.safeParse(json)
  if (!parsed.success) {
    logAuditEvent(request, {
      event_type: "invitation.create",
      outcome: "failure",
      status: 400,
      route: "/api/invitations",
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

  const { email, accessRoleKey, locationId } = parsed.data

  // Check if invitation already exists and is pending
  const existingInvitation = await prisma.invitation.findFirst({
    where: {
      organizationId: session.organization.id,
      email,
      acceptedAt: null,
      expiresAt: { gte: new Date() },
    },
  })

  if (existingInvitation) {
    logAuditEvent(request, {
      event_type: "invitation.create",
      outcome: "failure",
      status: 409,
      route: "/api/invitations",
      actor: auditActorFromSession(session),
      target: {
        type: "organization",
        id: session.organization.id,
        organization_id: session.organization.id,
        location_id: locationId ?? null,
      },
      reason: "pending_invitation_exists",
      metadata: {
        invitee_email_hash: hashAuditIdentifier(email),
      },
    })
    return NextResponse.json({
      error: "Приглашение для этого email уже существует",
    }, { status: 409 })
  }

  // Check if user is already a member
  const existingUser = await prisma.user.findUnique({ where: { email } })
  if (existingUser) {
    const existingMember = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: session.organization.id,
          userId: existingUser.id,
        },
      },
    })

    if (existingMember?.isActive) {
      logAuditEvent(request, {
        event_type: "invitation.create",
        outcome: "failure",
        status: 409,
        route: "/api/invitations",
        actor: auditActorFromSession(session),
        target: {
          type: "organization",
          id: session.organization.id,
          organization_id: session.organization.id,
          location_id: locationId ?? null,
        },
        reason: "already_member",
        metadata: {
          invitee_email_hash: hashAuditIdentifier(email),
        },
      })
      return NextResponse.json({
        error: "Пользователь уже является членом организации",
      }, { status: 409 })
    }
  }

  // Get access role
  const accessRole = await prisma.accessRole.findFirst({
    where: {
      organizationId: session.organization.id,
      key: accessRoleKey,
    },
  })

  // Generate unique token
  const token = crypto.randomBytes(32).toString("hex")

  // Invitation expires in 7 days
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  const invitation = await prisma.invitation.create({
    data: {
      organizationId: session.organization.id,
      locationId: locationId || null,
      email,
      accessRoleId: accessRole?.id || null,
      token,
      expiresAt,
    },
    include: {
      accessRole: { select: { id: true, key: true, name: true } },
      location: { select: { id: true, name: true } },
    },
  })

  logAuditEvent(request, {
    event_type: "invitation.create",
    outcome: "success",
    status: 200,
    route: "/api/invitations",
    actor: auditActorFromSession(session),
    target: {
      type: "invitation",
      id: invitation.id,
      organization_id: session.organization.id,
      location_id: invitation.locationId ?? null,
      invitation_id: invitation.id,
    },
    metadata: {
      invitee_email_hash: hashAuditIdentifier(email),
      access_role_key: invitation.accessRole?.key ?? accessRoleKey,
    },
  })
  return NextResponse.json({
    data: {
      id: invitation.id,
      email: invitation.email,
      token: invitation.token,
      accessRole: invitation.accessRole,
      location: invitation.location,
      expiresAt: invitation.expiresAt.toISOString(),
      inviteUrl: `${process.env.NEXT_PUBLIC_APP_URL || ""}/invite/${invitation.token}`,
    },
  })
}

export async function DELETE(request: Request) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    logAuditEvent(request, {
      event_type: "invitation.delete",
      outcome: "denied",
      status: 401,
      route: "/api/invitations",
      reason: "unauthorized",
    })
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(request.url)
  const id = url.searchParams.get("id")

  if (!id) {
    logAuditEvent(request, {
      event_type: "invitation.delete",
      outcome: "failure",
      status: 400,
      route: "/api/invitations",
      actor: auditActorFromSession(session),
      target: {
        type: "organization",
        id: session.organization.id,
        organization_id: session.organization.id,
      },
      reason: "missing_invitation_id",
    })
    return NextResponse.json({ error: "id is required" }, { status: 400 })
  }

  const invitation = await prisma.invitation.findFirst({
    where: { id, organizationId: session.organization.id },
  })

  if (!invitation) {
    logAuditEvent(request, {
      event_type: "invitation.delete",
      outcome: "failure",
      status: 404,
      route: "/api/invitations",
      actor: auditActorFromSession(session),
      target: {
        type: "invitation",
        id,
        organization_id: session.organization.id,
        invitation_id: id,
      },
      reason: "invitation_not_found",
    })
    return NextResponse.json({ error: "Приглашение не найдено" }, { status: 404 })
  }

  if (invitation.acceptedAt) {
    logAuditEvent(request, {
      event_type: "invitation.delete",
      outcome: "failure",
      status: 400,
      route: "/api/invitations",
      actor: auditActorFromSession(session),
      target: {
        type: "invitation",
        id: invitation.id,
        organization_id: session.organization.id,
        invitation_id: invitation.id,
      },
      reason: "invitation_already_accepted",
    })
    return NextResponse.json({ error: "Нельзя удалить принятое приглашение" }, { status: 400 })
  }

  await prisma.invitation.delete({ where: { id } })

  logAuditEvent(request, {
    event_type: "invitation.delete",
    outcome: "success",
    status: 200,
    route: "/api/invitations",
    actor: auditActorFromSession(session),
    target: {
      type: "invitation",
      id: invitation.id,
      organization_id: session.organization.id,
      invitation_id: invitation.id,
    },
    metadata: {
      invitee_email_hash: hashAuditIdentifier(invitation.email),
    },
  })
  return NextResponse.json({ success: true })
}
