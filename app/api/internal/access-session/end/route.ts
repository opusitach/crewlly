/**
 * POST /api/internal/access-session/end
 *
 * Ends the authenticated internal user's active session (if any).
 * Idempotent — returns ok:true regardless of whether a session was actually ended.
 */
import { NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { resolveOrganizationAccess } from "@/lib/organization-access"
import { endActiveInternalSession } from "@/lib/internal-access/session"
import { prisma } from "@/lib/prisma"
import { logInternalAction, INTERNAL_ACTIONS } from "@/lib/observability/internal-audit"

export async function POST() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!user.isInternal) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const ended = await endActiveInternalSession(user.id)

  // Clear activeOrganizationId so the next page load doesn't auto-resolve back into the org.
  await prisma.user.update({
    where: { id: user.id },
    data: { activeOrganizationId: null },
  })

  if (ended) {
    // Best-effort audit: try to resolve a context against the org we just left.
    // The resolver may return null (e.g. grant disabled between start and end) — that's fine.
    const access = await resolveOrganizationAccess(user.id, ended.organizationId, {
      requestedInternalAccessLevel: ended.accessLevel,
    })
    if (access) {
      void logInternalAction(access, {
        action: INTERNAL_ACTIONS.INTERNAL_SESSION_END,
        entityType: "internal_access_session",
        entityId: ended.id,
        metadata: {
          organizationId: ended.organizationId,
          accessLevel: ended.accessLevel,
          source: "crewlly_app",
          durationMs: ended.endedAt && ended.startedAt
            ? ended.endedAt.getTime() - ended.startedAt.getTime()
            : null,
        },
      })
    }
  }

  return NextResponse.json({
    ok: true,
    ended: ended
      ? {
          id: ended.id,
          organizationId: ended.organizationId,
          accessLevel: ended.accessLevel,
          startedAt: ended.startedAt.toISOString(),
          endedAt: ended.endedAt?.toISOString() ?? null,
        }
      : null,
    redirectTo: "/internal",
  })
}
