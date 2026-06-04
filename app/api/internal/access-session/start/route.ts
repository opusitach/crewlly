/**
 * POST /api/internal/access-session/start
 * Body: { organizationId: string, accessLevel: "owner_view" | "employee_view" }
 *
 * Starts a new internal access session for the authenticated internal user.
 * Ends any previously active session for this user before creating the new one.
 *
 * Backend enforces — frontend visibility of buttons is not trusted:
 *   - user must be authenticated
 *   - user.isInternal = true
 *   - InternalGlobalAccess for requested accessLevel exists AND enabled
 *   - organization exists and is active
 *
 * Writes audit log: ORGANIZATION_OPEN with source "crewlly_app".
 */
import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSessionUser } from "@/lib/auth"
import { resolveOrganizationAccess } from "@/lib/organization-access"
import {
  hasEnabledInternalGrant,
  startInternalSession,
} from "@/lib/internal-access/session"
import { logInternalAction, INTERNAL_ACTIONS } from "@/lib/observability/internal-audit"

const startSchema = z.object({
  organizationId: z.string().uuid(),
  accessLevel: z.enum(["owner_view", "employee_view"]),
  // Intent-only telemetry: where the user came from. NOT used for authorization.
  entrypoint: z.enum(["admin_preselect", "manual_selector"]).optional(),
})

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!user.isInternal) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const json = await request.json().catch(() => null)
  const parsed = startSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const { organizationId, accessLevel, entrypoint } = parsed.data

  // Per-level grant check (employee_view grant does NOT allow starting owner_view).
  if (!(await hasEnabledInternalGrant(user.id, accessLevel))) {
    return NextResponse.json(
      { error: "Нет прав на запрошенный уровень доступа" },
      { status: 403 },
    )
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, status: true },
  })
  if (!organization || organization.status !== "active") {
    return NextResponse.json({ error: "Организация недоступна" }, { status: 404 })
  }

  const session = await startInternalSession({
    internalUserId: user.id,
    organizationId,
    accessLevel,
  })

  // Make sure the internal user's "active organization" follows the session selection
  // so server pages (which read user.activeOrganizationId) target the right org.
  await prisma.user.update({
    where: { id: user.id },
    data: { activeOrganizationId: organizationId },
  })

  // Resolve access context now so we can write an audit log entry.
  // `useActiveInternalSession: true` causes the resolver to use the freshly-created session's level.
  const access = await resolveOrganizationAccess(user.id, organizationId, {
    useActiveInternalSession: true,
  })
  if (access) {
    void logInternalAction(access, {
      action: INTERNAL_ACTIONS.ORGANIZATION_OPEN,
      entityType: "internal_access_session",
      entityId: session.id,
      metadata: {
        organizationId,
        accessLevel,
        source: "crewlly_app",
        entrypoint: entrypoint ?? "manual_selector",
      },
    })
  }

  return NextResponse.json({
    data: {
      id: session.id,
      organizationId: session.organizationId,
      accessLevel: session.accessLevel,
      startedAt: session.startedAt.toISOString(),
    },
    redirectTo: "/app",
  })
}
