import { beforeEach, describe, expect, it, vi } from "vitest"
import { SYSTEM_PERMISSIONS_BY_ROLE } from "@/lib/rbac/default-role-permissions"

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mocked = vi.hoisted(() => {
  const prisma = {
    user: { findUnique: vi.fn() },
    organization: { findUnique: vi.fn() },
    organizationMember: { findUnique: vi.fn() },
    internalGlobalAccess: { findMany: vi.fn() },
  }
  return { prisma }
})

vi.mock("@/lib/prisma", () => ({ prisma: mocked.prisma }))

import {
  resolveOrganizationAccess,
  isInternalAccessContext,
  isOwnerEffectiveRole,
  isOwnerOrManagerEffectiveRole,
  hasEffectivePermission,
} from "@/lib/organization-access"

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const BASE_USER_REGULAR = {
  id: "user_regular",
  email: "owner@example.com",
  fullName: "Regular Owner",
  isInternal: false,
  primaryMode: "owner",
}

const BASE_USER_INTERNAL = {
  id: "user_internal",
  email: "internal@example.com",
  fullName: "Platform User",
  isInternal: true,
  primaryMode: null,
}

const BASE_ORG = {
  id: "org_1",
  name: "Test Venue",
  timezone: "Europe/Prague",
  currency: "CZK",
  status: "active",
}

const OWNER_MEMBERSHIP = {
  id: "member_owner",
  isActive: true,
  legacyRole: "owner",
  accessRoleId: "role_owner_id",
  accessRole: {
    id: "role_owner_id",
    key: "owner",
    name: "Владелец",
    permissions: SYSTEM_PERMISSIONS_BY_ROLE.owner.map((key) => ({ permission: { key } })),
  },
}

const WORKER_MEMBERSHIP = {
  id: "member_worker",
  isActive: true,
  legacyRole: "worker",
  accessRoleId: "role_worker_id",
  accessRole: {
    id: "role_worker_id",
    key: "worker",
    name: "Сотрудник",
    permissions: SYSTEM_PERMISSIONS_BY_ROLE.worker.map((key) => ({ permission: { key } })),
  },
}

const MANAGER_MEMBERSHIP = {
  id: "member_manager",
  isActive: true,
  legacyRole: "manager",
  accessRoleId: "role_manager_id",
  accessRole: {
    id: "role_manager_id",
    key: "manager",
    name: "Менеджер",
    permissions: SYSTEM_PERMISSIONS_BY_ROLE.manager.map((key) => ({ permission: { key } })),
  },
}

const OWNER_VIEW_GRANT = { id: "grant_1", accessLevel: "owner_view", scope: "all_establishments" }
const EMPLOYEE_VIEW_GRANT = { id: "grant_2", accessLevel: "employee_view", scope: "all_establishments" }

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([])
})

// ─── Path A: regular member ───────────────────────────────────────────────────

