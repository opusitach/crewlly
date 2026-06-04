/**
 * GET /api/admin/audit-logs
 *
 * Paginated list of InternalAuditLog records, newest first. READ-ONLY.
 *
 * Query params (all optional, all filters AND-combined):
 *   - organizationId, internalUserId, action, accessLevel, entityType, entityId
 *   - from, to:  ISO date strings, filter on createdAt (inclusive)
 *   - page / limit
 *
 * NOTE: InternalAuditLog is organization-bound (organizationId is required by the
 * model), so this endpoint only ever returns org-scoped events. Platform-level
 * events (e.g. admin-panel opens with no org) are out of scope here — they need a
 * separate nullable-org model (tracked as a future improvement, see Stage 8 notes).
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import {
  badRequest,
  dateParam,
  paginatedResponse,
  parsePagination,
  requireAdminApi,
  strParam,
} from "../../../../lib/admin-api"

export const dynamic = "force-dynamic"

const LEVELS = ["owner_view", "employee_view"] as const

export async function GET(request: Request) {
  const gate = await requireAdminApi()
  if (!gate.ok) return gate.response

  const { searchParams } = new URL(request.url)
  const pagination = parsePagination(searchParams)

  const organizationId = strParam(searchParams, "organizationId")
  const internalUserId = strParam(searchParams, "internalUserId")
  const action = strParam(searchParams, "action")
  const entityType = strParam(searchParams, "entityType")
  const entityId = strParam(searchParams, "entityId")

  const accessLevelRaw = searchParams.get("accessLevel")?.trim()
  if (accessLevelRaw && !(LEVELS as readonly string[]).includes(accessLevelRaw)) {
    return badRequest("Invalid accessLevel")
  }
  const accessLevel = accessLevelRaw as (typeof LEVELS)[number] | undefined

  const from = dateParam(searchParams, "from")
  const to = dateParam(searchParams, "to")
  if (from === null) return badRequest("Invalid 'from' date")
  if (to === null) return badRequest("Invalid 'to' date")

  const createdAt: Prisma.DateTimeFilter | undefined =
    from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined

  const where: Prisma.InternalAuditLogWhereInput = {
    AND: [
      organizationId ? { organizationId } : {},
      internalUserId ? { internalUserId } : {},
      action ? { action } : {},
      entityType ? { entityType } : {},
      entityId ? { entityId } : {},
      accessLevel ? { accessLevel } : {},
      createdAt ? { createdAt } : {},
    ],
  }

  const [rows, total] = await Promise.all([
    prisma.internalAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.limit,
      select: {
        id: true,
        action: true,
        accessLevel: true,
        entityType: true,
        entityId: true,
        metadata: true,
        createdAt: true,
        internalUser: { select: { id: true, email: true, fullName: true } },
        organization: { select: { id: true, name: true } },
      },
    }),
    prisma.internalAuditLog.count({ where }),
  ])

  const data = rows.map((r) => ({
    id: r.id,
    action: r.action,
    accessLevel: r.accessLevel,
    entityType: r.entityType,
    entityId: r.entityId,
    metadata: r.metadata ?? null,
    createdAt: r.createdAt.toISOString(),
    internalUser: r.internalUser
      ? { id: r.internalUser.id, email: r.internalUser.email, name: r.internalUser.fullName }
      : null,
    organization: r.organization ? { id: r.organization.id, name: r.organization.name } : null,
  }))

  return NextResponse.json(paginatedResponse(data, total, pagination))
}
