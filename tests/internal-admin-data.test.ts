import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => {
  const prisma = {
    organization: { count: vi.fn(), findMany: vi.fn() },
    user: { count: vi.fn(), findMany: vi.fn() },
    organizationMember: { count: vi.fn() },
    employee: { count: vi.fn() },
    internalAuditLog: { count: vi.fn(), findMany: vi.fn() },
    internalGlobalAccess: { findFirst: vi.fn(), findMany: vi.fn() },
  }
  return { prisma, getSessionUser: vi.fn() }
})

vi.mock("@/lib/prisma", () => ({ prisma: mocked.prisma }))
vi.mock("@/lib/auth", () => ({ getSessionUser: mocked.getSessionUser }))

import { GET as GET_SUMMARY } from "../internal-admin/app/api/admin/dashboard/summary/route"
import { GET as GET_ORGS } from "../internal-admin/app/api/admin/organizations/route"
import { GET as GET_USERS } from "../internal-admin/app/api/admin/users/route"
import { GET as GET_AUDIT } from "../internal-admin/app/api/admin/audit-logs/route"

const INTERNAL_USER = { id: "u-int", email: "i@crewlly.com", fullName: "Internal", isInternal: true }
const REGULAR_USER = { id: "u-reg", email: "o@v.cz", fullName: "Owner", isInternal: false }

/** Make resolveAdminAccess pass for an internal user with a grant. */
function grantInternalAccess() {
  mocked.getSessionUser.mockResolvedValue(INTERNAL_USER)
  mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue({ id: "g1" })
  mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([{ accessLevel: "owner_view" }])
}

function req(url: string): Request {
  return new Request(url)
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── Access gating (shared across all four routes) ──────────────────────────

describe("admin data routes — access gating", () => {
  it("dashboard summary: anonymous → 401", async () => {
    mocked.getSessionUser.mockResolvedValue(null)
    const res = await GET_SUMMARY()
    expect(res.status).toBe(401)
  })

  it("dashboard summary: regular user → 403", async () => {
    mocked.getSessionUser.mockResolvedValue(REGULAR_USER)
    const res = await GET_SUMMARY()
    expect(res.status).toBe(403)
  })

  it("dashboard summary: internal user without enabled grant → 403", async () => {
    mocked.getSessionUser.mockResolvedValue(INTERNAL_USER)
    mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue(null)
    const res = await GET_SUMMARY()
    expect(res.status).toBe(403)
  })

  it("organizations: regular user → 403 (no data leaked)", async () => {
    mocked.getSessionUser.mockResolvedValue(REGULAR_USER)
    const res = await GET_ORGS(req("https://admin.test/api/admin/organizations"))
    expect(res.status).toBe(403)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).not.toHaveProperty("data")
  })

  it("users: anonymous → 401", async () => {
    mocked.getSessionUser.mockResolvedValue(null)
    const res = await GET_USERS(req("https://admin.test/api/admin/users"))
    expect(res.status).toBe(401)
  })

  it("audit-logs: internal without grant → 403", async () => {
    mocked.getSessionUser.mockResolvedValue(INTERNAL_USER)
    mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue(null)
    const res = await GET_AUDIT(req("https://admin.test/api/admin/audit-logs"))
    expect(res.status).toBe(403)
  })
})

// ─── Dashboard summary ──────────────────────────────────────────────────────

describe("GET /api/admin/dashboard/summary", () => {
  it("returns aggregated counts for an eligible internal user", async () => {
    grantInternalAccess()
    mocked.prisma.organization.count.mockResolvedValueOnce(10).mockResolvedValueOnce(7)
    mocked.prisma.user.count.mockResolvedValueOnce(100).mockResolvedValueOnce(3)
    mocked.prisma.organizationMember.count.mockResolvedValue(250)
    mocked.prisma.employee.count.mockResolvedValue(240)
    mocked.prisma.internalAuditLog.count.mockResolvedValue(42)
    mocked.prisma.organization.findMany.mockResolvedValue([
      { id: "o1", name: "Acme", status: "active", createdAt: new Date("2026-01-01T00:00:00Z") },
    ])
    mocked.prisma.internalAuditLog.findMany.mockResolvedValue([
      {
        id: "a1",
        action: "position.update",
        accessLevel: "owner_view",
        entityType: "position",
        createdAt: new Date("2026-06-01T00:00:00Z"),
        internalUser: { email: "i@crewlly.com", fullName: "Internal" },
        organization: { id: "o1", name: "Acme" },
      },
    ])

    const res = await GET_SUMMARY()
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      counts: Record<string, number>
      latestOrganizations: unknown[]
      latestAuditEvents: unknown[]
    }
    expect(body.counts.totalOrganizations).toBe(10)
    expect(body.counts.activeOrganizations).toBe(7)
    expect(body.counts.regularUsers).toBe(100)
    expect(body.counts.internalUsers).toBe(3)
    expect(body.counts.organizationMembers).toBe(250)
    expect(body.counts.employees).toBe(240)
    expect(body.counts.auditLogs).toBe(42)
    expect(body.latestOrganizations).toHaveLength(1)
    expect(body.latestAuditEvents).toHaveLength(1)
  })
})

// ─── Organizations ──────────────────────────────────────────────────────────

