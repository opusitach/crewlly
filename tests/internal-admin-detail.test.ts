import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => {
  const prisma = {
    organization: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    organizationMember: { findMany: vi.fn() },
    employee: { findMany: vi.fn() },
    position: { findMany: vi.fn() },
    accessRole: { findMany: vi.fn() },
    ruleTemplate: { findMany: vi.fn(), count: vi.fn() },
    workInterval: { findMany: vi.fn(), count: vi.fn() },
    cashSession: { findMany: vi.fn(), count: vi.fn() },
    payrollRun: { findMany: vi.fn() },
    internalAuditLog: { findMany: vi.fn() },
    internalAccessSession: { findMany: vi.fn() },
    internalGlobalAccess: { findFirst: vi.fn(), findMany: vi.fn() },
  }
  return { prisma, getSessionUser: vi.fn() }
})

vi.mock("@/lib/prisma", () => ({ prisma: mocked.prisma }))
vi.mock("@/lib/auth", () => ({ getSessionUser: mocked.getSessionUser }))

import { GET as GET_ORG } from "../internal-admin/app/api/admin/organizations/[id]/route"
import { GET as GET_USER } from "../internal-admin/app/api/admin/users/[id]/route"

const INTERNAL_USER = { id: "u-int", email: "i@crewlly.com", fullName: "Internal", isInternal: true }
const REGULAR_USER = { id: "u-reg", email: "o@v.cz", fullName: "Owner", isInternal: false }
const ORG_ID = "00000000-0000-0000-0000-0000000000a1"
const USER_ID = "00000000-0000-0000-0000-0000000000b2"

