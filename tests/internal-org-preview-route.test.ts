import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => {
  const prisma = {
    organization: { findUnique: vi.fn() },
    internalGlobalAccess: { findFirst: vi.fn() },
  }
  return { prisma, getSessionUser: vi.fn() }
})

vi.mock("@/lib/prisma", () => ({ prisma: mocked.prisma }))
vi.mock("@/lib/auth", () => ({ getSessionUser: mocked.getSessionUser }))

import { GET as GET_PREVIEW } from "../app/api/internal/organizations/[id]/route"

const INTERNAL_USER = { id: "u-int", email: "i@crewlly.com", fullName: "Internal", isInternal: true }
const REGULAR_USER = { id: "u-reg", email: "o@v.cz", fullName: "Owner", isInternal: false }
const ORG_ID = "00000000-0000-0000-0000-0000000000a1"

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const req = () => new Request("https://crewlly.test/api/internal/organizations/x")

function grant() {
  mocked.getSessionUser.mockResolvedValue(INTERNAL_USER)
  mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue({ id: "g1" })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("GET /api/internal/organizations/[id] (preselect preview)", () => {
  it("anonymous → 401", async () => {
    mocked.getSessionUser.mockResolvedValue(null)
    const res = await GET_PREVIEW(req(), ctx(ORG_ID))
    expect(res.status).toBe(401)
  })

  it("regular user → 403 (cannot use preselect preview)", async () => {
    mocked.getSessionUser.mockResolvedValue(REGULAR_USER)
    const res = await GET_PREVIEW(req(), ctx(ORG_ID))
    expect(res.status).toBe(403)
    expect(mocked.prisma.organization.findUnique).not.toHaveBeenCalled()
  })

  it("internal user without enabled grant → 403", async () => {
    mocked.getSessionUser.mockResolvedValue(INTERNAL_USER)
    mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue(null)
    const res = await GET_PREVIEW(req(), ctx(ORG_ID))
    expect(res.status).toBe(403)
    expect(mocked.prisma.organization.findUnique).not.toHaveBeenCalled()
  })

  it("malformed (non-uuid) id → 404 without querying", async () => {
    grant()
    const res = await GET_PREVIEW(req(), ctx("not-a-uuid"))
    expect(res.status).toBe(404)
    expect(mocked.prisma.organization.findUnique).not.toHaveBeenCalled()
  })

  it("unknown organization id → 404 (safe invalid-preselect state)", async () => {
    grant()
    mocked.prisma.organization.findUnique.mockResolvedValue(null)
    const res = await GET_PREVIEW(req(), ctx(ORG_ID))
    expect(res.status).toBe(404)
  })

  it("eligible internal user → minimal preview, no sensitive fields", async () => {
    grant()
    mocked.prisma.organization.findUnique.mockResolvedValue({
      id: ORG_ID,
      name: "Acme",
      status: "active",
      timezone: "Europe/Prague",
      currency: "CZK",
      createdByUser: { id: "owner-1", fullName: "Owner", email: "owner@acme.cz" },
      _count: { employees: 4, locations: 2 },
    })

    const res = await GET_PREVIEW(req(), ctx(ORG_ID))
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.data.id).toBe(ORG_ID)
    expect(body.data.name).toBe("Acme")
    expect(body.data.status).toBe("active")
    expect(body.data.employeesCount).toBe(4)
    expect(body.data.locationsCount).toBe(2)
    expect(body.data.owner.email).toBe("owner@acme.cz")

    // The preview must not start a session and must not leak secrets.
    const raw = JSON.stringify(body)
    expect(raw).not.toContain("passwordHash")
    expect(raw).not.toContain("session")
    // findUnique select is an allow-list (no passwordHash).
    const call = mocked.prisma.organization.findUnique.mock.calls[0][0]
    expect(call.select.passwordHash).toBeUndefined()
  })
})
