import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => {
  const tx = {
    employeeEarningAdjustment: {
      create: vi.fn(),
    },
    notification: {
      create: vi.fn(),
    },
  }

  const prisma = {
    employee: {
      findFirst: vi.fn(),
    },
    employeeEarningAdjustment: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  }

  return {
    prisma,
    tx,
    getSessionUserWithOrg: vi.fn(),
    hasOrganizationActionAccess: vi.fn(),
    auditActorFromSession: vi.fn(() => ({ user_id: "user_1" })),
    logAuditEvent: vi.fn(),
  }
})

vi.mock("@/lib/prisma", () => ({
  prisma: mocked.prisma,
}))

vi.mock("@/lib/auth", () => ({
  getSessionUserWithOrg: mocked.getSessionUserWithOrg,
  hasOrganizationActionAccess: mocked.hasOrganizationActionAccess,
}))

vi.mock("@/lib/observability/audit", () => ({
  auditActorFromSession: mocked.auditActorFromSession,
  logAuditEvent: mocked.logAuditEvent,
}))

import { POST } from "../app/api/employees/[id]/earnings/adjustments/route"

describe("POST /api/employees/[id]/earnings/adjustments", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocked.getSessionUserWithOrg.mockResolvedValue({
      user: { id: "user_1" },
      organization: { id: "org_1", currency: "CZK" },
      membership: { isActive: true, legacyRole: "owner" },
    })
    mocked.hasOrganizationActionAccess.mockResolvedValue(true)
    mocked.prisma.employee.findFirst.mockResolvedValue({
      id: "employee_1",
      userId: "worker_user_1",
    })
    mocked.tx.employeeEarningAdjustment.create.mockResolvedValue({
      id: "adjustment_1",
      adjustmentType: "bonus",
      amountCents: 45000,
      comment: "За инициативу",
      createdAt: new Date("2026-03-15T12:00:00.000Z"),
    })
    mocked.tx.notification.create.mockResolvedValue({ id: "notification_1" })
    mocked.prisma.$transaction.mockImplementation(async (callback: (tx: typeof mocked.tx) => Promise<unknown>) =>
      callback(mocked.tx),
    )
  })

  it("creates bonus adjustment and sends employee notification", async () => {
    const response = await POST(
      new Request("http://localhost/api/employees/employee_1/earnings/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adjustmentType: "bonus",
          amount: 450,
          comment: "За инициативу",
          effectiveDate: "2026-03-15",
          periodFrom: "2026-03-01",
          periodTo: "2026-03-15",
        }),
      }),
      { params: Promise.resolve({ id: "employee_1" }) },
    )
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(mocked.tx.employeeEarningAdjustment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org_1",
          employeeId: "employee_1",
          createdByUserId: "user_1",
          adjustmentType: "bonus",
          amountCents: 45000,
          comment: "За инициативу",
        }),
      }),
    )

    const effectiveDate = mocked.tx.employeeEarningAdjustment.create.mock.calls[0][0].data.effectiveDate as Date
    expect(effectiveDate.toISOString().slice(0, 10)).toBe("2026-03-15")

    expect(mocked.tx.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org_1",
          userId: "worker_user_1",
          type: "system",
          title: "Начислен бонус",
          message: expect.stringContaining("Комментарий: За инициативу"),
          payload: expect.objectContaining({
            view: "worker_money",
            fromDate: "2026-03-01",
            toDate: "2026-03-15",
            adjustmentType: "bonus",
            effectiveDate: "2026-03-15",
            amountCents: 45000,
          }),
          status: "unread",
        }),
      }),
    )
    expect(body.data).toEqual(
      expect.objectContaining({
        id: "adjustment_1",
        adjustmentType: "bonus",
        amountCents: 45000,
        comment: "За инициативу",
        effectiveDate: "2026-03-15",
      }),
    )
  })

  it("rejects request without payroll manage access", async () => {
    mocked.hasOrganizationActionAccess.mockResolvedValue(false)

    const response = await POST(
      new Request("http://localhost/api/employees/employee_1/earnings/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adjustmentType: "penalty",
          amount: 100,
          comment: "За опоздание",
          effectiveDate: "2026-03-15",
        }),
      }),
      { params: Promise.resolve({ id: "employee_1" }) },
    )
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toBe("Недостаточно прав для управления начислениями")
    expect(mocked.prisma.employee.findFirst).not.toHaveBeenCalled()
  })

  it("returns a clear error when adjustment storage is not available yet", async () => {
    mocked.prisma.$transaction.mockRejectedValue(new Error('The table `public.employee_earning_adjustment` does not exist'))

    const response = await POST(
      new Request("http://localhost/api/employees/employee_1/earnings/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adjustmentType: "bonus",
          amount: 300,
          comment: "За помощь команде",
          effectiveDate: "2026-03-15",
        }),
      }),
      { params: Promise.resolve({ id: "employee_1" }) },
    )
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.error).toBe("Бонусы и штрафы временно недоступны, пока база данных не обновлена")
  })

  it("returns a clear error when prisma client is not generated yet", async () => {
    const previousDelegate = mocked.prisma.employeeEarningAdjustment
    // Simulate a running container with stale generated Prisma Client.
    ;(mocked.prisma as { employeeEarningAdjustment?: unknown }).employeeEarningAdjustment = undefined

    const response = await POST(
      new Request("http://localhost/api/employees/employee_1/earnings/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adjustmentType: "bonus",
          amount: 300,
          comment: "За помощь команде",
          effectiveDate: "2026-03-15",
        }),
      }),
      { params: Promise.resolve({ id: "employee_1" }) },
    )
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.error).toBe("Бонусы и штрафы временно недоступны, пока Prisma Client не обновлен")

    ;(mocked.prisma as { employeeEarningAdjustment?: unknown }).employeeEarningAdjustment = previousDelegate
  })
})
