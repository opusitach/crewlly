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
    location: {
      findMany: vi.fn(),
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
    resolveOrganizationLocationId: vi.fn(),
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
  resolveOrganizationLocationId: mocked.resolveOrganizationLocationId,
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

import { GET } from "../app/api/reports/cash-summary/route"

describe("GET /api/reports/cash-summary", () => {
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
    mocked.resolveOrganizationLocationId.mockImplementation(async (_organizationId: string, requestedLocationId?: string | null) => {
      if (!requestedLocationId) {
        return { ok: false, error: "Локация не найдена", status: 404 }
      }
      return { ok: true, locationId: requestedLocationId }
    })

    mocked.prisma.workday.findMany.mockResolvedValue([])
    mocked.prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb({}))
    mocked.prisma.organization.findUnique.mockResolvedValue({ currency: "CZK" })
  })

  it("shows newly configured cash fields and formulas in summary", async () => {
    mocked.prisma.cashSession.findMany.mockResolvedValue([
      {
        id: "session_1",
        workdayId: "workday_1",
        cashRegister: { locationId: "loc_1" },
        fieldValues: [
          {
            fieldKeySnapshot: "cash_revenue",
            fieldLabelSnapshot: "Выручка (нал)",
            inputStage: "close",
            valueCents: 100000,
            isRevenueBasisSnapshot: true,
          },
        ],
      },
    ])

    mocked.prisma.location.findMany.mockResolvedValue([{ id: "loc_1", name: "Main" }])
    mocked.prisma.cashRegisterField.findMany.mockResolvedValue([
      {
        locationId: "loc_1",
        key: "cash_revenue",
        label: "Выручка (нал)",
        inputStage: "close",
        isRevenueBasis: true,
      },
      {
        locationId: "loc_1",
        key: "delivery",
        label: "Доставка",
        inputStage: "close",
        isRevenueBasis: false,
      },
    ])

    mocked.prisma.cashRegisterFormula.findMany.mockResolvedValue([
      {
        locationId: "loc_1",
        resultKey: "net",
        resultLabel: "Чистая касса",
        expression: "cash_revenue - delivery",
        isTipsSource: false,
        isRevenueSource: true,
        displayOrder: 0,
        createdAt: new Date("2026-01-01"),
      },
    ])

    const response = await GET(new Request("http://localhost/api/reports/cash-summary?dateFrom=2026-01-01&dateTo=2026-01-31"))
    const body = (await response.json()) as {
      data?: {
        summary?: {
          revenueTotalCents?: number
          cashFields?: Array<{ fieldKey: string; totalValueCents: number; entriesCount: number; isRevenueBasis?: boolean }>
          formulas?: Array<{
            resultKey: string
            totalValueCents: number
            entriesCount: number
            isRevenueSource?: boolean
          }>
        }
      }
    }

    expect(response.status).toBe(200)
    expect(body.data?.summary?.revenueTotalCents).toBe(100000)

    const cashFields = body.data?.summary?.cashFields ?? []
    const formulas = body.data?.summary?.formulas ?? []

    expect(cashFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldKey: "cash_revenue", totalValueCents: 100000, entriesCount: 1, isRevenueBasis: true }),
        expect.objectContaining({ fieldKey: "delivery", totalValueCents: 0, entriesCount: 0 }),
      ]),
    )

    expect(formulas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resultKey: "net", totalValueCents: 100000, entriesCount: 1, isRevenueSource: true }),
      ]),
    )
  })

  it("computes revenueTotalCents per session with formula-source priority and field fallback across locations", async () => {
    mocked.prisma.cashSession.findMany.mockResolvedValue([
      {
        id: "session_1",
        workdayId: "workday_1",
        cashRegister: { locationId: "loc_formula" },
        fieldValues: [
          {
            fieldKeySnapshot: "cash_revenue",
            fieldLabelSnapshot: "Нал",
            inputStage: "close",
            valueCents: 100000,
            isRevenueBasisSnapshot: false,
          },
          {
            fieldKeySnapshot: "delivery",
            fieldLabelSnapshot: "Доставка",
            inputStage: "close",
            valueCents: 10000,
            isRevenueBasisSnapshot: false,
          },
        ],
      },
      {
        id: "session_2",
        workdayId: "workday_2",
        cashRegister: { locationId: "loc_field" },
        fieldValues: [
          {
            fieldKeySnapshot: "gross",
            fieldLabelSnapshot: "Выручка",
            inputStage: "close",
            valueCents: 50000,
            isRevenueBasisSnapshot: true,
          },
        ],
      },
    ])

    mocked.prisma.location.findMany.mockResolvedValue([
      { id: "loc_formula", name: "Formula loc" },
      { id: "loc_field", name: "Field loc" },
    ])

    mocked.prisma.cashRegisterField.findMany.mockResolvedValue([
      {
        locationId: "loc_formula",
        key: "cash_revenue",
        label: "Нал",
        inputStage: "close",
        isRevenueBasis: false,
      },
      {
        locationId: "loc_formula",
        key: "delivery",
        label: "Доставка",
        inputStage: "close",
        isRevenueBasis: false,
      },
      {
        locationId: "loc_field",
        key: "gross",
        label: "Выручка",
        inputStage: "close",
        isRevenueBasis: true,
      },
    ])

    mocked.prisma.cashRegisterFormula.findMany.mockResolvedValue([
      {
        locationId: "loc_formula",
        resultKey: "net",
        resultLabel: "Чистая выручка",
        expression: "cash_revenue - delivery",
        isTipsSource: false,
        isRevenueSource: true,
        displayOrder: 0,
        createdAt: new Date("2026-01-01"),
      },
      {
        locationId: "loc_field",
        resultKey: "service",
        resultLabel: "Сервис",
        expression: "gross - 10%",
        isTipsSource: false,
        isRevenueSource: false,
        displayOrder: 0,
        createdAt: new Date("2026-01-02"),
      },
    ])

    const response = await GET(new Request("http://localhost/api/reports/cash-summary?dateFrom=2026-01-01&dateTo=2026-01-31"))
    const body = (await response.json()) as {
      data?: {
        summary?: {
          revenueTotalCents?: number
          formulas?: Array<{ resultKey: string; totalValueCents: number; isRevenueSource?: boolean }>
          cashFields?: Array<{ fieldKey: string; totalValueCents: number; isRevenueBasis?: boolean }>
        }
      }
    }

    expect(response.status).toBe(200)
    expect(body.data?.summary?.revenueTotalCents).toBe(140000)

    expect(body.data?.summary?.formulas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resultKey: "net",
          totalValueCents: 90000,
          isRevenueSource: true,
        }),
      ]),
    )

    expect(body.data?.summary?.cashFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldKey: "gross",
          totalValueCents: 50000,
          isRevenueBasis: true,
        }),
      ]),
    )
  })
})
