import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSessionUser } from "@/lib/auth"
import { timezoneSchema } from "@/lib/validation/timezone"
import { ensureInviteCodeForOrganization } from "@/lib/invite-codes"

const finishSchema = z.object({
  organizationId: z.string().uuid(),
})

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const json = await request.json().catch(() => null)
  const parsed = finishSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { organizationId } = parsed.data

  const membership = await prisma.organizationMember.findFirst({
    where: {
      organizationId,
      userId: user.id,
      isActive: true,
      OR: [{ accessRole: { key: "owner" } }, { legacyRole: "owner" }],
    },
  })

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
  })

  if (!organization) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 })
  }

  if (!organization.name?.trim()) {
    return NextResponse.json({ error: "Название организации обязательно" }, { status: 400 })
  }

  const tzCheck = timezoneSchema.safeParse(organization.timezone)
  if (!tzCheck.success) {
    return NextResponse.json({ error: tzCheck.error.flatten() }, { status: 400 })
  }

  await prisma.$transaction(async (tx) => {
    await tx.organization.update({
      where: { id: organizationId },
      data: { status: "active" },
    })

    await tx.user.update({
      where: { id: user.id },
      data: {
        onboardingReady: true,
        primaryMode: "owner",
        status: "active",
        activeOrganizationId: organizationId,
      },
    })
  })

  await ensureInviteCodeForOrganization(prisma, organizationId, user.id)

  return NextResponse.json({ ok: true })
}
