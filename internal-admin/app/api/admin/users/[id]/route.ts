/**
 * GET /api/admin/users/[id]
 *
 * Read-only drill-down for a single user. Nested lists are bounded (take: 10–100).
 *
 * SECURITY: the Prisma `select` is an allow-list. passwordHash, sessions, and any
 * reset/credential fields are NEVER selected and cannot leak. Internal sections
 * (grants / sessions / audit) are simply empty for non-internal users.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isUuid, notFound, requireAdminApi } from "../../../../../lib/admin-api"

export const dynamic = "force-dynamic"

const MEMBERSHIP_LIMIT = 100
const SESSION_LIMIT = 10
const AUDIT_LIMIT = 10

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: Ctx) {
  const gate = await requireAdminApi()
  if (!gate.ok) return gate.response

  const { id } = await context.params
  if (!isUuid(id)) return notFound("User not found")

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      fullName: true,
      isInternal: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      // All grants (enabled and disabled) — UI shows the `enabled` flag per row.
      internalAccess: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          accessLevel: true,
          scope: true,
          enabled: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      _count: { select: { organizationMembers: true, employees: true } },
      // NOTE: passwordHash, sessions, etc. intentionally NOT selected.
    },
  })

  if (!user) return notFound("User not found")

  const [memberships, internalSessions, internalAudit] = await Promise.all([
    prisma.organizationMember.findMany({
      where: { userId: id },
      take: MEMBERSHIP_LIMIT,
      orderBy: { joinedAt: "desc" },
      select: {
        id: true,
        isActive: true,
        legacyRole: true,
        joinedAt: true,
        organization: { select: { id: true, name: true, status: true } },
        accessRole: { select: { key: true, name: true } },
      },
    }),
    prisma.internalAccessSession.findMany({
      where: { internalUserId: id },
      take: SESSION_LIMIT,
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        accessLevel: true,
        startedAt: true,
        endedAt: true,
        organization: { select: { id: true, name: true } },
      },
    }),
    prisma.internalAuditLog.findMany({
      where: { internalUserId: id },
      take: AUDIT_LIMIT,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        action: true,
        accessLevel: true,
        entityType: true,
        entityId: true,
        metadata: true,
        createdAt: true,
        organization: { select: { id: true, name: true } },
      },
    }),
  ])

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.fullName,
      isInternal: user.isInternal,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      enabledInternalLevels: user.internalAccess
        .filter((g) => g.enabled)
        .map((g) => g.accessLevel),
      counts: {
        memberships: user._count.organizationMembers,
        employees: user._count.employees,
      },
    },
    internalAccess: user.internalAccess.map((g) => ({
      id: g.id,
      accessLevel: g.accessLevel,
      scope: g.scope,
      enabled: g.enabled,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
    })),
    memberships: memberships.map((m) => ({
      id: m.id,
      organization: m.organization
        ? { id: m.organization.id, name: m.organization.name, status: m.organization.status }
        : null,
      roleKey: m.accessRole?.key ?? m.legacyRole ?? null,
      roleName: m.accessRole?.name ?? null,
      isActive: m.isActive,
      joinedAt: m.joinedAt.toISOString(),
    })),
    internalSessions: internalSessions.map((s) => {
      const started = s.startedAt
      const ended = s.endedAt
      const durationMs = ended ? ended.getTime() - started.getTime() : null
      return {
        id: s.id,
        organization: s.organization ? { id: s.organization.id, name: s.organization.name } : null,
        accessLevel: s.accessLevel,
        startedAt: started.toISOString(),
        endedAt: ended?.toISOString() ?? null,
        durationMs,
        active: ended === null,
      }
    }),
    internalAudit: internalAudit.map((e) => ({
      id: e.id,
      action: e.action,
      accessLevel: e.accessLevel,
      entityType: e.entityType,
      entityId: e.entityId,
      metadata: e.metadata ?? null,
      createdAt: e.createdAt.toISOString(),
      organization: e.organization ? { id: e.organization.id, name: e.organization.name } : null,
    })),
  })
}
