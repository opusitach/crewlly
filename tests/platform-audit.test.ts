import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => {
  const prisma = { platformAuditLog: { create: vi.fn() } }
  return { prisma }
})

vi.mock("@/lib/prisma", () => ({ prisma: mocked.prisma }))

import { logPlatformAction, PLATFORM_ACTIONS } from "@/lib/observability/platform-audit"

beforeEach(() => vi.clearAllMocks())

describe("logPlatformAction", () => {
  it("writes a record with actor/target/action/metadata", async () => {
    mocked.prisma.platformAuditLog.create.mockResolvedValue({})
    await logPlatformAction({
      actorUserId: "a",
      targetUserId: "t",
      action: PLATFORM_ACTIONS.INTERNAL_ACCESS_GRANT,
      entityType: "internal_global_access",
      metadata: { accessLevel: "owner_view" },
    })
    expect(mocked.prisma.platformAuditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: "a",
        targetUserId: "t",
        action: PLATFORM_ACTIONS.INTERNAL_ACCESS_GRANT,
        entityType: "internal_global_access",
        entityId: null,
        metadata: { accessLevel: "owner_view" },
      },
    })
  })

  it("never throws when the write fails (logs server-side)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    mocked.prisma.platformAuditLog.create.mockRejectedValue(new Error("db down"))
    await expect(
      logPlatformAction({ actorUserId: "a", action: PLATFORM_ACTIONS.INTERNAL_ACCESS_REVOKE }),
    ).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it("strips secret-bearing keys from metadata", async () => {
    mocked.prisma.platformAuditLog.create.mockResolvedValue({})
    await logPlatformAction({
      actorUserId: "a",
      action: PLATFORM_ACTIONS.INTERNAL_ACCESS_GRANT,
      metadata: {
        accessLevel: "super_admin",
        password: "p",
        passwordHash: "h",
        token: "t",
        session_token: "s",
        secret: "x",
      },
    })
    const arg = mocked.prisma.platformAuditLog.create.mock.calls[0][0]
    expect(arg.data.metadata).toEqual({ accessLevel: "super_admin" })
  })
})
