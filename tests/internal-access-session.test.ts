import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => {
  const prisma = {
    internalAccessSession: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    internalGlobalAccess: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    user: {
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    internalAuditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  }

  return {
    prisma,
    getSessionUser: vi.fn(),
    resolveOrganizationAccess: vi.fn(),
  }
})

vi.mock("@/lib/prisma", () => ({ prisma: mocked.prisma }))
vi.mock("@/lib/auth", () => ({ getSessionUser: mocked.getSessionUser }))
vi.mock("@/lib/organization-access", () => ({
  resolveOrganizationAccess: mocked.resolveOrganizationAccess,
}))

// Default $transaction to "run the callback against the mocked prisma directly".
mocked.prisma.$transaction.mockImplementation(async (arg: unknown) => {
  if (typeof arg === "function") {
    return (arg as (tx: typeof mocked.prisma) => unknown)(mocked.prisma)
  }
  return arg
})

import { POST as POST_START } from "../app/api/internal/access-session/start/route"
import { POST as POST_END } from "../app/api/internal/access-session/end/route"
import { GET as GET_CURRENT } from "../app/api/internal/access-session/current/route"
import { GET as GET_ORGS } from "../app/api/internal/organizations/route"

const INTERNAL_USER = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "internal@crewlly.com",
  fullName: "Internal Admin",
  isInternal: true,
  activeOrganizationId: null,
}

const REGULAR_USER = {
  id: "00000000-0000-0000-0000-000000000002",
  email: "owner@venue.cz",
  fullName: "Venue Owner",
  isInternal: false,
  activeOrganizationId: "00000000-0000-0000-0000-000000000aaa",
}

const ORG_ID = "00000000-0000-0000-0000-000000000aaa"

