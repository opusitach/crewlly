import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => {
  const prisma = {
    internalAuditLog: {
      create: vi.fn(),
    },
    organizationMember: {
      findFirst: vi.fn(),
    },
  }

  return { prisma }
})

vi.mock("@/lib/prisma", () => ({
  prisma: mocked.prisma,
}))

import { logInternalAction, INTERNAL_ACTIONS } from "../lib/observability/internal-audit"
import type { OrganizationAccessContext } from "../lib/organization-access"

const ORG_ID = "00000000-0000-0000-0000-000000000001"
const INTERNAL_USER_ID = "00000000-0000-0000-0000-000000000002"
const REGULAR_USER_ID = "00000000-0000-0000-0000-000000000003"

function makeInternalAccess(level: "owner_view" | "employee_view"): OrganizationAccessContext {
  return {
    user: { id: INTERNAL_USER_ID, fullName: "Internal Admin", email: "internal@crewlly.com" },
    organizationId: ORG_ID,
    organization: { id: ORG_ID, name: "Test Venue", timezone: "Europe/Prague", currency: "CZK" },
    isInternalAccess: true,
    internalAccessLevel: level,
    membership: null,
    effectiveRoleKey: "owner",
    permissions: [],
  } as unknown as OrganizationAccessContext
}

function makeRegularAccess(): OrganizationAccessContext {
  return {
    user: { id: REGULAR_USER_ID, fullName: "Venue Owner", email: "owner@venue.cz" },
    organizationId: ORG_ID,
    organization: { id: ORG_ID, name: "Test Venue", timezone: "Europe/Prague", currency: "CZK" },
    isInternalAccess: false,
    internalAccessLevel: null,
    membership: { legacyRole: "owner", accessRole: { id: "role-1", key: "owner", name: "Владелец" } },
    effectiveRoleKey: "owner",
    permissions: [],
  } as unknown as OrganizationAccessContext
}

describe("logInternalAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.prisma.internalAuditLog.create.mockResolvedValue({ id: "log-1" })
  })

  it("is a no-op for regular users (isInternalAccess = false)", async () => {
    await logInternalAction(makeRegularAccess(), {
      action: INTERNAL_ACTIONS.POSITION_CREATE,
      entityType: "position",
      entityId: "pos-1",
    })

    expect(mocked.prisma.internalAuditLog.create).not.toHaveBeenCalled()
  })

  it("writes a log record for internal owner_view access", async () => {
    const access = makeInternalAccess("owner_view")

    await logInternalAction(access, {
      action: INTERNAL_ACTIONS.POSITION_UPDATE,
      entityType: "position",
      entityId: "pos-1",
      metadata: { changedFields: ["name"] },
    })

    expect(mocked.prisma.internalAuditLog.create).toHaveBeenCalledOnce()
    expect(mocked.prisma.internalAuditLog.create).toHaveBeenCalledWith({
      data: {
        internalUserId: INTERNAL_USER_ID,
        organizationId: ORG_ID,
        accessLevel: "owner_view",
        action: "position.update",
        entityType: "position",
        entityId: "pos-1",
        metadata: { changedFields: ["name"] },
      },
    })
  })

  it("writes a log record for internal employee_view access", async () => {
    const access = makeInternalAccess("employee_view")

    await logInternalAction(access, {
      action: INTERNAL_ACTIONS.WORK_INTERVAL_OPEN,
      entityType: "work_interval",
      entityId: "wi-1",
    })

    expect(mocked.prisma.internalAuditLog.create).toHaveBeenCalledOnce()
    const call = mocked.prisma.internalAuditLog.create.mock.calls[0][0]
    expect(call.data.accessLevel).toBe("employee_view")
    expect(call.data.action).toBe("work_interval.open")
  })

  it("stores metadata correctly in the log record", async () => {
    const access = makeInternalAccess("owner_view")

    await logInternalAction(access, {
      action: INTERNAL_ACTIONS.PAYROLL_RUN_CREATE,
      entityType: "payroll_run",
      entityId: "run-1",
      metadata: { periodStart: "2026-01-01", periodEnd: "2026-01-31" },
    })

    const call = mocked.prisma.internalAuditLog.create.mock.calls[0][0]
    expect(call.data.metadata).toEqual({ periodStart: "2026-01-01", periodEnd: "2026-01-31" })
    expect(call.data.entityId).toBe("run-1")
  })

  it("is a no-op when internalAccessLevel is null even if isInternalAccess is true", async () => {
    const access = {
      ...makeInternalAccess("owner_view"),
      internalAccessLevel: null,
    } as unknown as OrganizationAccessContext

    await logInternalAction(access, {
      action: INTERNAL_ACTIONS.POSITION_DELETE,
      entityType: "position",
      entityId: "pos-1",
    })

    expect(mocked.prisma.internalAuditLog.create).not.toHaveBeenCalled()
  })

  it("never throws even if the DB write fails", async () => {
    mocked.prisma.internalAuditLog.create.mockRejectedValue(new Error("DB connection lost"))
    const access = makeInternalAccess("owner_view")

    await expect(
      logInternalAction(access, {
        action: INTERNAL_ACTIONS.CASH_SESSION_CLOSE,
        entityType: "cash_session",
        entityId: "cs-1",
      }),
    ).resolves.toBeUndefined()
  })

  it("internal user has no OrganizationMember — membership is null in the access context", () => {
    const access = makeInternalAccess("owner_view")
    expect(access.membership).toBeNull()
    expect(access.isInternalAccess).toBe(true)
  })

  it("regular owner has membership and does not write audit log", async () => {
    const access = makeRegularAccess()
    expect(access.membership).not.toBeNull()
    expect(access.isInternalAccess).toBe(false)

    await logInternalAction(access, {
      action: INTERNAL_ACTIONS.EMPLOYEE_CREATE,
      entityType: "employee",
      entityId: "emp-1",
    })

    expect(mocked.prisma.internalAuditLog.create).not.toHaveBeenCalled()
  })
})
