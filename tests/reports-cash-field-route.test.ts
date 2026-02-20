import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => {
  const prisma = {
    workday: {
      findMany: vi.fn(),
    },
    cashSession: {
      findMany: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
    cashRegisterField: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  }

  return {
    prisma,
    getCashAuthContext: vi.fn(),
    syncCashSessionFromWorkdayProcedures: vi.fn(),
    syncWorkdayRevenueFromCashSessions: vi.fn(),
    syncWorkdayTipsFromCashSessions: vi.fn(),
  }
})

vi.mock("@/lib/prisma", () => ({
  prisma: mocked.prisma,
}))

vi.mock("@/lib/cash/access", () => ({
  getCashAuthContext: mocked.getCashAuthContext,
}))

vi.mock("@/lib/cash/session-sync", () => ({
  syncCashSessionFromWorkdayProcedures: mocked.syncCashSessionFromWorkdayProcedures,
}))

vi.mock("@/lib/cash/revenue-allocation", () => ({
  syncWorkdayRevenueFromCashSessions: mocked.syncWorkdayRevenueFromCashSessions,
}))

vi.mock("@/lib/cash/tips-sync", () => ({
  syncWorkdayTipsFromCashSessions: mocked.syncWorkdayTipsFromCashSessions,
}))

import { GET } from "../app/api/reports/cash-fields/[fieldKey]/route"

describe("GET /api/reports/cash-fields/[fieldKey]", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocked.getCashAuthContext.mockResolvedValue({
      ok: true,
      organizationId: "org_1",
      userId: "user_1",
      employeeId: "emp_1",
      isOwner: true,
      canManageCash: true,
    })

    mocked.prisma.workday.findMany.mockResolvedValue([])
    mocked.prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb({}))
    mocked.prisma.organization.findUnique.mockResolvedValue({ currency: "CZK" })
    mocked.prisma.cashRegisterField.findFirst.mockResolvedValue({
      label: "Выручка (нал)",
      isRevenueBasis: true,
    })
  })

  it("returns chart and history for selected cash field", async () => {
    mocked.prisma.cashSession.findMany
      .mockResolvedValueOnce([
        {
          id: "session_1",
          workdayId: "workday_1",
          status: "closed",
          workday: { workDate: new Date("2026-01-10") },
          cashRegister: { name: "Main", locationId: "loc_1" },
          openedByEmployee: null,
          closedByEmployee: { user: { fullName: "Иван" } },
          fieldValues: [
            {
              fieldLabelSnapshot: "Выручка (нал)",
              isRevenueBasisSnapshot: true,
              valueCents: 120000,
            },
          ],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "session_prev",
          workdayId: "workday_prev",
          status: "closed",
          workday: { workDate: new Date("2025-12-10") },
          cashRegister: { name: "Main", locationId: "loc_1" },
          openedByEmployee: null,
          closedByEmployee: { user: { fullName: "Иван" } },
          fieldValues: [
            {
              fieldLabelSnapshot: "Выручка (нал)",
              isRevenueBasisSnapshot: true,
              valueCents: 100000,
            },
          ],
        },
      ])

    const response = await GET(
      new Request("http://localhost/api/reports/cash-fields/cash_revenue?inputStage=close&dateFrom=2026-01-01&dateTo=2026-01-31"),
      { params: Promise.resolve({ fieldKey: "cash_revenue" }) },
    )

    const body = (await response.json()) as {
      data?: {
        summary?: { totalValueCents?: number; previousTotalCents?: number; changePercent?: number | null }
        history?: Array<{ sessionId: string; actorName: string | null }>
        chart?: { points?: Array<{ date: string; valueCents: number }> }
      }
    }

    expect(response.status).toBe(200)
    expect(body.data?.summary?.totalValueCents).toBe(120000)
    expect(body.data?.summary?.previousTotalCents).toBe(100000)
    expect(body.data?.summary?.changePercent).toBe(20)

    expect(body.data?.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sessionId: "session_1", actorName: "Иван" }),
      ]),
    )

    expect(body.data?.chart?.points).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ date: "2026-01-10", valueCents: 120000 }),
      ]),
    )
  })
})
