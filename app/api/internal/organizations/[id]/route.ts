/**
 * GET /api/internal/organizations/[id]
 *
 * Minimal organization preview used by the /internal preselect confirmation card.
 * Access: authenticated User with isInternal = true AND ≥1 enabled InternalGlobalAccess grant.
 *
 * - Does NOT start a session and performs no writes.
 * - Returns only the few fields needed to confirm "this is the org I want to open".
 * - 404 when the organization does not exist (safe invalid-preselect state on the client).
 *
 * Authorization is re-checked here independently of any query param — the admin app
 * handing over an organizationId is only an intent, never a grant.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSessionUser } from "@/lib/auth"
import { hasAnyEnabledInternalGrant } from "@/lib/internal-access/session"

type RouteContext = { params: Promise<{ id: string }> }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_request: Request, context: RouteContext) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!user.isInternal) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!(await hasAnyEnabledInternalGrant(user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await context.params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Организация не найдена" }, { status: 404 })
  }

  const organization = await prisma.organization.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      status: true,
      timezone: true,
      currency: true,
      createdByUser: { select: { id: true, fullName: true, email: true } },
      _count: {
        select: {
          employees: { where: { employmentStatus: "active" } },
          locations: { where: { isActive: true } },
        },
      },
    },
  })

  if (!organization) {
    return NextResponse.json({ error: "Организация не найдена" }, { status: 404 })
  }

  return NextResponse.json({
    data: {
      id: organization.id,
      name: organization.name,
      status: organization.status,
      timezone: organization.timezone,
      currency: organization.currency,
      owner: organization.createdByUser
        ? {
            id: organization.createdByUser.id,
            fullName: organization.createdByUser.fullName,
            email: organization.createdByUser.email,
          }
        : null,
      employeesCount: organization._count.employees,
      locationsCount: organization._count.locations,
    },
  })
}