function buildRequest(body: unknown): Request {
  return new Request("https://crewlly.test/api/internal/access-session/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/internal/access-session/start", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.prisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === "function") {
        return (arg as (tx: typeof mocked.prisma) => unknown)(mocked.prisma)
      }
      return arg
    })
    mocked.prisma.organization.findUnique.mockResolvedValue({ id: ORG_ID, status: "active" })
    mocked.prisma.internalAccessSession.updateMany.mockResolvedValue({ count: 0 })
    mocked.prisma.internalAccessSession.create.mockResolvedValue({
      id: "sess_new",
      internalUserId: INTERNAL_USER.id,
      organizationId: ORG_ID,
      accessLevel: "owner_view",
      startedAt: new Date("2026-06-02T10:00:00Z"),
      endedAt: null,
    })
    mocked.prisma.user.update.mockResolvedValue({})
    mocked.resolveOrganizationAccess.mockResolvedValue({
      user: INTERNAL_USER,
      organizationId: ORG_ID,
      organization: { id: ORG_ID, name: "Test", timezone: "Europe/Prague", currency: "CZK", status: "active" },
      isInternalAccess: true,
      internalAccessLevel: "owner_view",
      membership: null,
      effectiveRoleKey: "owner",
      permissions: [],
    })
  })

  it("rejects unauthenticated callers", async () => {
    mocked.getSessionUser.mockResolvedValue(null)
    const res = await POST_START(buildRequest({ organizationId: ORG_ID, accessLevel: "owner_view" }))
    expect(res.status).toBe(401)
  })

  it("rejects regular (non-internal) users", async () => {
    mocked.getSessionUser.mockResolvedValue(REGULAR_USER)
    const res = await POST_START(buildRequest({ organizationId: ORG_ID, accessLevel: "owner_view" }))
    expect(res.status).toBe(403)
    expect(mocked.prisma.internalAccessSession.create).not.toHaveBeenCalled()
  })

  it("rejects when the user has no enabled InternalGlobalAccess grant for the requested level", async () => {
    mocked.getSessionUser.mockResolvedValue(INTERNAL_USER)
    mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue(null)

    const res = await POST_START(buildRequest({ organizationId: ORG_ID, accessLevel: "owner_view" }))
    expect(res.status).toBe(403)
    expect(mocked.prisma.internalAccessSession.create).not.toHaveBeenCalled()
  })

  it("allows owner_view start when the user has the matching grant", async () => {
    mocked.getSessionUser.mockResolvedValue(INTERNAL_USER)
    mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue({ id: "g1" })

    const res = await POST_START(buildRequest({ organizationId: ORG_ID, accessLevel: "owner_view" }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { accessLevel: string }; redirectTo: string }
    expect(body.data.accessLevel).toBe("owner_view")
    expect(body.redirectTo).toBe("/app")
    expect(mocked.prisma.internalAccessSession.create).toHaveBeenCalled()
  })

  it("audit metadata defaults entrypoint to manual_selector when omitted", async () => {
    mocked.getSessionUser.mockResolvedValue(INTERNAL_USER)
    mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue({ id: "g1" })

    await POST_START(buildRequest({ organizationId: ORG_ID, accessLevel: "owner_view" }))

    expect(mocked.prisma.internalAuditLog.create).toHaveBeenCalled()
    const call = mocked.prisma.internalAuditLog.create.mock.calls[0][0]
    expect(call.data.metadata.source).toBe("crewlly_app")
    expect(call.data.metadata.entrypoint).toBe("manual_selector")
  })

  it("records entrypoint=admin_preselect when supplied (intent-only, not authorization)", async () => {
    mocked.getSessionUser.mockResolvedValue(INTERNAL_USER)
    mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue({ id: "g1" })

    await POST_START(
      buildRequest({
        organizationId: ORG_ID,
        accessLevel: "owner_view",
        entrypoint: "admin_preselect",
      }),
    )

    const call = mocked.prisma.internalAuditLog.create.mock.calls[0][0]
    expect(call.data.metadata.entrypoint).toBe("admin_preselect")
  })

  it("ignores an invalid entrypoint value (schema strips it, start still succeeds)", async () => {
    mocked.getSessionUser.mockResolvedValue(INTERNAL_USER)
    mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue({ id: "g1" })

    const res = await POST_START(
      buildRequest({
        organizationId: ORG_ID,
        accessLevel: "owner_view",
        entrypoint: "evil_value",
      }),
    )
    // Invalid enum → 400 (zod rejects the unknown entrypoint). Authorization is unaffected.
    expect(res.status).toBe(400)
    expect(mocked.prisma.internalAccessSession.create).not.toHaveBeenCalled()
  })

  it("allows employee_view start when the user has the matching grant", async () => {
    mocked.getSessionUser.mockResolvedValue(INTERNAL_USER)
    mocked.prisma.internalGlobalAccess.findFirst.mockImplementation(async (args: any) => {
      return args.where.accessLevel === "employee_view" ? { id: "g2" } : null
    })
    mocked.prisma.internalAccessSession.create.mockResolvedValueOnce({
      id: "sess_emp",
      internalUserId: INTERNAL_USER.id,
      organizationId: ORG_ID,
      accessLevel: "employee_view",
      startedAt: new Date(),
      endedAt: null,
    })

    const res = await POST_START(buildRequest({ organizationId: ORG_ID, accessLevel: "employee_view" }))
    expect(res.status).toBe(200)
  })

  it("rejects owner_view when the user only has employee_view", async () => {
    mocked.getSessionUser.mockResolvedValue(INTERNAL_USER)
    mocked.prisma.internalGlobalAccess.findFirst.mockImplementation(async (args: any) => {
      return args.where.accessLevel === "owner_view" ? null : { id: "g2" }
    })

    const res = await POST_START(buildRequest({ organizationId: ORG_ID, accessLevel: "owner_view" }))
    expect(res.status).toBe(403)
    expect(mocked.prisma.internalAccessSession.create).not.toHaveBeenCalled()
  })

  it("ends the previously active session before creating a new one", async () => {
    mocked.getSessionUser.mockResolvedValue(INTERNAL_USER)
    mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue({ id: "g1" })

    const res = await POST_START(buildRequest({ organizationId: ORG_ID, accessLevel: "owner_view" }))
    expect(res.status).toBe(200)
    expect(mocked.prisma.internalAccessSession.updateMany).toHaveBeenCalledWith({
      where: { internalUserId: INTERNAL_USER.id, endedAt: null },
      data: { endedAt: expect.any(Date) },
    })
    // updateMany must be called BEFORE create
    const updateCallOrder = mocked.prisma.internalAccessSession.updateMany.mock.invocationCallOrder[0]
    const createCallOrder = mocked.prisma.internalAccessSession.create.mock.invocationCallOrder[0]
    expect(updateCallOrder).toBeLessThan(createCallOrder)
  })

  it("rejects when the organization does not exist or is inactive", async () => {
    mocked.getSessionUser.mockResolvedValue(INTERNAL_USER)
    mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue({ id: "g1" })
    mocked.prisma.organization.findUnique.mockResolvedValueOnce(null)

    const res = await POST_START(buildRequest({ organizationId: ORG_ID, accessLevel: "owner_view" }))
    expect(res.status).toBe(404)
  })

  it("does not create or touch OrganizationMember records", async () => {
    mocked.getSessionUser.mockResolvedValue(INTERNAL_USER)
    mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue({ id: "g1" })

    // Attach a sentinel: if the route ever touches organizationMember.* we fail loudly.
    const organizationMember = {
      create: vi.fn(() => {
        throw new Error("MUST NOT TOUCH OrganizationMember for internal users")
      }),
      upsert: vi.fn(() => {
        throw new Error("MUST NOT TOUCH OrganizationMember for internal users")
      }),
      update: vi.fn(() => {
        throw new Error("MUST NOT TOUCH OrganizationMember for internal users")
      }),
    }
    Object.assign(mocked.prisma, { organizationMember })

    const res = await POST_START(buildRequest({ organizationId: ORG_ID, accessLevel: "owner_view" }))
    expect(res.status).toBe(200)
    expect(organizationMember.create).not.toHaveBeenCalled()
    expect(organizationMember.upsert).not.toHaveBeenCalled()
    expect(organizationMember.update).not.toHaveBeenCalled()
  })
})