describe("regular member access", () => {
  beforeEach(() => {
    mocked.prisma.organization.findUnique.mockResolvedValue(BASE_ORG)
  })

  it("returns owner context for a member with owner role", async () => {
    mocked.prisma.user.findUnique.mockResolvedValue(BASE_USER_REGULAR)
    mocked.prisma.organizationMember.findUnique.mockResolvedValue(OWNER_MEMBERSHIP)

    const ctx = await resolveOrganizationAccess("user_regular", "org_1")

    expect(ctx).not.toBeNull()
    expect(ctx!.isInternalAccess).toBe(false)
    expect(ctx!.internalAccessLevel).toBeNull()
    expect(ctx!.effectiveRoleKey).toBe("owner")
    expect(ctx!.realMembershipId).toBe("member_owner")
    expect(ctx!.membership?.id).toBe("member_owner")
    expect(ctx!.permissions).toEqual(SYSTEM_PERMISSIONS_BY_ROLE.owner)
  })

  it("returns worker context for a member with worker role", async () => {
    mocked.prisma.user.findUnique.mockResolvedValue(BASE_USER_REGULAR)
    mocked.prisma.organizationMember.findUnique.mockResolvedValue(WORKER_MEMBERSHIP)

    const ctx = await resolveOrganizationAccess("user_regular", "org_1")

    expect(ctx!.effectiveRoleKey).toBe("worker")
    expect(ctx!.permissions).toEqual(SYSTEM_PERMISSIONS_BY_ROLE.worker)
    expect(ctx!.permissions).not.toContain("workday:create")
    expect(ctx!.permissions).toContain("cash:view")
  })

  it("returns manager context for a member with manager role", async () => {
    mocked.prisma.user.findUnique.mockResolvedValue(BASE_USER_REGULAR)
    mocked.prisma.organizationMember.findUnique.mockResolvedValue(MANAGER_MEMBERSHIP)

    const ctx = await resolveOrganizationAccess("user_regular", "org_1")

    expect(ctx!.effectiveRoleKey).toBe("manager")
    expect(ctx!.permissions).toContain("workday:create")
    expect(ctx!.permissions).not.toContain("settings:manage")
    expect(ctx!.permissions).not.toContain("payroll:manage")
  })

  it("returns null when user has no membership and is not internal", async () => {
    mocked.prisma.user.findUnique.mockResolvedValue(BASE_USER_REGULAR)
    mocked.prisma.organizationMember.findUnique.mockResolvedValue(null)

    const ctx = await resolveOrganizationAccess("user_regular", "org_1")

    expect(ctx).toBeNull()
  })

  it("returns null for an inactive membership", async () => {
    mocked.prisma.user.findUnique.mockResolvedValue(BASE_USER_REGULAR)
    mocked.prisma.organizationMember.findUnique.mockResolvedValue({
      ...OWNER_MEMBERSHIP,
      isActive: false,
    })

    const ctx = await resolveOrganizationAccess("user_regular", "org_1")

    expect(ctx).toBeNull()
  })

  it("returns null when the organisation is not active", async () => {
    mocked.prisma.user.findUnique.mockResolvedValue(BASE_USER_REGULAR)
    mocked.prisma.organization.findUnique.mockResolvedValue({ ...BASE_ORG, status: "draft" })
    mocked.prisma.organizationMember.findUnique.mockResolvedValue(OWNER_MEMBERSHIP)

    const ctx = await resolveOrganizationAccess("user_regular", "org_1")

    expect(ctx).toBeNull()
  })

  it("derives effectiveRoleKey from accessRole.key, ignoring legacyRole", async () => {
    mocked.prisma.user.findUnique.mockResolvedValue(BASE_USER_REGULAR)
    mocked.prisma.organizationMember.findUnique.mockResolvedValue({
      ...OWNER_MEMBERSHIP,
      legacyRole: "worker", // accessRole.key=owner should win
    })

    const ctx = await resolveOrganizationAccess("user_regular", "org_1")

    expect(ctx!.effectiveRoleKey).toBe("owner")
  })

  it("falls back to legacyRole permissions when accessRole has no permissions", async () => {
    mocked.prisma.user.findUnique.mockResolvedValue(BASE_USER_REGULAR)
    mocked.prisma.organizationMember.findUnique.mockResolvedValue({
      ...OWNER_MEMBERSHIP,
      accessRole: { ...OWNER_MEMBERSHIP.accessRole, permissions: [] },
    })

    const ctx = await resolveOrganizationAccess("user_regular", "org_1")

    // fallback to SYSTEM_PERMISSIONS_BY_ROLE.owner (via legacyRole=owner)
    expect(ctx!.permissions).toEqual(SYSTEM_PERMISSIONS_BY_ROLE.owner)
  })
})

// ─── Path B: internal access ──────────────────────────────────────────────────

describe("internal access", () => {
  beforeEach(() => {
    mocked.prisma.organization.findUnique.mockResolvedValue(BASE_ORG)
    mocked.prisma.user.findUnique.mockResolvedValue(BASE_USER_INTERNAL)
    mocked.prisma.organizationMember.findUnique.mockResolvedValue(null)
  })

  it("grants owner_view → effectiveRoleKey=owner with full owner permissions", async () => {
    mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([OWNER_VIEW_GRANT])

    const ctx = await resolveOrganizationAccess("user_internal", "org_1")

    expect(ctx).not.toBeNull()
    expect(ctx!.isInternalAccess).toBe(true)
    expect(ctx!.internalAccessLevel).toBe("owner_view")
    expect(ctx!.effectiveRoleKey).toBe("owner")
    expect(ctx!.membership).toBeNull()
    expect(ctx!.realMembershipId).toBeNull()
    expect(ctx!.permissions).toEqual([...SYSTEM_PERMISSIONS_BY_ROLE.owner])
  })

  it("grants employee_view → effectiveRoleKey=worker with worker permissions", async () => {
    mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([EMPLOYEE_VIEW_GRANT])

    const ctx = await resolveOrganizationAccess("user_internal", "org_1")

    expect(ctx!.isInternalAccess).toBe(true)
    expect(ctx!.internalAccessLevel).toBe("employee_view")
    expect(ctx!.effectiveRoleKey).toBe("worker")
    expect(ctx!.permissions).toEqual([...SYSTEM_PERMISSIONS_BY_ROLE.worker])
    expect(ctx!.permissions).not.toContain("workday:create")
  })

  it("returns null when isInternal=true but InternalGlobalAccess is empty", async () => {
    mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([])

    const ctx = await resolveOrganizationAccess("user_internal", "org_1")

    expect(ctx).toBeNull()
  })

  it("returns null when isInternal=true but all grants are disabled", async () => {
    mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([])
    // (disabled grants are filtered at DB level via where: { enabled: true })

    const ctx = await resolveOrganizationAccess("user_internal", "org_1")

    expect(ctx).toBeNull()
  })

  it("prefers owner_view over employee_view when both grants exist", async () => {
    mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([
      EMPLOYEE_VIEW_GRANT,
      OWNER_VIEW_GRANT,
    ])

    const ctx = await resolveOrganizationAccess("user_internal", "org_1")

    expect(ctx!.internalAccessLevel).toBe("owner_view")
    expect(ctx!.effectiveRoleKey).toBe("owner")
  })

  it("respects requestedInternalAccessLevel option", async () => {
    mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([
      EMPLOYEE_VIEW_GRANT,
      OWNER_VIEW_GRANT,
    ])

    const ctx = await resolveOrganizationAccess("user_internal", "org_1", {
      requestedInternalAccessLevel: "employee_view",
    })

    expect(ctx!.internalAccessLevel).toBe("employee_view")
    expect(ctx!.effectiveRoleKey).toBe("worker")
  })

  it("returns null when requestedInternalAccessLevel is not available for this user", async () => {
    mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([EMPLOYEE_VIEW_GRANT])

    const ctx = await resolveOrganizationAccess("user_internal", "org_1", {
      requestedInternalAccessLevel: "owner_view",
    })

    expect(ctx).toBeNull()
  })

  it("does not query InternalGlobalAccess for non-internal users", async () => {
    mocked.prisma.user.findUnique.mockResolvedValue(BASE_USER_REGULAR)
    mocked.prisma.organizationMember.findUnique.mockResolvedValue(null)

    await resolveOrganizationAccess("user_regular", "org_1")

    expect(mocked.prisma.internalGlobalAccess.findMany).not.toHaveBeenCalled()
  })
})

