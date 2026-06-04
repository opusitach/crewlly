import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => {
  const prisma = {
    internalGlobalAccess: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  }
  return {
    prisma,
    getSessionUser: vi.fn(),
  }
})

vi.mock("@/lib/prisma", () => ({ prisma: mocked.prisma }))
vi.mock("@/lib/auth", () => ({ getSessionUser: mocked.getSessionUser }))

import { resolveAdminAccess } from "../internal-admin/lib/admin-access"
import { GET as GET_ADMIN_ME } from "../internal-admin/app/api/admin/me/route"
import { GET as GET_HEALTH } from "../internal-admin/app/api/health/route"

const INTERNAL_USER = {
  id: "u-internal",
  email: "i@crewlly.com",
  fullName: "Internal Admin",
  isInternal: true,
}
const REGULAR_USER = {
  id: "u-regular",
  email: "o@venue.cz",
  fullName: "Venue Owner",
  isInternal: false,
}

describe("resolveAdminAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns ok:false unauthorized when no session", async () => {
    mocked.getSessionUser.mockResolvedValue(null)
    const result = await resolveAdminAccess()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("unauthorized")
  })

  it("returns ok:false forbidden for regular (non-internal) users", async () => {
    mocked.getSessionUser.mockResolvedValue(REGULAR_USER)
    const result = await resolveAdminAccess()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("forbidden")
    // Importantly: should NOT have queried InternalGlobalAccess for a non-internal user
    expect(mocked.prisma.internalGlobalAccess.findFirst).not.toHaveBeenCalled()
  })

  it("returns ok:false forbidden for internal users without an enabled grant", async () => {
    mocked.getSessionUser.mockResolvedValue(INTERNAL_USER)
    mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue(null)
    const result = await resolveAdminAccess()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("forbidden")
  })

  it("returns ok:true with enabledLevels for internal users with a grant", async () => {
    mocked.getSessionUser.mockResolvedValue(INTERNAL_USER)
    mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue({ id: "g1" })
    mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([
      { accessLevel: "owner_view" },
      { accessLevel: "employee_view" },
    ])

    const result = await resolveAdminAccess()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.access.user.id).toBe(INTERNAL_USER.id)
      expect(result.access.enabledLevels).toEqual(["owner_view", "employee_view"])
    }
  })

  it("does NOT bypass on isInternal alone — explicit grant lookup is mandatory", async () => {
    mocked.getSessionUser.mockResolvedValue(INTERNAL_USER)
    mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue(null)
    const result = await resolveAdminAccess()
    expect(result.ok).toBe(false)
    expect(mocked.prisma.internalGlobalAccess.findFirst).toHaveBeenCalled()
  })
})

describe("GET /api/admin/me", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 for anonymous users", async () => {
    mocked.getSessionUser.mockResolvedValue(null)
    const res = await GET_ADMIN_ME()
    expect(res.status).toBe(401)
  })

  it("returns 403 for regular users — no internal fields leaked", async () => {
    mocked.getSessionUser.mockResolvedValue(REGULAR_USER)
    const res = await GET_ADMIN_ME()
    expect(res.status).toBe(403)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).not.toHaveProperty("user")
    expect(body).not.toHaveProperty("enabledInternalLevels")
  })

  it("returns 403 for internal users without an enabled grant", async () => {
    mocked.getSessionUser.mockResolvedValue(INTERNAL_USER)
    mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue(null)
    const res = await GET_ADMIN_ME()
    expect(res.status).toBe(403)
  })

  it("returns user + enabledInternalLevels for an eligible internal user", async () => {
    mocked.getSessionUser.mockResolvedValue(INTERNAL_USER)
    mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue({ id: "g1" })
    mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([
      { accessLevel: "owner_view" },
    ])

    const res = await GET_ADMIN_ME()
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      user: { id: string; email: string; name: string | null; isInternal: boolean }
      enabledInternalLevels: string[]
    }
    expect(body.user.id).toBe(INTERNAL_USER.id)
    expect(body.user.isInternal).toBe(true)
    expect(body.enabledInternalLevels).toEqual(["owner_view"])
  })
})

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns ok:true without auth", async () => {
    const res = await GET_HEALTH()
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; service: string }
    expect(body.ok).toBe(true)
    expect(body.service).toBe("internal-admin")
  })

  it("does not query the database", async () => {
    // We didn't even need to set up prisma mocks. Reaching the body would call them.
    const res = await GET_HEALTH()
    expect(res.status).toBe(200)
    expect(mocked.prisma.internalGlobalAccess.findFirst).not.toHaveBeenCalled()
    expect(mocked.prisma.internalGlobalAccess.findMany).not.toHaveBeenCalled()
  })
})
