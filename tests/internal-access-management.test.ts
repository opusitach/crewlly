import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => {
  const internalGlobalAccess = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
  }
  const internalAccessSession = {
    updateMany: vi.fn(),
  }
  const user = {
    findUnique: vi.fn(),
  }
  const prisma = {
    user,
    internalGlobalAccess,
    internalAccessSession,
    // Run the callback with the same prisma object as the "tx" client.
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
  }
  return { prisma, logPlatformAction: vi.fn() }
})

vi.mock("@/lib/prisma", () => ({ prisma: mocked.prisma }))
vi.mock("@/lib/observability/platform-audit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/observability/platform-audit")>(
    "@/lib/observability/platform-audit",
  )
  return { ...actual, logPlatformAction: mocked.logPlatformAction }
})

import {
  grantInternalAccess,
  revokeInternalAccess,
  hasSuperAdminAccess,
} from "@/lib/internal-access/management"
import { PLATFORM_ACTIONS } from "@/lib/observability/platform-audit"

const ACTOR = "actor-super-admin"
const TARGET = "target-internal"

beforeEach(() => {
  vi.clearAllMocks()
  // Default: a $transaction that just runs the callback against prisma.
  mocked.prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb(mocked.prisma),
  )
})

describe("hasSuperAdminAccess", () => {
  it("true only when an enabled super_admin grant exists", async () => {
    mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue({ id: "g" })
    expect(await hasSuperAdminAccess("u")).toBe(true)
    expect(mocked.prisma.internalGlobalAccess.findFirst).toHaveBeenCalledWith({
      where: { userId: "u", accessLevel: "super_admin", enabled: true },
      select: { id: true },
    })
  })

  it("false when no grant", async () => {
    mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue(null)
    expect(await hasSuperAdminAccess("u")).toBe(false)
  })
})

describe("grantInternalAccess", () => {
  it("grants owner_view to an existing internal user (creates + audits)", async () => {
    mocked.prisma.user.findUnique.mockResolvedValue({ id: TARGET, isInternal: true })
    mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue(null) // not existing
    mocked.prisma.internalGlobalAccess.upsert.mockResolvedValue({})
    mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([{ accessLevel: "owner_view" }])

    const res = await grantInternalAccess({ actorUserId: ACTOR, targetUserId: TARGET, accessLevel: "owner_view" })
    expect(res).toEqual({ ok: true, created: true, enabledLevels: ["owner_view"] })
    expect(mocked.prisma.internalGlobalAccess.upsert).toHaveBeenCalledOnce()
    expect(mocked.logPlatformAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: ACTOR,
        targetUserId: TARGET,
        action: PLATFORM_ACTIONS.INTERNAL_ACCESS_GRANT,
      }),
    )
  })

  it("grants employee_view", async () => {
    mocked.prisma.user.findUnique.mockResolvedValue({ id: TARGET, isInternal: true })
    mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue(null)
    mocked.prisma.internalGlobalAccess.upsert.mockResolvedValue({})
    mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([{ accessLevel: "employee_view" }])
    const res = await grantInternalAccess({ actorUserId: ACTOR, targetUserId: TARGET, accessLevel: "employee_view" })
    expect(res.ok).toBe(true)
  })

  it("grants super_admin", async () => {
    mocked.prisma.user.findUnique.mockResolvedValue({ id: TARGET, isInternal: true })
    mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue(null)
    mocked.prisma.internalGlobalAccess.upsert.mockResolvedValue({})
    mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([{ accessLevel: "super_admin" }])
    const res = await grantInternalAccess({ actorUserId: ACTOR, targetUserId: TARGET, accessLevel: "super_admin" })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.enabledLevels).toContain("super_admin")
  })

  it("cannot grant to a non-internal (regular) user", async () => {
    mocked.prisma.user.findUnique.mockResolvedValue({ id: TARGET, isInternal: false })
    const res = await grantInternalAccess({ actorUserId: ACTOR, targetUserId: TARGET, accessLevel: "owner_view" })
    expect(res).toEqual({ ok: false, code: "target_not_internal" })
    expect(mocked.prisma.internalGlobalAccess.upsert).not.toHaveBeenCalled()
    expect(mocked.logPlatformAction).not.toHaveBeenCalled()
  })

  it("returns target_not_found for unknown user", async () => {
    mocked.prisma.user.findUnique.mockResolvedValue(null)
    const res = await grantInternalAccess({ actorUserId: ACTOR, targetUserId: TARGET, accessLevel: "owner_view" })
    expect(res).toEqual({ ok: false, code: "target_not_found" })
  })

  it("is idempotent when access already exists (no upsert, no audit)", async () => {
    mocked.prisma.user.findUnique.mockResolvedValue({ id: TARGET, isInternal: true })
    mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue({ id: "existing" })
    mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([{ accessLevel: "owner_view" }])
    const res = await grantInternalAccess({ actorUserId: ACTOR, targetUserId: TARGET, accessLevel: "owner_view" })
    expect(res).toEqual({ ok: true, created: false, enabledLevels: ["owner_view"] })
    expect(mocked.prisma.internalGlobalAccess.upsert).not.toHaveBeenCalled()
    expect(mocked.logPlatformAction).not.toHaveBeenCalled()
  })
})