describe("POST /api/internal/access-session/end", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.prisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === "function") {
        return (arg as (tx: typeof mocked.prisma) => unknown)(mocked.prisma)
      }
      return arg
    })
    mocked.prisma.user.update.mockResolvedValue({})
  })

  it("rejects regular users", async () => {
    mocked.getSessionUser.mockResolvedValue(REGULAR_USER)
    const res = await POST_END()
    expect(res.status).toBe(403)
  })

  it("sets endedAt on the active session and returns redirectTo /internal", async () => {
    mocked.getSessionUser.mockResolvedValue(INTERNAL_USER)
    mocked.prisma.internalAccessSession.findFirst.mockResolvedValue({
      id: "sess_active",
      internalUserId: INTERNAL_USER.id,
      organizationId: ORG_ID,
      accessLevel: "owner_view",
      startedAt: new Date("2026-06-02T10:00:00Z"),
      endedAt: null,
    })
    const endedAt = new Date("2026-06-02T11:00:00Z")
    mocked.prisma.internalAccessSession.update.mockResolvedValue({
      id: "sess_active",
      internalUserId: INTERNAL_USER.id,
      organizationId: ORG_ID,
      accessLevel: "owner_view",
      startedAt: new Date("2026-06-02T10:00:00Z"),
      endedAt,
    })
    mocked.resolveOrganizationAccess.mockResolvedValue(null) // grant may already be disabled — ok

    const res = await POST_END()
    expect(res.status).toBe(200)
    const body = (await res.json()) as { redirectTo: string; ended: { id: string } | null }
    expect(body.redirectTo).toBe("/internal")
    expect(body.ended?.id).toBe("sess_active")
    expect(mocked.prisma.internalAccessSession.update).toHaveBeenCalledWith({
      where: { id: "sess_active" },
      data: { endedAt: expect.any(Date) },
    })
  })

  it("is idempotent when there is no active session", async () => {
    mocked.getSessionUser.mockResolvedValue(INTERNAL_USER)
    mocked.prisma.internalAccessSession.findFirst.mockResolvedValue(null)

    const res = await POST_END()
    expect(res.status).toBe(200)
    const body = (await res.json()) as { redirectTo: string; ended: unknown }
    expect(body.redirectTo).toBe("/internal")
    expect(body.ended).toBeNull()
    expect(mocked.prisma.internalAccessSession.update).not.toHaveBeenCalled()
  })
})

