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
    cashRegisterFormula: {
      findMany: vi.fn(),
    },
    cashRegisterField: {
      findMany: vi.fn(),
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

import { GET } from "../app/api/reports/cash-formulas/[resultKey]/route"

describe("GET /api/reports/cash-formulas/[resultKey]", () => {
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
    mocked.prisma.cashRegisterField.findMany.mockResolvedValue([
      {
        locationId: "loc_1",
        key: "deposit",
      },
    ])
  })

  it("returns formula chart and history for selected result key", async () => {
    mocked.prisma.cashRegisterFormula.findMany
      .mockResolvedValueOnce([
        {
          locationId: "loc_1",
          resultKey: "total_deposit",
          resultLabel: "Сумма депозитов",
          expression: "deposit",
          isTipsSource: false,
          displayOrder: 0,
          createdAt: new Date("2026-02-01"),
        },
      ])
      .mockResolvedValueOnce([
        {
          locationId: "loc_1",
          resultKey: "total_deposit",
          resultLabel: "Сумма депозитов",
          expression: "deposit",
          isTipsSource: false,
          displayOrder: 0,
          createdAt: new Date("2026-02-01"),
        },
      ])

    mocked.prisma.cashSession.findMany
      .mockResolvedValueOnce([
        {
          id: "session_1",
          workdayId: "workday_1",
          status: "closed",
          workday: { workDate: new Date("2026-02-18") },
          cashRegister: { name: "Main", locationId: "loc_1" },
          openedByEmployee: null,
          closedByEmployee: { user: { fullName: "Администратор" } },
          fieldValues: [
            {
              fieldKeySnapshot: "deposit",
              valueCents: 1000,
            },
          ],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "session_prev",
          workdayId: "workday_prev",
          status: "closed",
          workday: { workDate: new Date("2026-01-18") },
          cashRegister: { name: "Main", locationId: "loc_1" },
          openedByEmployee: null,
          closedByEmployee: { user: { fullName: "Администратор" } },
          fieldValues: [
            {
              fieldKeySnapshot: "deposit",
              valueCents: 500,
            },
          ],
        },
      ])

    const response = await GET(
      new Request(
        "http://localhost/api/reports/cash-formulas/total_deposit?dateFrom=2026-02-01&dateTo=2026-02-28",
      ),
      { params: Promise.resolve({ resultKey: "total_deposit" }) },
    )

    const body = (await response.json()) as {
      data?: {
        summary?: { totalValueCents?: number; previousTotalCents?: number; changePercent?: number | null }
        history?: Array<{ sessionId: string; valueCents: number; actorName: string | null }>
        chart?: { points?: Array<{ date: string; valueCents: number }> }
      }
    }

    expect(response.status).toBe(200)
    expect(body.data?.summary?.totalValueCents).toBe(1000)
    expect(body.data?.summary?.previousTotalCents).toBe(500)
    expect(body.data?.summary?.changePercent).toBe(100)

    expect(body.data?.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sessionId: "session_1", valueCents: 1000, actorName: "Администратор" }),
      ]),
    )

    expect(body.data?.chart?.points).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ date: "2026-02-18", valueCents: 1000 }),
      ]),
    )
  })
})