describe("revokeInternalAccess", () => {
  it("hard deletes the grant and writes an audit log", async () => {
    mocked.prisma.user.findUnique.mockResolvedValue({ id: TARGET, isInternal: true })
    mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue({ id: "g" }) // exists
    mocked.prisma.internalGlobalAccess.deleteMany.mockResolvedValue({ count: 1 })
    mocked.prisma.internalAccessSession.updateMany.mockResolvedValue({ count: 0 })
    mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([])

    const res = await revokeInternalAccess({ actorUserId: ACTOR, targetUserId: TARGET, accessLevel: "owner_view" })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.deleted).toBe(true)
    expect(mocked.prisma.internalGlobalAccess.deleteMany).toHaveBeenCalledWith({
      where: { userId: TARGET, accessLevel: "owner_view" },
    })
    expect(mocked.logPlatformAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: PLATFORM_ACTIONS.INTERNAL_ACCESS_REVOKE }),
    )
  })

  it("ends active owner_view sessions on revoke", async () => {
    mocked.prisma.user.findUnique.mockResolvedValue({ id: TARGET, isInternal: true })
    mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue({ id: "g" })
    mocked.prisma.internalGlobalAccess.deleteMany.mockResolvedValue({ count: 1 })
    mocked.prisma.internalAccessSession.updateMany.mockResolvedValue({ count: 2 })
    mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([])

    const res = await revokeInternalAccess({ actorUserId: ACTOR, targetUserId: TARGET, accessLevel: "owner_view" })
    expect(res.ok && res.endedSessions).toBe(2)
    expect(mocked.prisma.internalAccessSession.updateMany).toHaveBeenCalledWith({
      where: { internalUserId: TARGET, accessLevel: "owner_view", endedAt: null },
      data: { endedAt: expect.any(Date) },
    })
  })

  it("ends active employee_view sessions on revoke", async () => {
    mocked.prisma.user.findUnique.mockResolvedValue({ id: TARGET, isInternal: true })
    mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue({ id: "g" })
    mocked.prisma.internalGlobalAccess.deleteMany.mockResolvedValue({ count: 1 })
    mocked.prisma.internalAccessSession.updateMany.mockResolvedValue({ count: 1 })
    mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([])

    await revokeInternalAccess({ actorUserId: ACTOR, targetUserId: TARGET, accessLevel: "employee_view" })
    expect(mocked.prisma.internalAccessSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ accessLevel: "employee_view" }) }),
    )
  })

  it("does NOT touch sessions when revoking super_admin", async () => {
    mocked.prisma.user.findUnique.mockResolvedValue({ id: TARGET, isInternal: true })
    mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue({ id: "g" })
    mocked.prisma.internalGlobalAccess.count.mockResolvedValue(2) // another super_admin remains
    mocked.prisma.internalGlobalAccess.deleteMany.mockResolvedValue({ count: 1 })
    mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([])

    const res = await revokeInternalAccess({ actorUserId: ACTOR, targetUserId: TARGET, accessLevel: "super_admin" })
    expect(res.ok).toBe(true)
    expect(mocked.prisma.internalAccessSession.updateMany).not.toHaveBeenCalled()
  })

  it("refuses to revoke the LAST super_admin (count <= 1)", async () => {
    mocked.prisma.user.findUnique.mockResolvedValue({ id: TARGET, isInternal: true })
    mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue({ id: "g" })
    mocked.prisma.internalGlobalAccess.count.mockResolvedValue(1) // last one

    const res = await revokeInternalAccess({ actorUserId: ACTOR, targetUserId: TARGET, accessLevel: "super_admin" })
    expect(res).toEqual({ ok: false, code: "last_super_admin" })
    expect(mocked.prisma.internalGlobalAccess.deleteMany).not.toHaveBeenCalled()
    expect(mocked.logPlatformAction).not.toHaveBeenCalled()
  })

  it("allows revoking own super_admin when another super_admin remains", async () => {
    mocked.prisma.user.findUnique.mockResolvedValue({ id: ACTOR, isInternal: true })
    mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue({ id: "g" })
    mocked.prisma.internalGlobalAccess.count.mockResolvedValue(2)
    mocked.prisma.internalGlobalAccess.deleteMany.mockResolvedValue({ count: 1 })
    mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([])

    const res = await revokeInternalAccess({ actorUserId: ACTOR, targetUserId: ACTOR, accessLevel: "super_admin" })
    expect(res.ok).toBe(true)
  })

  it("is idempotent when grant does not exist (no delete, no audit)", async () => {
    mocked.prisma.user.findUnique.mockResolvedValue({ id: TARGET, isInternal: true })
    mocked.prisma.internalGlobalAccess.findFirst.mockResolvedValue(null) // nothing to revoke
    mocked.prisma.internalGlobalAccess.findMany.mockResolvedValue([])

    const res = await revokeInternalAccess({ actorUserId: ACTOR, targetUserId: TARGET, accessLevel: "owner_view" })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.deleted).toBe(false)
    expect(mocked.prisma.internalGlobalAccess.deleteMany).not.toHaveBeenCalled()
    expect(mocked.logPlatformAction).not.toHaveBeenCalled()
  })
})
