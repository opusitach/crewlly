/**
 * GET /api/internal/access-session/current
 *
 * Returns the authenticated internal user's currently active session, or null.
 * Regular users (isInternal = false) receive 403 to avoid leaking the endpoint's presence.
 */
import { NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { getActiveInternalSession } from "@/lib/internal-access/session"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!user.isInternal) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const active = await getActiveInternalSession(user.id)
  if (!active) {
    return NextResponse.json({ data: null })
  }

  const organization = await prisma.organization.findUnique({
    where: { id: active.organizationId },
    select: { id: true, name: true, status: true },
  })

  return NextResponse.json({
    data: {
      id: active.id,
      organizationId: active.organizationId,
      organization: organization
        ? { id: organization.id, name: organization.name, status: organization.status }
        : null,
      accessLevel: active.accessLevel,
      startedAt: active.startedAt.toISOString(),
    },
  })
}
