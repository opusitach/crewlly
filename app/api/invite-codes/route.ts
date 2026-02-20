import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSessionUserWithOrg, isOwnerOrManagerRole } from "@/lib/auth"
import { createInviteCode } from "@/lib/invite-codes"

const inviteCodeCreateSchema = z.object({
  expiresAt: z.string().datetime().optional(),
  maxUses: z.number().int().positive().optional(),
})

export async function GET() {
  const session = await getSessionUserWithOrg()
  if (!session?.organization || !session.membership) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!isOwnerOrManagerRole(session.membership)) {
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!isOwnerOrManagerRole(session.membership)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const json = await request.json().catch(() => ({}))
  const parsed = inviteCodeCreateSchema.safeParse(json)
  if (!parsed.success) {
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