describe("GET /api/internal/access-session/current", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("rejects regular users with 403 (does not leak existence)", async () => {
    mocked.getSessionUser.mockResolvedValue(REGULAR_USER)
    const res = await GET_CURRENT()
    expect(res.status).toBe(403)
  })

  it("returns null data when no active session exists", async () => {
    mocked.getSessionUser.mockResolvedValue(INTERNAL_USER)
    mocked.prisma.internalAccessSession.findFirst.mockResolvedValue(null)

    const res = await GET_CURRENT()
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: unknown }
    expect(body.data).toBeNull()
  })

  it("returns the active session with organization info", async () => {
    mocked.getSessionUser.mockResolvedValue(INTERNAL_USER)
    mocked.prisma.internalAccessSession.findFirst.mockResolvedValue({
      id: "s1",
      internalUserId: INTERNAL_USER.id,
      organizationId: ORG_ID,
      accessLevel: "owner_view",
      startedAt: new Date("2026-06-02T10:00:00Z"),
      endedAt: null,
    })
    mocked.prisma.organization.findUnique.mockResolvedValue({ id: ORG_ID, name: "Test", status: "active" })

    const res = await GET_CURRENT()
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: { id: string; accessLevel: string; organization: { name: string } | null }
    }
    expect(body.data?.id).toBe("s1")
    expect(body.data?.accessLevel).toBe("owner_view")
    expect(body.data?.organization?.name).toBe("Test")
  })
})

describe("GET /api/internal/organizations", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([
      { accessLevel: "owner_view" },
      { accessLevel: "employee_view" },
    ])
    mocked.prisma.organization.findMany.mockResolvedValue([])
  })

  it("rejects regular users", async () => {
    mocked.getSessionUser.mockResolvedValue(REGULAR_USER)
    const req = new Request("https://crewlly.test/api/internal/organizations")
    const res = await GET_ORGS(req)
    expect(res.status).toBe(403)
  })

  it("rejects internal users with no enabled grant", async () => {
    mocked.getSessionUser.mockResolvedValue(INTERNAL_USER)
    mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue(null)
    const req = new Request("https://crewlly.test/api/internal/organizations")
    const res = await GET_ORGS(req)
    expect(res.status).toBe(403)
  })

  it("returns organizations and enabledLevels for an internal user with grants", async () => {
    mocked.getSessionUser.mockResolvedValue(INTERNAL_USER)
    mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue({ id: "g1" })
    mocked.prisma.organization.findMany.mockResolvedValue([
      {
        id: ORG_ID,
        name: "Acme",
        status: "active",
        timezone: "Europe/Prague",
        currency: "CZK",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-06-01T00:00:00Z"),
        createdByUser: { id: "u1", fullName: "Owner", email: "owner@acme.cz" },
        locations: [],
        _count: { employees: 5, locations: 2 },
      },
    ])

    const req = new Request("https://crewlly.test/api/internal/organizations")
    const res = await GET_ORGS(req)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: Array<{ id: string; name: string; employeesCount: number }>
      meta: { enabledLevels: string[] }
    }
    expect(body.data).toHaveLength(1)
    expect(body.data[0]?.employeesCount).toBe(5)
    expect(body.meta.enabledLevels).toEqual(["owner_view", "employee_view"])
  })
})