// ─── Mixed: internal user with real membership ────────────────────────────────

describe("internal user who is also a real member", () => {
  beforeEach(() => {
    mocked.prisma.organization.findUnique.mockResolvedValue(BASE_ORG)
    mocked.prisma.user.findUnique.mockResolvedValue(BASE_USER_INTERNAL)
    mocked.prisma.organizationMember.findUnique.mockResolvedValue(WORKER_MEMBERSHIP)
    mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([OWNER_VIEW_GRANT])
  })

  it("uses real membership by default", async () => {
    const ctx = await resolveOrganizationAccess("user_internal", "org_1")

    expect(ctx!.isInternalAccess).toBe(false)
    expect(ctx!.effectiveRoleKey).toBe("worker")
    expect(ctx!.realMembershipId).toBe("member_worker")
    expect(mocked.prisma.internalGlobalAccess.findMany).not.toHaveBeenCalled()
  })

  it("uses internal access when preferInternalAccess=true", async () => {
    const ctx = await resolveOrganizationAccess("user_internal", "org_1", {
      preferInternalAccess: true,
    })

    expect(ctx!.isInternalAccess).toBe(true)
    expect(ctx!.effectiveRoleKey).toBe("owner")
    expect(ctx!.membership).toBeNull()
    expect(mocked.prisma.internalGlobalAccess.findMany).toHaveBeenCalled()
  })
})

// ─── Helper functions ─────────────────────────────────────────────────────────

describe("helper predicates", () => {
  const makeCtx = (
    overrides: Partial<Awaited<ReturnType<typeof resolveOrganizationAccess>>> = {},
  ) =>
    ({
      user: BASE_USER_REGULAR,
      organizationId: "org_1",
      organization: BASE_ORG,
      isInternalAccess: false,
      internalAccessLevel: null,
      membership: null,
      realMembershipId: null,
      effectiveRoleKey: "owner",
      permissions: [...SYSTEM_PERMISSIONS_BY_ROLE.owner],
      ...overrides,
    }) as NonNullable<Awaited<ReturnType<typeof resolveOrganizationAccess>>>

  it("isInternalAccessContext returns true only for internal path", () => {
    expect(isInternalAccessContext(makeCtx({ isInternalAccess: false }))).toBe(false)
    expect(isInternalAccessContext(makeCtx({ isInternalAccess: true }))).toBe(true)
  })

  it("isOwnerEffectiveRole", () => {
    expect(isOwnerEffectiveRole(makeCtx({ effectiveRoleKey: "owner" }))).toBe(true)
    expect(isOwnerEffectiveRole(makeCtx({ effectiveRoleKey: "manager" }))).toBe(false)
    expect(isOwnerEffectiveRole(makeCtx({ effectiveRoleKey: "worker" }))).toBe(false)
  })

  it("isOwnerOrManagerEffectiveRole", () => {
    expect(isOwnerOrManagerEffectiveRole(makeCtx({ effectiveRoleKey: "owner" }))).toBe(true)
    expect(isOwnerOrManagerEffectiveRole(makeCtx({ effectiveRoleKey: "manager" }))).toBe(true)
    expect(isOwnerOrManagerEffectiveRole(makeCtx({ effectiveRoleKey: "worker" }))).toBe(false)
  })

  it("hasEffectivePermission", () => {
    const workerCtx = makeCtx({
      effectiveRoleKey: "worker",
      permissions: [...SYSTEM_PERMISSIONS_BY_ROLE.worker],
    })
    expect(hasEffectivePermission(workerCtx, "cash:view")).toBe(true)
    expect(hasEffectivePermission(workerCtx, "workday:create")).toBe(false)

    const ownerCtx = makeCtx({ permissions: [...SYSTEM_PERMISSIONS_BY_ROLE.owner] })
    expect(hasEffectivePermission(ownerCtx, "settings:manage")).toBe(true)
  })
})
