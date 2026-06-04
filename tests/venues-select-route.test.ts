import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => {
  const prisma = {
    user: {
      update: vi.fn(),
    },
    location: {
      findFirst: vi.fn(),
    },
  }

  return {
    prisma,
    getSessionUser: vi.fn(),
    resolveOrganizationAccess: vi.fn(),
  }
})

vi.mock("@/lib/prisma", () => ({
  prisma: mocked.prisma,
}))

vi.mock("@/lib/auth", () => ({
  getSessionUser: mocked.getSessionUser,
}))

vi.mock("@/lib/organization-access", () => ({
  resolveOrganizationAccess: mocked.resolveOrganizationAccess,
}))

import { POST as POST_VENUE_SELECT } from "../app/api/venues/select/route"

describe("venues select route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.getSessionUser.mockResolvedValue({
      id: "user_1",
      primaryMode: "worker",
    })
  })

  it("returns venue context together with the membership role", async () => {
    mocked.resolveOrganizationAccess.mockResolvedValue({
      organizationId: "11111111-1111-4111-8111-111111111111",
      organization: {
        id: "org_1",
        name: "Venue A",
        timezone: "Europe/Prague",
        currency: "CZK",
        status: "active",
      },
      membership: {
        id: "member_1",
        isActive: true,
        legacyRole: "manager",
        accessRoleId: "role_manager",
        accessRole: {
          id: "role_manager",
          key: "manager",
          name: "Менеджер",
        },
      },
      effectiveRoleKey: "manager",
      isInternalAccess: false,
      internalAccessLevel: null,
      realMembershipId: "member_1",
      permissions: [],
    })
    mocked.prisma.user.update.mockResolvedValue({})
    mocked.prisma.location.findFirst.mockResolvedValue({
      id: "loc_1",
      name: "Main hall",
    })

    const response = await POST_VENUE_SELECT(
      new Request("http://localhost/api/venues/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "11111111-1111-4111-8111-111111111111" }),
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.accessRole).toEqual({
      id: "role_manager",
      key: "manager",
      name: "Менеджер",
    })
    expect(body.legacyRole).toBe("manager")
    expect(body.defaultLocation).toEqual({
      id: "loc_1",
      name: "Main hall",
    })
  })
})
