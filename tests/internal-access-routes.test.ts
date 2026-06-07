import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => {
  const prisma = {
    internalGlobalAccess: { findFirst: vi.fn(), findMany: vi.fn() },
    user: { findMany: vi.fn(), count: vi.fn() },
  }
  return {
    prisma,
    getSessionUser: vi.fn(),
    grantInternalAccess: vi.fn(),
    revokeInternalAccess: vi.fn(),
  }
})

vi.mock("@/lib/prisma", () => ({ prisma: mocked.prisma }))
vi.mock("@/lib/auth", () => ({ getSessionUser: mocked.getSessionUser }))
vi.mock("@/lib/internal-access/management", () => ({
  grantInternalAccess: mocked.grantInternalAccess,
  revokeInternalAccess: mocked.revokeInternalAccess,
}))

import { POST as GRANT } from "../internal-admin/app/api/admin/internal-access/grant/route"
import { POST as REVOKE } from "../internal-admin/app/api/admin/internal-access/revoke/route"
import { GET as LIST } from "../internal-admin/app/api/admin/internal-access/route"

const SUPER_ADMIN = { id: "u-super", email: "s@crewlly.com", fullName: "Super", isInternal: true }
const INTERNAL_NON_SUPER = { id: "u-int", email: "i@crewlly.com", fullName: "Int", isInternal: true }
const REGULAR = { id: "u-reg", email: "o@venue.cz", fullName: "Owner", isInternal: false }

const TARGET_UUID = "11111111-1111-1111-1111-111111111111"

function asSuperAdmin() {
  mocked.getSessionUser.mockResolvedValue(SUPER_ADMIN)
  mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue({ id: "g" })
  mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([
    { accessLevel: "super_admin" },
    { accessLevel: "owner_view" },
  ])
}

function asInternalNonSuper() {
  mocked.getSessionUser.mockResolvedValue(INTERNAL_NON_SUPER)
  mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue({ id: "g" })
  mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([{ accessLevel: "owner_view" }])
}

function grantReq(body: unknown) {
  return new Request("http://admin.local/api/admin/internal-access/grant", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

beforeEach(() => vi.clearAllMocks())

describe("POST /grant authorization", () => {
  it("401 for anonymous", async () => {
    mocked.getSessionUser.mockResolvedValue(null)
    const res = await GRANT(grantReq({ targetUserId: TARGET_UUID, accessLevel: "owner_view" }))
    expect(res.status).toBe(401)
    expect(mocked.grantInternalAccess).not.toHaveBeenCalled()
  })

  it("403 for regular user", async () => {
    mocked.getSessionUser.mockResolvedValue(REGULAR)
    const res = await GRANT(grantReq({ targetUserId: TARGET_UUID, accessLevel: "owner_view" }))
    expect(res.status).toBe(403)
    expect(mocked.grantInternalAccess).not.toHaveBeenCalled()
  })

  it("403 for internal NON-super-admin", async () => {
    asInternalNonSuper()
    const res = await GRANT(grantReq({ targetUserId: TARGET_UUID, accessLevel: "owner_view" }))
    expect(res.status).toBe(403)
    expect(mocked.grantInternalAccess).not.toHaveBeenCalled()
  })

  it("400 for invalid accessLevel", async () => {
    asSuperAdmin()
    const res = await GRANT(grantReq({ targetUserId: TARGET_UUID, accessLevel: "nope" }))
    expect(res.status).toBe(400)
  })

  it("super_admin can grant — returns updated levels", async () => {
    asSuperAdmin()
    mocked.grantInternalAccess.mockResolvedValue({
      ok: true,
      created: true,
      enabledLevels: ["owner_view"],
    })
    const res = await GRANT(grantReq({ targetUserId: TARGET_UUID, accessLevel: "owner_view" }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.enabledInternalLevels).toEqual(["owner_view"])
    expect(mocked.grantInternalAccess).toHaveBeenCalledWith({
      actorUserId: SUPER_ADMIN.id,
      targetUserId: TARGET_UUID,
      accessLevel: "owner_view",
    })
  })

  it("400 when target is not internal", async () => {
    asSuperAdmin()
    mocked.grantInternalAccess.mockResolvedValue({ ok: false, code: "target_not_internal" })
    const res = await GRANT(grantReq({ targetUserId: TARGET_UUID, accessLevel: "owner_view" }))
    expect(res.status).toBe(400)
  })

  it("404 when target not found", async () => {
    asSuperAdmin()
    mocked.grantInternalAccess.mockResolvedValue({ ok: false, code: "target_not_found" })
    const res = await GRANT(grantReq({ targetUserId: TARGET_UUID, accessLevel: "owner_view" }))
    expect(res.status).toBe(404)
  })
})

describe("POST /revoke", () => {
  it("403 for internal non-super-admin", async () => {
    asInternalNonSuper()
    const res = await REVOKE(grantReq({ targetUserId: TARGET_UUID, accessLevel: "super_admin" }))
    expect(res.status).toBe(403)
  })

  it("409 when revoking the last super_admin", async () => {
    asSuperAdmin()
    mocked.revokeInternalAccess.mockResolvedValue({ ok: false, code: "last_super_admin" })
    const res = await REVOKE(grantReq({ targetUserId: TARGET_UUID, accessLevel: "super_admin" }))
    expect(res.status).toBe(409)
  })

  it("super_admin can revoke", async () => {
    asSuperAdmin()
    mocked.revokeInternalAccess.mockResolvedValue({
      ok: true,
      deleted: true,
      endedSessions: 1,
      enabledLevels: [],
    })
    const res = await REVOKE(grantReq({ targetUserId: TARGET_UUID, accessLevel: "owner_view" }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.enabledInternalLevels).toEqual([])
  })
})

describe("GET /internal-access list", () => {
  it("403 for regular user", async () => {
    mocked.getSessionUser.mockResolvedValue(REGULAR)
    const res = await LIST(new Request("http://admin.local/api/admin/internal-access"))
    expect(res.status).toBe(403)
  })

  it("does NOT leak passwordHash / secrets in the response", async () => {
    // Even an eligible (non-super) admin can read.
    asInternalNonSuper()
    mocked.prisma.user.findMany.mockResolvedValue([
      {
        id: TARGET_UUID,
        email: "x@crewlly.com",
        fullName: "X",
        isInternal: true,
        status: "active",
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-02"),
        internalAccess: [{ accessLevel: "owner_view" }],
        // these MUST NOT appear in output even if present on the row
        passwordHash: "SECRET_HASH",
        sessions: [{ token: "SECRET_TOKEN" }],
      },
    ])
    mocked.prisma.user.count.mockResolvedValue(1)

    const res = await LIST(new Request("http://admin.local/api/admin/internal-access"))
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).not.toContain("SECRET_HASH")
    expect(text).not.toContain("SECRET_TOKEN")
    expect(text).not.toContain("passwordHash")
    const body = JSON.parse(text)
    expect(body.data[0]).toEqual({
      id: TARGET_UUID,
      email: "x@crewlly.com",
      name: "X",
      isInternal: true,
      status: "active",
      enabledInternalLevels: ["owner_view"],
      createdAt: new Date("2026-01-01").toISOString(),
      updatedAt: new Date("2026-01-02").toISOString(),
    })
  })
})
