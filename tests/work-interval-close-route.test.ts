import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
  }

  return {
    prisma,
    getAuthorizedInterval: vi.fn(),
    listCashRegisterFields: vi.fn(),
    findWorkdayCashSourceAnswer: vi.fn(),
    hasRequiredCashProcedureValues: vi.fn(),
    getMissingCashProcedurePhotoFieldKeys: vi.fn(),
    toEventActorName: vi.fn(),
    toEventDateLabel: vi.fn(),
    finalizeWorkIntervalClose: vi.fn(),
    isProceduresSchemaMissing: vi.fn(),
    getCloseCashSkipEligibility: vi.fn(),
  }
})

vi.mock("@/lib/prisma", () => ({
  prisma: mocked.prisma,
}))

vi.mock("@/lib/procedures/access", () => ({
  getAuthorizedInterval: mocked.getAuthorizedInterval,
}))

vi.mock("@/lib/cash/fields-query", () => ({
  listCashRegisterFields: mocked.listCashRegisterFields,
}))

vi.mock("@/lib/cash/workday-cash-source", () => ({
  findWorkdayCashSourceAnswer: mocked.findWorkdayCashSourceAnswer,
}))

vi.mock("@/lib/cash/procedure-values", () => ({
  hasRequiredCashProcedureValues: mocked.hasRequiredCashProcedureValues,
  getMissingCashProcedurePhotoFieldKeys: mocked.getMissingCashProcedurePhotoFieldKeys,
}))

vi.mock("@/lib/notifications/owner-events", () => ({
  toEventActorName: mocked.toEventActorName,
  toEventDateLabel: mocked.toEventDateLabel,
}))

vi.mock("@/lib/work-intervals/close", () => ({
  finalizeWorkIntervalClose: mocked.finalizeWorkIntervalClose,
  isProceduresSchemaMissing: mocked.isProceduresSchemaMissing,
}))

vi.mock("@/lib/cash/close-skip", () => ({
  getCloseCashSkipEligibility: mocked.getCloseCashSkipEligibility,
}))

import { POST } from "../app/api/work-intervals/[id]/close/route"

describe("POST /api/work-intervals/[id]/close", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.toEventActorName.mockReturnValue("Иван Петров")
    mocked.toEventDateLabel.mockReturnValue("05.03.2026")
    mocked.isProceduresSchemaMissing.mockReturnValue(false)
    mocked.listCashRegisterFields.mockResolvedValue([
      { key: "closing_cash", isRequired: true, isPhotoRequired: false },
    ])
    mocked.findWorkdayCashSourceAnswer.mockResolvedValue(null)
    mocked.hasRequiredCashProcedureValues.mockReturnValue(false)
    mocked.getMissingCashProcedurePhotoFieldKeys.mockReturnValue([])
    mocked.finalizeWorkIntervalClose.mockResolvedValue({
      interval: { id: "interval-1", status: "completed" },
      snapshot: null,
    })
    mocked.getAuthorizedInterval.mockResolvedValue({
      session: {
        user: { id: "user-1", fullName: "Иван Петров", email: "ivan@example.com" },
      },
      interval: {
        id: "interval-1",
        status: "in_progress",
        closedAt: null,
        workday: {
          id: "workday-1",
          locationId: "location-1",
          organizationId: "org-1",
          workDate: new Date("2026-03-05T00:00:00.000Z"),
        },
      },
      isOwner: false,
      error: null,
      status: 200,
    })
  })

  it("closes shift with skipCash when another cash employee remains", async () => {
    const tx = {
      workIntervalProcedure: {
        findUnique: vi.fn().mockResolvedValue({
          id: "procedure-close-1",
          rules: [
            {
              id: "rule-cash-1",
              type: "CASH",
              checklistItems: [],
            },
          ],
        }),
      },
      workIntervalProcedureAnswer: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }

    mocked.getCloseCashSkipEligibility.mockResolvedValue({
      hasCloseCashRule: true,
      canSkip: true,
      remainingCashEmployees: 1,
      totalCashEmployees: 2,
      reason: null,
    })
    mocked.prisma.$transaction.mockImplementation(async (callback: (trx: unknown) => Promise<unknown>) => callback(tx))

    const response = await POST(
      new Request("http://localhost/api/work-intervals/interval-1/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skipCash: true }),
      }),
      { params: Promise.resolve({ id: "interval-1" }) },
    )

    const body = (await response.json()) as { data?: { status: string } }

    expect(response.status).toBe(200)
    expect(mocked.getCloseCashSkipEligibility).toHaveBeenCalledWith(tx, {
      intervalId: "interval-1",
      workdayId: "workday-1",
      workDate: new Date("2026-03-05T00:00:00.000Z"),
    })
    expect(mocked.finalizeWorkIntervalClose).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        intervalId: "interval-1",
        workdayId: "workday-1",
        locationId: "location-1",
      }),
    )
    expect(body.data?.status).toBe("completed")
  })

  it("rejects skipCash for the last cash employee in the workday", async () => {
    const tx = {
      workIntervalProcedure: {
        findUnique: vi.fn().mockResolvedValue({
          id: "procedure-close-1",
          rules: [
            {
              id: "rule-cash-1",
              type: "CASH",
              checklistItems: [],
            },
          ],
        }),
      },
      workIntervalProcedureAnswer: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }

    mocked.getCloseCashSkipEligibility.mockResolvedValue({
      hasCloseCashRule: true,
      canSkip: false,
      remainingCashEmployees: 0,
      totalCashEmployees: 1,
      reason: "Вы последний сотрудник с кассой в этом рабочем дне. Закрытие кассы обязательно.",
    })
    mocked.prisma.$transaction.mockImplementation(async (callback: (trx: unknown) => Promise<unknown>) => callback(tx))

    const response = await POST(
      new Request("http://localhost/api/work-intervals/interval-1/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skipCash: true }),
      }),
      { params: Promise.resolve({ id: "interval-1" }) },
    )

    const body = (await response.json()) as { error?: string }

    expect(response.status).toBe(400)
    expect(body.error).toBe("Вы последний сотрудник с кассой в этом рабочем дне. Закрытие кассы обязательно.")
    expect(mocked.finalizeWorkIntervalClose).not.toHaveBeenCalled()
  })
})