function grantInternalAccess() {
  mocked.getSessionUser.mockResolvedValue(INTERNAL_USER)
  mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue({ id: "g1" })
  mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([{ accessLevel: "owner_view" }])
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const req = () => new Request("https://admin.test/x")

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── Organization detail ────────────────────────────────────────────────────

describe("GET /api/admin/organizations/[id]", () => {
  function seedOrgDetail() {
    mocked.prisma.organization.findUnique.mockResolvedValue({
      id: ORG_ID,
      name: "Acme",
      status: "active",
      timezone: "Europe/Prague",
      currency: "CZK",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-06-01T00:00:00Z"),
      createdByUser: { id: "owner-1", fullName: "Owner", email: "owner@acme.cz" },
      _count: { members: 3, employees: 2, locations: 1, positions: 2, accessRoles: 3, payrollRuns: 1 },
    })
    mocked.prisma.ruleTemplate.count.mockResolvedValue(4)
    mocked.prisma.workInterval.count.mockResolvedValue(1)
    mocked.prisma.cashSession.count.mockResolvedValue(5)
    mocked.prisma.organizationMember.findMany.mockResolvedValue([
      {
        id: "m1",
        isActive: true,
        legacyRole: "owner",
        joinedAt: new Date("2026-01-02T00:00:00Z"),
        user: { id: "owner-1", fullName: "Owner", email: "owner@acme.cz" },
        accessRole: { key: "owner", name: "Владелец" },
      },
    ])
    mocked.prisma.employee.findMany.mockResolvedValue([
      { userId: "owner-1", employmentStatus: "active", employeeCode: "E1" },
    ])
    mocked.prisma.position.findMany.mockResolvedValue([
      {
        id: "p1",
        name: "Waiter",
        isActive: true,
        createdAt: new Date("2026-01-03T00:00:00Z"),
        _count: { employeePositions: 2, ruleTemplates: 3 },
      },
    ])
    mocked.prisma.accessRole.findMany.mockResolvedValue([
      {
        id: "r1",
        key: "owner",
        name: "Владелец",
        isSystem: true,
        isActive: true,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        _count: { members: 1 },
      },
    ])
    mocked.prisma.ruleTemplate.findMany.mockResolvedValue([
      {
        id: "rt1",
        title: "Open checklist",
        type: "CHECKLIST",
        when: "OPEN",
        required: true,
        dayOfWeek: null,
        createdAt: new Date("2026-01-04T00:00:00Z"),
        updatedAt: new Date("2026-01-04T00:00:00Z"),
        position: { id: "p1", name: "Waiter" },
      },
    ])
    mocked.prisma.internalAuditLog.findMany.mockResolvedValue([])
    mocked.prisma.workInterval.findMany.mockResolvedValue([])
    mocked.prisma.cashSession.findMany.mockResolvedValue([])
    mocked.prisma.payrollRun.findMany.mockResolvedValue([])
  }

  it("anonymous → 401", async () => {
    mocked.getSessionUser.mockResolvedValue(null)
    const res = await GET_ORG(req(), ctx(ORG_ID))
    expect(res.status).toBe(401)
  })

  it("regular user → 403", async () => {
    mocked.getSessionUser.mockResolvedValue(REGULAR_USER)
    const res = await GET_ORG(req(), ctx(ORG_ID))
    expect(res.status).toBe(403)
  })

  it("internal user without grant → 403", async () => {
    mocked.getSessionUser.mockResolvedValue(INTERNAL_USER)
    mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue(null)
    const res = await GET_ORG(req(), ctx(ORG_ID))
    expect(res.status).toBe(403)
  })

  it("malformed (non-uuid) id → 404 without querying", async () => {
    grantInternalAccess()
    const res = await GET_ORG(req(), ctx("not-a-uuid"))
    expect(res.status).toBe(404)
    expect(mocked.prisma.organization.findUnique).not.toHaveBeenCalled()
  })

  it("unknown organization id → 404", async () => {
    grantInternalAccess()
    mocked.prisma.organization.findUnique.mockResolvedValue(null)
    const res = await GET_ORG(req(), ctx(ORG_ID))
    expect(res.status).toBe(404)
  })

  it("eligible internal user → full detail with overview/members/positions/roles/rules", async () => {
    grantInternalAccess()
    seedOrgDetail()
    const res = await GET_ORG(req(), ctx(ORG_ID))
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.organization.name).toBe("Acme")
    expect(body.organization.counts.members).toBe(3)
    expect(body.organization.counts.rules).toBe(4)
    expect(body.organization.counts.activeWorkIntervals).toBe(1)
    expect(body.organization.counts.cashSessions).toBe(5)
    expect(body.members).toHaveLength(1)
    expect(body.members[0].roleKey).toBe("owner")
    expect(body.members[0].employmentStatus).toBe("active")
    expect(body.positions[0].rulesCount).toBe(3)
    expect(body.accessRoles[0].membersCount).toBe(1)
    expect(body.rules[0].title).toBe("Open checklist")
  })

  it("members come only from OrganizationMember (internal users never appear)", async () => {
    grantInternalAccess()
    seedOrgDetail()
    await GET_ORG(req(), ctx(ORG_ID))
    // The route must source members from organizationMember.findMany — never from
    // internal access tables. Internal session/audit users are not queried as members.
    expect(mocked.prisma.organizationMember.findMany).toHaveBeenCalledTimes(1)
    const call = mocked.prisma.organizationMember.findMany.mock.calls[0][0]
    expect(call.where).toEqual({ organizationId: ORG_ID })
  })

  it("bounds nested lists with limits (audit/work/cash/positions/rules)", async () => {
    grantInternalAccess()
    seedOrgDetail()
    await GET_ORG(req(), ctx(ORG_ID))
    expect(mocked.prisma.internalAuditLog.findMany.mock.calls[0][0].take).toBe(10)
    expect(mocked.prisma.workInterval.findMany.mock.calls[0][0].take).toBe(10)
    expect(mocked.prisma.cashSession.findMany.mock.calls[0][0].take).toBe(10)
    expect(mocked.prisma.payrollRun.findMany.mock.calls[0][0].take).toBe(10)
    expect(mocked.prisma.ruleTemplate.findMany.mock.calls[0][0].take).toBe(20)
    expect(mocked.prisma.organizationMember.findMany.mock.calls[0][0].take).toBe(50)
  })
})

// ─── User detail ────────────────────────────────────────────────────────────

