import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
  }

  return {
    prisma,
    getAuthorizedInterval: vi.fn(),
    recomputeEmployeeConflictStatuses: vi.fn(),
    notifyOrganizationOwners: vi.fn(),
    toEventActorName: vi.fn(),
    toEventDateLabel: vi.fn(),
  }
})

vi.mock("@/lib/prisma", () => ({
  prisma: mocked.prisma,
}))

vi.mock("@/lib/procedures/access", () => ({
  getAuthorizedInterval: mocked.getAuthorizedInterval,
}))

vi.mock("@/lib/work-interval-conflicts", () => ({
  recomputeEmployeeConflictStatuses: mocked.recomputeEmployeeConflictStatuses,
}))

vi.mock("@/lib/notifications/owner-events", () => ({
  notifyOrganizationOwners: mocked.notifyOrganizationOwners,
  toEventActorName: mocked.toEventActorName,
  toEventDateLabel: mocked.toEventDateLabel,
}))

import { POST } from "../app/api/work-intervals/[id]/cancel/route"

describe("POST /api/work-intervals/[id]/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.toEventActorName.mockReturnValue("Иван Петров")
    mocked.toEventDateLabel.mockReturnValue("19.02.2026")
  })

  it("sends owner notification with cancel reason", async () => {
    mocked.getAuthorizedInterval.mockResolvedValue({
      session: {
        user: { id: "worker_1", fullName: "Иван Петров", email: "worker@example.com" },
        organization: { id: "org_1" },
      },
      interval: {
        id: "11111111-1111-4111-8111-111111111111",
        status: "scheduled",
        employeeId: "employee_1",
        closedAt: null,
        workday: {
          organizationId: "org_1",
          workDate: new Date("2026-02-19T00:00:00.000Z"),
        },
      },
      error: null,
      status: 200,
    })

    const tx = {
      workInterval: {
        update: vi.fn().mockResolvedValue({
          id: "11111111-1111-4111-8111-111111111111",
          status: "canceled",
          cancelReason: "Заболел, не смогу выйти",
        }),
      },
    }

    mocked.prisma.$transaction.mockImplementation(async (callback: (trx: unknown) => Promise<unknown>) => callback(tx))

    const response = await POST(
      new Request("http://localhost/api/work-intervals/11111111-1111-4111-8111-111111111111/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "  Заболел, не смогу выйти  " }),
      }),
      { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) },
    )

    const body = (await response.json()) as { data?: { status: string; cancelReason: string } }

    expect(response.status).toBe(200)
    expect(tx.workInterval.update).toHaveBeenCalledWith({
      where: { id: "11111111-1111-4111-8111-111111111111" },
      data: expect.objectContaining({
        status: "canceled",
        cancelReason: "Заболел, не смогу выйти",
      }),
    })
    expect(mocked.recomputeEmployeeConflictStatuses).toHaveBeenCalledWith(tx, {
      organizationId: "org_1",
      employeeId: "employee_1",
    })
    expect(mocked.notifyOrganizationOwners).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        organizationId: "org_1",
        type: "shift",
        title: "Отменена рабочая смена",
        message: "Иван Петров отменил(а) рабочую смену (19.02.2026). Причина: Заболел, не смогу выйти",
      }),
    )
    expect(body.data).toEqual(
      expect.objectContaining({
        status: "canceled",
        cancelReason: "Заболел, не смогу выйти",
      }),
    )
  })

  it("allows manager to cancel a scheduled shift", async () => {
    mocked.toEventActorName.mockReturnValue("Мария Смирнова")
    mocked.toEventDateLabel.mockReturnValue("08.03.2026")

    mocked.getAuthorizedInterval.mockResolvedValue({
      session: {
        user: { id: "manager_1", fullName: "Мария Смирнова", email: "manager@example.com" },
        organization: { id: "org_1" },
      },
      interval: {
        id: "22222222-2222-4222-8222-222222222222",
        status: "scheduled",
        employeeId: "employee_2",
        closedAt: null,
        workday: {
          organizationId: "org_1",
          workDate: new Date("2026-03-08T00:00:00.000Z"),
        },
      },
      hasManagementAccess: true,
      error: null,
      status: 200,
    })

    const tx = {
      workInterval: {
        update: vi.fn().mockResolvedValue({
          id: "22222222-2222-4222-8222-222222222222",
          status: "canceled",
          cancelReason: "Нужна замена по семейным обстоятельствам",
        }),
      },
    }

    mocked.prisma.$transaction.mockImplementation(async (callback: (trx: unknown) => Promise<unknown>) => callback(tx))

    const response = await POST(
      new Request("http://localhost/api/work-intervals/22222222-2222-4222-8222-222222222222/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Нужна замена по семейным обстоятельствам" }),
      }),
      { params: Promise.resolve({ id: "22222222-2222-4222-8222-222222222222" }) },
    )

    const body = (await response.json()) as { data?: { status: string; cancelReason: string } }

    expect(response.status).toBe(200)
    expect(tx.workInterval.update).toHaveBeenCalledWith({
      where: { id: "22222222-2222-4222-8222-222222222222" },
      data: expect.objectContaining({
        status: "canceled",
        cancelReason: "Нужна замена по семейным обстоятельствам",
      }),
    })
    expect(mocked.notifyOrganizationOwners).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        message: "Мария Смирнова отменил(а) рабочую смену (08.03.2026). Причина: Нужна замена по семейным обстоятельствам",
      }),
    )
    expect(body.data).toEqual(
      expect.objectContaining({
        status: "canceled",
        cancelReason: "Нужна замена по семейным обстоятельствам",
      }),
    )
  })
})
