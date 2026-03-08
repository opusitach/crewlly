import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
  }

  return {
    prisma,
    getSessionUserWithOrg: vi.fn(),
    isOwnerRole: vi.fn(),
    ensureDefaultRolesAndPermissions: vi.fn(),
  }
})

vi.mock("@/lib/prisma", () => ({
  prisma: mocked.prisma,
}))

vi.mock("@/lib/auth", () => ({
  getSessionUserWithOrg: mocked.getSessionUserWithOrg,
  isOwnerRole: mocked.isOwnerRole,
}))

vi.mock("@/lib/rbac/default-role-permissions", () => ({
  ensureDefaultRolesAndPermissions: mocked.ensureDefaultRolesAndPermissions,
}))

import { PUT as PUT_MANAGER } from "../app/api/employees/[id]/manager/route"

const OWNER_ID = "11111111-1111-4111-8111-111111111111"
const ORG_ID = "22222222-2222-4222-8222-222222222222"
const EMPLOYEE_ID = "33333333-3333-4333-8333-333333333333"
const EMPLOYEE_USER_ID = "44444444-4444-4444-8444-444444444444"

describe("employee manager route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.getSessionUserWithOrg.mockResolvedValue({
      user: { id: OWNER_ID },
      organization: { id: ORG_ID },
      membership: { role: "owner" },
    })
    mocked.isOwnerRole.mockReturnValue(true)
  })

  it("promotes an employee to manager inside the current organization", async () => {
    const tx = {
      employee: {
        findFirst: vi.fn().mockResolvedValue({
          id: EMPLOYEE_ID,
          userId: EMPLOYEE_USER_ID,
        }),
      },
      position: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ sortOrder: 3 }),
        create: vi.fn().mockResolvedValue({
          id: "position_manager",
        }),
        update: vi.fn(),
      },
      employeePosition: {
        count: vi.fn().mockResolvedValue(1),
        upsert: vi.fn().mockResolvedValue({
          id: "emp_pos_1",
        }),
      },
      organizationMember: {
        findUnique: vi.fn().mockResolvedValue({
          id: "member_1",
          isActive: true,
          legacyRole: "worker",
          accessRole: { key: "worker", name: "Сотрудник" },
        }),
        update: vi.fn().mockResolvedValue({
          id: "member_1",
        }),
      },
    }

    mocked.prisma.$transaction.mockImplementation(async (callback: (db: typeof tx) => Promise<unknown>) => callback(tx))
    mocked.ensureDefaultRolesAndPermissions.mockResolvedValue({
      managerRole: { id: "role_manager", name: "Менеджер" },
    })

    const response = await PUT_MANAGER(
      new Request(`http://localhost/api/employees/${EMPLOYEE_ID}/manager`, { method: "PUT" }),
      { params: { id: EMPLOYEE_ID } },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocked.ensureDefaultRolesAndPermissions).toHaveBeenCalledWith(tx, ORG_ID)
    expect(tx.position.create).toHaveBeenCalledWith({
      data: {
        organizationId: ORG_ID,
        name: "Менеджер",
        sortOrder: 4,
      },
      select: {
        id: true,
      },
    })
    expect(tx.employeePosition.upsert).toHaveBeenCalledWith({
      where: {
        employeeId_positionId: {
          employeeId: EMPLOYEE_ID,
          positionId: "position_manager",
        },
      },
      create: {
        employeeId: EMPLOYEE_ID,
        positionId: "position_manager",
        isPrimary: false,
      },
      update: {},
    })
    expect(tx.organizationMember.update).toHaveBeenCalledWith({
      where: { id: "member_1" },
      data: {
        accessRoleId: "role_manager",
        legacyRole: "manager",
      },
    })
    expect(body.data).toEqual({
      employeeId: EMPLOYEE_ID,
      accessRoleKey: "manager",
      accessRoleName: "Менеджер",
      isManager: true,
      managerPositionId: "position_manager",
    })
  })

  it("rejects promotion when requester is not an owner", async () => {
    mocked.isOwnerRole.mockReturnValue(false)

    const response = await PUT_MANAGER(
      new Request(`http://localhost/api/employees/${EMPLOYEE_ID}/manager`, { method: "PUT" }),
      { params: { id: EMPLOYEE_ID } },
    )
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toBe("Только владелец может назначать менеджера")
    expect(mocked.prisma.$transaction).not.toHaveBeenCalled()
  })
})