describe("GET /api/admin/users/[id]", () => {
  function seedInternalUser() {
    mocked.prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      email: "ops@crewlly.com",
      fullName: "Ops Person",
      isInternal: true,
      status: "active",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-02-01T00:00:00Z"),
      internalAccess: [
        {
          id: "g1",
          accessLevel: "owner_view",
          scope: "all_establishments",
          enabled: true,
          createdAt: new Date("2026-01-01T00:00:00Z"),
          updatedAt: new Date("2026-01-01T00:00:00Z"),
        },
        {
          id: "g2",
          accessLevel: "employee_view",
          scope: "all_establishments",
          enabled: false,
          createdAt: new Date("2026-01-01T00:00:00Z"),
          updatedAt: new Date("2026-01-01T00:00:00Z"),
        },
      ],
      _count: { organizationMembers: 0, employees: 0 },
    })
    mocked.prisma.organizationMember.findMany.mockResolvedValue([])
    mocked.prisma.internalAccessSession.findMany.mockResolvedValue([
      {
        id: "s1",
        accessLevel: "owner_view",
        startedAt: new Date("2026-06-01T10:00:00Z"),
        endedAt: new Date("2026-06-01T11:00:00Z"),
        organization: { id: ORG_ID, name: "Acme" },
      },
      {
        id: "s2",
        accessLevel: "owner_view",
        startedAt: new Date("2026-06-02T10:00:00Z"),
        endedAt: null,
        organization: { id: ORG_ID, name: "Acme" },
      },
    ])
    mocked.prisma.internalAuditLog.findMany.mockResolvedValue([])
  }

  it("anonymous → 401", async () => {
    mocked.getSessionUser.mockResolvedValue(null)
    const res = await GET_USER(req(), ctx(USER_ID))
    expect(res.status).toBe(401)
  })

  it("regular user → 403", async () => {
    mocked.getSessionUser.mockResolvedValue(REGULAR_USER)
    const res = await GET_USER(req(), ctx(USER_ID))
    expect(res.status).toBe(403)
  })

  it("unknown user id → 404", async () => {
    grantInternalAccess()
    mocked.prisma.user.findUnique.mockResolvedValue(null)
    const res = await GET_USER(req(), ctx(USER_ID))
    expect(res.status).toBe(404)
  })

  it("never selects or returns sensitive fields", async () => {
    grantInternalAccess()
    seedInternalUser()
    const res = await GET_USER(req(), ctx(USER_ID))
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    const raw = JSON.stringify(body)
    expect(raw).not.toContain("passwordHash")
    expect(raw).not.toContain("password_hash")
    expect(raw).not.toContain("sessionToken")
    expect(body.user).not.toHaveProperty("passwordHash")
    expect(body.user).not.toHaveProperty("sessions")

    // And the Prisma select is an allow-list excluding them.
    const call = mocked.prisma.user.findUnique.mock.calls[0][0]
    expect(call.select.passwordHash).toBeUndefined()
    expect(call.select.sessions).toBeUndefined()
    expect(call.select.email).toBe(true)
  })

  it("shows enabledInternalLevels (only enabled grants)", async () => {
    grantInternalAccess()
    seedInternalUser()
    const res = await GET_USER(req(), ctx(USER_ID))
    const body = (await res.json()) as any
    expect(body.user.enabledInternalLevels).toEqual(["owner_view"])
    // both grants visible in the internalAccess list with their enabled flag
    expect(body.internalAccess).toHaveLength(2)
    expect(body.internalAccess.find((g: any) => g.accessLevel === "employee_view").enabled).toBe(false)
  })

  it("shows recent sessions with duration + active flag, bounded by limit", async () => {
    grantInternalAccess()
    seedInternalUser()
    const res = await GET_USER(req(), ctx(USER_ID))
    const body = (await res.json()) as any
    expect(body.internalSessions).toHaveLength(2)
    const ended = body.internalSessions.find((s: any) => s.id === "s1")
    const active = body.internalSessions.find((s: any) => s.id === "s2")
    expect(ended.durationMs).toBe(60 * 60 * 1000)
    expect(ended.active).toBe(false)
    expect(active.active).toBe(true)
    expect(active.durationMs).toBeNull()
    expect(mocked.prisma.internalAccessSession.findMany.mock.calls[0][0].take).toBe(10)
    expect(mocked.prisma.internalAuditLog.findMany.mock.calls[0][0].take).toBe(10)
  })

  it("regular (non-internal) user detail has empty internal sections", async () => {
    grantInternalAccess()
    mocked.prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      email: "worker@v.cz",
      fullName: "Worker",
      isInternal: false,
      status: "active",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-02-01T00:00:00Z"),
      internalAccess: [],
      _count: { organizationMembers: 2, employees: 1 },
    })
    mocked.prisma.organizationMember.findMany.mockResolvedValue([
      {
        id: "m1",
        isActive: true,
        legacyRole: "worker",
        joinedAt: new Date("2026-01-05T00:00:00Z"),
        organization: { id: ORG_ID, name: "Acme", status: "active" },
        accessRole: { key: "worker", name: "Сотрудник" },
      },
    ])
    mocked.prisma.internalAccessSession.findMany.mockResolvedValue([])
    mocked.prisma.internalAuditLog.findMany.mockResolvedValue([])

    const res = await GET_USER(req(), ctx(USER_ID))
    const body = (await res.json()) as any
    expect(body.user.isInternal).toBe(false)
    expect(body.user.enabledInternalLevels).toEqual([])
    expect(body.internalAccess).toEqual([])
    expect(body.internalSessions).toEqual([])
    expect(body.memberships).toHaveLength(1)
    expect(body.memberships[0].roleKey).toBe("worker")
  })
})
