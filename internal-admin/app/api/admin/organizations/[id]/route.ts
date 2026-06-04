/**
 * GET /api/admin/organizations/[id]
 *
 * Read-only drill-down for a single organization. All nested lists are bounded
 * (take: 10–50). Counts use `_count` where the relation is direct, and small
 * standalone count() queries where the relation is indirect (rules, work
 * intervals, cash sessions all hang off Workday/Position, not Organization).
 *
 * SECURITY: every field is chosen via an explicit Prisma `select` allow-list.
 * No passwordHash / sessions / secrets are ever selected. Members come ONLY from
 * OrganizationMember — internal users (who never have a membership) cannot appear.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isUuid, notFound, requireAdminApi } from "../../../../../lib/admin-api"

export const dynamic = "force-dynamic"

const MEMBER_LIMIT = 50
const POSITION_LIMIT = 50
const ROLE_LIMIT = 50
const RULE_LIMIT = 20
const ACTIVITY_LIMIT = 10

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: Ctx) {
  const gate = await requireAdminApi()
  if (!gate.ok) return gate.response

  const { id } = await context.params
  if (!isUuid(id)) return notFound("Organization not found")

  const organization = await prisma.organization.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      status: true,
      timezone: true,
      currency: true,
      createdAt: true,
      updatedAt: true,
      createdByUser: { select: { id: true, fullName: true, email: true } },
      _count: {
        select: {
          members: true,
          employees: true,
          locations: true,
          positions: true,
          accessRoles: true,
          payrollRuns: true,
        },
      },
    },
  })

  if (!organization) return notFound("Organization not found")

  const [
    rulesCount,
    activeWorkIntervals,
    cashSessionsCount,
    members,
    positions,
    accessRoles,
    rules,
    recentAuditLogs,
    recentWorkIntervals,
    recentCashSessions,
    recentPayrollRuns,
  ] = await Promise.all([
    prisma.ruleTemplate.count({ where: { position: { organizationId: id } } }),
    prisma.workInterval.count({ where: { workday: { organizationId: id }, status: "in_progress" } }),
    prisma.cashSession.count({ where: { workday: { organizationId: id } } }),
    prisma.organizationMember.findMany({
      where: { organizationId: id },
      take: MEMBER_LIMIT,
      orderBy: { joinedAt: "desc" },
      select: {
        id: true,
        isActive: true,
        legacyRole: true,
        joinedAt: true,
        user: { select: { id: true, fullName: true, email: true } },
        accessRole: { select: { key: true, name: true } },
      },
    }),
    prisma.position.findMany({
      where: { organizationId: id },
      take: POSITION_LIMIT,
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        _count: { select: { employeePositions: true, ruleTemplates: true } },
      },
    }),
    prisma.accessRole.findMany({
      where: { organizationId: id },
      take: ROLE_LIMIT,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        key: true,
        name: true,
        isSystem: true,
        isActive: true,
        createdAt: true,
        _count: { select: { members: true } },
      },
    }),
    prisma.ruleTemplate.findMany({
      where: { position: { organizationId: id } },
      take: RULE_LIMIT,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        type: true,
        when: true,
        required: true,
        dayOfWeek: true,
        createdAt: true,
        updatedAt: true,
        position: { select: { id: true, name: true } },
      },
    }),
    prisma.internalAuditLog.findMany({
      where: { organizationId: id },
      take: ACTIVITY_LIMIT,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        action: true,
        accessLevel: true,
        entityType: true,
        entityId: true,
        createdAt: true,
        internalUser: { select: { id: true, email: true, fullName: true } },
      },
    }),
    prisma.workInterval.findMany({
      where: { workday: { organizationId: id } },
      take: ACTIVITY_LIMIT,
      orderBy: { startAt: "desc" },
      select: {
        id: true,
        status: true,
        startAt: true,
        endAt: true,
        employee: { select: { id: true, user: { select: { fullName: true } } } },
        position: { select: { name: true } },
      },
    }),
    prisma.cashSession.findMany({
      where: { workday: { organizationId: id } },
      take: ACTIVITY_LIMIT,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        openedAt: true,
        closedAt: true,
        cashRegister: { select: { name: true } },
      },
    }),
    prisma.payrollRun.findMany({
      where: { organizationId: id },
      take: ACTIVITY_LIMIT,
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, periodStart: true, periodEnd: true, createdAt: true },
    }),
  ])

  // Merge employment status onto members without an N+1: one query, build a map.
  const memberUserIds = members.map((m) => m.user?.id).filter((v): v is string => Boolean(v))
  const employees = memberUserIds.length
    ? await prisma.employee.findMany({
        where: { organizationId: id, userId: { in: memberUserIds } },
        select: { userId: true, employmentStatus: true, employeeCode: true },
      })
    : []
  const empByUser = new Map(employees.map((e) => [e.userId, e]))

  return NextResponse.json({
    organization: {
      id: organization.id,
      name: organization.name,
      status: organization.status,
      timezone: organization.timezone,
      currency: organization.currency,
      createdAt: organization.createdAt.toISOString(),
      updatedAt: organization.updatedAt.toISOString(),
      // TODO(stage-11): real last-activity from latest workday/work_interval if cheap.
      lastActivityAt: organization.updatedAt.toISOString(),
      owner: organization.createdByUser
        ? {
            id: organization.createdByUser.id,
            name: organization.createdByUser.fullName,
            email: organization.createdByUser.email,
          }
        : null,
      counts: {
        members: organization._count.members,
        employees: organization._count.employees,
        locations: organization._count.locations,
        positions: organization._count.positions,
        accessRoles: organization._count.accessRoles,
        payrollRuns: organization._count.payrollRuns,
        rules: rulesCount,
        activeWorkIntervals,
        cashSessions: cashSessionsCount,
      },
    },
    members: members.map((m) => {
      const emp = m.user?.id ? empByUser.get(m.user.id) : undefined
      return {
        id: m.id,
        user: m.user ? { id: m.user.id, name: m.user.fullName, email: m.user.email } : null,
        roleKey: m.accessRole?.key ?? m.legacyRole ?? null,
        roleName: m.accessRole?.name ?? null,
        isActive: m.isActive,
        employmentStatus: emp?.employmentStatus ?? null,
        employeeCode: emp?.employeeCode ?? null,
        joinedAt: m.joinedAt.toISOString(),
      }
    }),
    positions: positions.map((p) => ({
      id: p.id,
      name: p.name,
      isActive: p.isActive,
      employeesCount: p._count.employeePositions,
      rulesCount: p._count.ruleTemplates,
      createdAt: p.createdAt.toISOString(),
    })),
    accessRoles: accessRoles.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      isSystem: r.isSystem,
      isActive: r.isActive,
      membersCount: r._count.members,
      createdAt: r.createdAt.toISOString(),
    })),
    rules: rules.map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      when: r.when,
      required: r.required,
      dayOfWeek: r.dayOfWeek,
      position: r.position ? { id: r.position.id, name: r.position.name } : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    recentAuditLogs: recentAuditLogs.map((e) => ({
      id: e.id,
      action: e.action,
      accessLevel: e.accessLevel,
      entityType: e.entityType,
      entityId: e.entityId,
      createdAt: e.createdAt.toISOString(),
      internalUser: e.internalUser
        ? { id: e.internalUser.id, email: e.internalUser.email, name: e.internalUser.fullName }
        : null,
    })),
    recentWorkIntervals: recentWorkIntervals.map((w) => ({
      id: w.id,
      status: w.status,
      startAt: w.startAt.toISOString(),
      endAt: w.endAt.toISOString(),
      employeeName: w.employee?.user?.fullName ?? null,
      positionName: w.position?.name ?? null,
    })),
    recentCashSessions: recentCashSessions.map((c) => ({
      id: c.id,
      status: c.status,
      openedAt: c.openedAt?.toISOString() ?? null,
      closedAt: c.closedAt?.toISOString() ?? null,
      cashRegisterName: c.cashRegister?.name ?? null,
    })),
    recentPayrollRuns: recentPayrollRuns.map((p) => ({
      id: p.id,
      status: p.status,
      periodStart: p.periodStart.toISOString(),
      periodEnd: p.periodEnd.toISOString(),
      createdAt: p.createdAt.toISOString(),
    })),
  })
}