describe("GET /api/admin/organizations", () => {
  beforeEach(() => {
    grantInternalAccess()
    mocked.prisma.organization.findMany.mockResolvedValue([
      {
        id: "o1",
        name: "Acme",
        status: "active",
        timezone: "Europe/Prague",
        currency: "CZK",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-06-01T00:00:00Z"),
        createdByUser: { id: "u1", fullName: "Owner", email: "owner@acme.cz" },
        _count: { members: 5, employees: 4, locations: 2 },
      },
    ])
    mocked.prisma.organization.count.mockResolvedValue(1)
  })

  it("returns paginated data with counts and owner", async () => {
    const res = await GET_ORGS(req("https://admin.test/api/admin/organizations"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: Array<{ membersCount: number; employeesCount: number; owner: { email: string } | null }>
      pagination: { page: number; limit: number; total: number; totalPages: number }
    }
    expect(body.data).toHaveLength(1)
    expect(body.data[0].membersCount).toBe(5)
    expect(body.data[0].employeesCount).toBe(4)
    expect(body.data[0].owner?.email).toBe("owner@acme.cz")
    expect(body.pagination.total).toBe(1)
    expect(body.pagination.page).toBe(1)
    expect(body.pagination.limit).toBe(25)
  })

  it("caps limit at MAX_LIMIT (100)", async () => {
    await GET_ORGS(req("https://admin.test/api/admin/organizations?limit=999"))
    const call = mocked.prisma.organization.findMany.mock.calls[0][0]
    expect(call.take).toBe(100)
  })

  it("rejects invalid sort with 400", async () => {
    const res = await GET_ORGS(req("https://admin.test/api/admin/organizations?sort=evil"))
    expect(res.status).toBe(400)
  })

  it("passes search across name and owner fields", async () => {
    await GET_ORGS(req("https://admin.test/api/admin/organizations?search=acme"))
    const call = mocked.prisma.organization.findMany.mock.calls[0][0]
    const json = JSON.stringify(call.where)
    expect(json).toContain("acme")
    expect(json).toContain("createdByUser")
  })
})

// ─── Users ──────────────────────────────────────────────────────────────────

describe("GET /api/admin/users", () => {
  beforeEach(() => {
    grantInternalAccess()
    mocked.prisma.user.findMany.mockResolvedValue([
      {
        id: "u1",
        email: "a@b.cz",
        fullName: "A B",
        isInternal: false,
        status: "active",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-02-01T00:00:00Z"),
        internalAccess: [],
        _count: { organizationMembers: 2 },
      },
    ])
    mocked.prisma.user.count.mockResolvedValue(1)
  })

  it("never selects or returns sensitive fields (passwordHash, sessions)", async () => {
    const res = await GET_USERS(req("https://admin.test/api/admin/users"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Array<Record<string, unknown>> }

    // Response must not contain secrets.
    const raw = JSON.stringify(body)
    expect(raw).not.toContain("passwordHash")
    expect(raw).not.toContain("password_hash")
    expect(raw).not.toContain("sessionToken")
    expect(body.data[0]).not.toHaveProperty("passwordHash")
    expect(body.data[0]).not.toHaveProperty("sessions")

    // And the Prisma select is an allow-list that excludes them.
    const call = mocked.prisma.user.findMany.mock.calls[0][0]
    expect(call.select).toBeTruthy()
    expect(call.select.passwordHash).toBeUndefined()
    expect(call.select.sessions).toBeUndefined()
    expect(call.select.email).toBe(true)
  })

  it("validates isInternal param", async () => {
    const res = await GET_USERS(req("https://admin.test/api/admin/users?isInternal=maybe"))
    expect(res.status).toBe(400)
  })

  it("filters by enabled internal level", async () => {
    await GET_USERS(req("https://admin.test/api/admin/users?level=owner_view"))
    const call = mocked.prisma.user.findMany.mock.calls[0][0]
    const json = JSON.stringify(call.where)
    expect(json).toContain("owner_view")
    expect(json).toContain("internalAccess")
  })

  it("rejects invalid level", async () => {
    const res = await GET_USERS(req("https://admin.test/api/admin/users?level=god_mode"))
    expect(res.status).toBe(400)
  })
})

// ─── Audit logs ─────────────────────────────────────────────────────────────

describe("GET /api/admin/audit-logs", () => {
  beforeEach(() => {
    grantInternalAccess()
    mocked.prisma.internalAuditLog.findMany.mockResolvedValue([
      {
        id: "a1",
        action: "position.update",
        accessLevel: "owner_view",
        entityType: "position",
        entityId: "p1",
        metadata: { changedFields: ["name"] },
        createdAt: new Date("2026-06-01T00:00:00Z"),
        internalUser: { id: "u-int", email: "i@crewlly.com", fullName: "Internal" },
        organization: { id: "o1", name: "Acme" },
      },
    ])
    mocked.prisma.internalAuditLog.count.mockResolvedValue(1)
  })

  it("returns internal audit logs only (queries internalAuditLog)", async () => {
    const res = await GET_AUDIT(req("https://admin.test/api/admin/audit-logs"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Array<{ action: string; metadata: unknown }> }
    expect(mocked.prisma.internalAuditLog.findMany).toHaveBeenCalled()
    expect(body.data[0].action).toBe("position.update")
    expect(body.data[0].metadata).toEqual({ changedFields: ["name"] })
  })

  it("applies organizationId + action filters", async () => {
    await GET_AUDIT(
      req("https://admin.test/api/admin/audit-logs?organizationId=o1&action=position.update"),
    )
    const call = mocked.prisma.internalAuditLog.findMany.mock.calls[0][0]
    const json = JSON.stringify(call.where)
    expect(json).toContain("o1")
    expect(json).toContain("position.update")
    // Always newest-first
    expect(call.orderBy).toEqual({ createdAt: "desc" })
  })

  it("rejects invalid accessLevel with 400", async () => {
    const res = await GET_AUDIT(req("https://admin.test/api/admin/audit-logs?accessLevel=root"))
    expect(res.status).toBe(400)
  })

  it("rejects invalid date with 400", async () => {
    const res = await GET_AUDIT(req("https://admin.test/api/admin/audit-logs?from=not-a-date"))
    expect(res.status).toBe(400)
  })
})
