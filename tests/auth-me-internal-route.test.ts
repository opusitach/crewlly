import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => {
  const prisma = {
    location: {
      findFirst: vi.fn(),
    },
    internalAccessSession: {
      findFirst: vi.fn().mockResolvedValue(null),
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

import { GET } from "../app/api/auth/me/route"

const INTERNAL_USER = {
  id: "internal-user-1",
  email: "internal@crewlly.com",
  fullName: "Internal Admin",
  phone: null,
  avatarUrl: null,
  locale: "ru",
  status: "active",
  primaryMode: "owner",
  onboardingReady: true,
  emailVerifiedAt: null,
  isInternal: true,
  activeOrganizationId: "org-1",
}

const REGULAR_USER = {
  id: "regular-user-1",
  email: "owner@venue.cz",
  fullName: "Venue Owner",
  phone: null,
  avatarUrl: null,
  locale: "ru",
  status: "active",
  primaryMode: "owner",
  onboardingReady: true,
  emailVerifiedAt: null,
  isInternal: false,
  activeOrganizationId: "org-1",
}

const INTERNAL_ACCESS_OWNER = {
  user: {
    id: "internal-user-1",
    email: "internal@crewlly.com",
    fullName: "Internal Admin",
    isInternal: true,
    primaryMode: "owner",
  },
  organizationId: "org-1",
  organization: {
    id: "org-1",
    name: "Test Venue",
    timezone: "Europe/Prague",
    currency: "CZK",
    status: "active",
  },
  isInternalAccess: true,
  internalAccessLevel: "owner_view",
  membership: null,
  realMembershipId: null,
  effectiveRoleKey: "owner",
  permissions: [],
}

const REGULAR_ACCESS_OWNER = {
  user: {
    id: "regular-user-1",
    email: "owner@venue.cz",
    fullName: "Venue Owner",
    isInternal: false,
    primaryMode: "owner",
  },
  organizationId: "org-1",
  organization: {
    id: "org-1",
    name: "Test Venue",
    timezone: "Europe/Prague",
    currency: "CZK",
    status: "active",
  },
  isInternalAccess: false,
  internalAccessLevel: null,
  membership: {
    id: "member-1",
    isActive: true,
    legacyRole: "owner",
    accessRoleId: "role-owner-1",
    accessRole: { id: "role-owner-1", key: "owner", name: "Владелец" },
  },
  realMembershipId: "member-1",
  effectiveRoleKey: "owner",
  permissions: [],
}

describe("GET /api/auth/me — internal user isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.prisma.location.findFirst.mockResolvedValue({ id: "loc-1", name: "Main Hall" })
  })

  it("returns org context for internal user resolved via InternalGlobalAccess", async () => {
    mocked.getSessionUser.mockResolvedValue(INTERNAL_USER)
    mocked.resolveOrganizationAccess.mockResolvedValue(INTERNAL_ACCESS_OWNER)

    const response = await GET()
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(body.organization).toEqual({
      id: "org-1",
      name: "Test Venue",
      timezone: "Europe/Prague",
      currency: "CZK",
    })
    expect(body.defaultLocation).toEqual({ id: "loc-1", name: "Main Hall" })
  })

  it("derives legacyRole from effectiveRoleKey when membership is null (internal path)", async () => {
    mocked.getSessionUser.mockResolvedValue(INTERNAL_USER)
    mocked.resolveOrganizationAccess.mockResolvedValue(INTERNAL_ACCESS_OWNER)

    const response = await GET()
    const body = (await response.json()) as Record<string, unknown>

    // membership is null for internal access → falls back to effectiveRoleKey
    expect(body.legacyRole).toBe("owner")
    // no real AccessRole record for internal access
    expect(body.accessRole).toBeNull()
  })

  it("does not expose isInternal flag in user object", async () => {
    mocked.getSessionUser.mockResolvedValue(INTERNAL_USER)
    mocked.resolveOrganizationAccess.mockResolvedValue(INTERNAL_ACCESS_OWNER)

    const response = await GET()
    const body = (await response.json()) as { user: Record<string, unknown> }

    expect(body.user).not.toHaveProperty("isInternal")
    expect(body.user.id).toBe("internal-user-1")
  })

  it("returns null org context when internal user has no activeOrganizationId", async () => {
    mocked.getSessionUser.mockResolvedValue({ ...INTERNAL_USER, activeOrganizationId: null })

    const response = await GET()
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(body.organization).toBeNull()
    expect(body.legacyRole).toBeNull()
    expect(body.accessRole).toBeNull()
    expect(mocked.resolveOrganizationAccess).not.toHaveBeenCalled()
  })

  it("returns null org context when resolveOrganizationAccess returns null (access revoked)", async () => {
    mocked.getSessionUser.mockResolvedValue(INTERNAL_USER)
    mocked.resolveOrganizationAccess.mockResolvedValue(null)

    const response = await GET()
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(body.organization).toBeNull()
    expect(body.legacyRole).toBeNull()
  })

  it("regular owner still gets legacyRole and accessRole from membership", async () => {
    mocked.getSessionUser.mockResolvedValue(REGULAR_USER)
    mocked.resolveOrganizationAccess.mockResolvedValue(REGULAR_ACCESS_OWNER)

    const response = await GET()
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(body.legacyRole).toBe("owner")
    expect(body.accessRole).toEqual({ id: "role-owner-1", key: "owner", name: "Владелец" })
    expect(body.organization).toEqual({
      id: "org-1",
      name: "Test Venue",
      timezone: "Europe/Prague",
      currency: "CZK",
    })
  })

  it("internal employee_view gets legacyRole worker", async () => {
    mocked.getSessionUser.mockResolvedValue(INTERNAL_USER)
    mocked.resolveOrganizationAccess.mockResolvedValue({
      ...INTERNAL_ACCESS_OWNER,
      internalAccessLevel: "employee_view",
      effectiveRoleKey: "worker",
    })

    const response = await GET()
    const body = (await response.json()) as Record<string, unknown>

    expect(body.legacyRole).toBe("worker")
    expect(body.accessRole).toBeNull()
  })
})
