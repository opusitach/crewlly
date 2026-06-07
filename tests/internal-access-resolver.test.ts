import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => {
  const prisma = {
    user: { findUnique: vi.fn() },
    organization: { findUnique: vi.fn() },
    organizationMember: { findUnique: vi.fn() },
    internalGlobalAccess: { findMany: vi.fn() },
    internalAccessSession: { findFirst: vi.fn() },
  }
  return { prisma }
})

vi.mock("@/lib/prisma", () => ({ prisma: mocked.prisma }))

import { resolveOrganizationAccess } from "../lib/organization-access"

const USER_ID = "u-internal"
const ORG_ID = "org-1"

const baseUser = {
  id: USER_ID,
  email: "i@crewlly.com",
  fullName: "Internal",
  isInternal: true,
  primaryMode: null,
}
const baseOrg = {
  id: ORG_ID,
  name: "Test",
  timezone: "Europe/Prague",
  currency: "CZK",
  status: "active",
}

describe("resolveOrganizationAccess + useActiveInternalSession", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.prisma.user.findUnique.mockResolvedValue(baseUser)
    mocked.prisma.organization.findUnique.mockResolvedValue(baseOrg)
    mocked.prisma.organizationMember.findUnique.mockResolvedValue(null) // no membership
  })

  it("uses session.accessLevel when useActiveInternalSession=true and grant matches", async () => {
    mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([
      { id: "g1", accessLevel: "owner_view", scope: "all_establishments" },
      { id: "g2", accessLevel: "employee_view", scope: "all_establishments" },
    ])
    mocked.prisma.internalAccessSession.findFirst.mockResolvedValue({ accessLevel: "employee_view" })

    const ctx = await resolveOrganizationAccess(USER_ID, ORG_ID, { useActiveInternalSession: true })
    expect(ctx?.isInternalAccess).toBe(true)
    expect(ctx?.internalAccessLevel).toBe("employee_view")
    expect(ctx?.effectiveRoleKey).toBe("worker") // employee_view → worker
  })

  it("ignores session and defaults to highest grant when useActiveInternalSession=false", async () => {
    mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([
      { id: "g1", accessLevel: "owner_view", scope: "all_establishments" },
      { id: "g2", accessLevel: "employee_view", scope: "all_establishments" },
    ])
    mocked.prisma.internalAccessSession.findFirst.mockResolvedValue({ accessLevel: "employee_view" })

    const ctx = await resolveOrganizationAccess(USER_ID, ORG_ID)
    expect(ctx?.internalAccessLevel).toBe("owner_view") // default = highest
    expect(mocked.prisma.internalAccessSession.findFirst).not.toHaveBeenCalled()
  })

  it("returns null when InternalGlobalAccess is disabled (no enabled rows), even with active session", async () => {
    mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([]) // grant disabled / revoked
    mocked.prisma.internalAccessSession.findFirst.mockResolvedValue({ accessLevel: "owner_view" })

    const ctx = await resolveOrganizationAccess(USER_ID, ORG_ID, { useActiveInternalSession: true })
    expect(ctx).toBeNull()
  })

  it("returns null when session level points at a level the user does not have a grant for", async () => {
    // User has employee_view only; session asks for owner_view
    mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([
      { id: "g2", accessLevel: "employee_view", scope: "all_establishments" },
    ])
    mocked.prisma.internalAccessSession.findFirst.mockResolvedValue({ accessLevel: "owner_view" })

    const ctx = await resolveOrganizationAccess(USER_ID, ORG_ID, { useActiveInternalSession: true })
    expect(ctx).toBeNull()
  })

  it("explicit requestedInternalAccessLevel wins over the active session", async () => {
    mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([
      { id: "g1", accessLevel: "owner_view", scope: "all_establishments" },
      { id: "g2", accessLevel: "employee_view", scope: "all_establishments" },
    ])
    mocked.prisma.internalAccessSession.findFirst.mockResolvedValue({ accessLevel: "employee_view" })

    const ctx = await resolveOrganizationAccess(USER_ID, ORG_ID, {
      useActiveInternalSession: true,
      requestedInternalAccessLevel: "owner_view",
    })
    expect(ctx?.internalAccessLevel).toBe("owner_view")
    // Should not have queried the session at all because the option was explicit
    expect(mocked.prisma.internalAccessSession.findFirst).not.toHaveBeenCalled()
  })

  it("does not consider sessions belonging to other organizations", async () => {
    // The query filters by organizationId in the route; we verify the resolver
    // passes the current organizationId in the where clause.
    mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([
      { id: "g1", accessLevel: "owner_view", scope: "all_establishments" },
    ])
    mocked.prisma.internalAccessSession.findFirst.mockResolvedValue(null)

    await resolveOrganizationAccess(USER_ID, ORG_ID, { useActiveInternalSession: true })

    expect(mocked.prisma.internalAccessSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          internalUserId: USER_ID,
          organizationId: ORG_ID,
          endedAt: null,
        }),
      }),
    )
  })

  it("super_admin alone grants NO organization access (returns null)", async () => {
    // The user is internal with an enabled super_admin grant, but no owner/employee grant.
    mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([
      { id: "g-sa", accessLevel: "super_admin", scope: "all_establishments" },
    ])
    mocked.prisma.internalAccessSession.findFirst.mockResolvedValue(null)

    const ctx = await resolveOrganizationAccess(USER_ID, ORG_ID, { useActiveInternalSession: true })
    expect(ctx).toBeNull()
  })

  it("super_admin requested level never resolves to an org role even with the grant", async () => {
    mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([
      { id: "g-sa", accessLevel: "super_admin", scope: "all_establishments" },
    ])
    const ctx = await resolveOrganizationAccess(USER_ID, ORG_ID, {
      requestedInternalAccessLevel: "super_admin",
    })
    expect(ctx).toBeNull()
  })

  it("super_admin + owner_view: owner_view still resolves to owner access", async () => {
    mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([
      { id: "g-sa", accessLevel: "super_admin", scope: "all_establishments" },
      { id: "g-ow", accessLevel: "owner_view", scope: "all_establishments" },
    ])
    const ctx = await resolveOrganizationAccess(USER_ID, ORG_ID)
    expect(ctx?.isInternalAccess).toBe(true)
    expect(ctx?.internalAccessLevel).toBe("owner_view")
    expect(ctx?.effectiveRoleKey).toBe("owner")
  })

  it("regular path: real OrganizationMember is unaffected by the session flag", async () => {
    mocked.prisma.organizationMember.findUnique.mockResolvedValue({
      id: "m1",
      isActive: true,
      legacyRole: "owner",
      accessRoleId: null,
      accessRole: null,
    })

    const ctx = await resolveOrganizationAccess(USER_ID, ORG_ID, { useActiveInternalSession: true })
    expect(ctx?.isInternalAccess).toBe(false)
    expect(ctx?.effectiveRoleKey).toBe("owner")
    // We should not even query the session table when the regular path applies
    expect(mocked.prisma.internalAccessSession.findFirst).not.toHaveBeenCalled()
  })
})
