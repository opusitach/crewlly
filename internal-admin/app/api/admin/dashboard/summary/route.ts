/**
 * GET /api/admin/dashboard/summary
 *
 * Read-only aggregated counts + a few "latest" lists for the admin dashboard.
 * All queries are bounded (counts or take:5). No sensitive fields are selected.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdminApi } from "../../../../../lib/admin-api"

export const dynamic = "force-dynamic"

export async function GET() {
  const gate = await requireAdminApi()
  if (!gate.ok) return gate.response

  const [
    totalOrganizations,
    activeOrganizations,
    regularUsers,
    internalUsers,
    organizationMembers,
    employees,
    auditLogs,
    latestOrganizations,
    latestAuditEvents,
  ] = await Promise.all([
    prisma.organization.count(),
    prisma.organization.count({ where: { status: "active" } }),
    prisma.user.count({ where: { isInternal: false } }),
    prisma.user.count({ where: { isInternal: true } }),
    prisma.organizationMember.count(),
    prisma.employee.count(),
    prisma.internalAuditLog.count(),
    prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, status: true, createdAt: true },
    }),
    prisma.internalAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        action: true,
        accessLevel: true,
        entityType: true,
        createdAt: true,
        internalUser: { select: { id: true, email: true, fullName: true } },
        organization: { select: { id: true, name: true } },
      },
    }),
  ])

  return NextResponse.json({
    counts: {
      totalOrganizations,
      activeOrganizations,
      regularUsers,
      internalUsers,
      organizationMembers,
      employees,
      auditLogs,
    },
    latestOrganizations: latestOrganizations.map((o) => ({
      id: o.id,
      name: o.name,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
    })),
    latestAuditEvents: latestAuditEvents.map((e) => ({
      id: e.id,
      action: e.action,
      accessLevel: e.accessLevel,
      entityType: e.entityType,
      createdAt: e.createdAt.toISOString(),
      internalUser: e.internalUser
        ? { id: e.internalUser.id, email: e.internalUser.email, name: e.internalUser.fullName }
        : null,
      organization: e.organization ? { id: e.organization.id, name: e.organization.name } : null,
    })),
  })
}
