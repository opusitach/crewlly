import { beforeEach, describe, expect, it, vi } from "vitest"
import { syncCashSessionFromWorkdayProcedures } from "../lib/cash/session-sync"

const mocked = vi.hoisted(() => ({
  listCashRegisterFields: vi.fn(),
  findWorkdayCashSourceAnswers: vi.fn(),
}))

vi.mock("@/lib/cash/fields-query", () => ({
  listCashRegisterFields: mocked.listCashRegisterFields,
}))

vi.mock("@/lib/cash/workday-cash-source", () => ({
  findWorkdayCashSourceAnswers: mocked.findWorkdayCashSourceAnswers,
}))

describe("cash session sync from procedures", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("stores procedure cash values without extra x100 scaling", async () => {
    mocked.listCashRegisterFields.mockResolvedValue([
      {
        id: "f_opening",
        key: "opening_cash",
        label: "Открытие",
        inputStage: "open",
        isRequired: false,
        isRevenueBasis: false,
        displayOrder: 0,
      },
      {
        id: "f_tips",
        key: "tips_total",
        label: "Чаевые",
        inputStage: "close",
        isRequired: false,
        isRevenueBasis: false,
        displayOrder: 1,
      },
      {
        id: "f_closing",
        key: "closing_cash",
        label: "Закрытие",
        inputStage: "close",
        isRequired: false,
        isRevenueBasis: false,
        displayOrder: 2,
      },
    ])

    mocked.findWorkdayCashSourceAnswers.mockResolvedValue({
      OPEN: {
        workIntervalId: "wi_1",
        inputValue: "1000",
        createdAt: new Date("2026-02-20T09:00:00.000Z"),
        updatedAt: new Date("2026-02-20T09:00:00.000Z"),
      },
      CLOSE: {
        workIntervalId: "wi_1",
        inputValue: "5000|12000",
        createdAt: new Date("2026-02-20T17:00:00.000Z"),
        updatedAt: new Date("2026-02-20T17:00:00.000Z"),
      },
    })

    let createdFieldValues: Array<{ fieldKeySnapshot: string; valueCents: number; source: string }> = []
    let createdSessionData: Record<string, unknown> | null = null

    const tx = {
      cashRegister: {
        findFirst: async () => ({ id: "cash_reg_1" }),
      },
      workday: {
        findUnique: async () => ({ status: "draft" }),
      },
      workInterval: {
        findMany: async () => [
          {
            id: "wi_1",
            employeeId: "emp_1",
            status: "completed",
            openedAt: new Date("2026-02-20T09:00:00.000Z"),
            closedAt: new Date("2026-02-20T17:00:00.000Z"),
          },
        ],
      },
      cashSession: {
        findUnique: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createdSessionData = data
          return { id: "cash_session_1" }
        },
      },
      cashSessionFieldValue: {
        deleteMany: async () => ({ count: 0 }),
        createMany: async ({ data }: { data: Array<{ fieldKeySnapshot: string; valueCents: number; source: string }> }) => {
          createdFieldValues = data
          return { count: data.length }
        },
      },
    } as any

    const result = await syncCashSessionFromWorkdayProcedures(tx, {
      workdayId: "wd_1",
      locationId: "loc_1",
    })

    expect(result.ok).toBe(true)
    expect(result.skipped).toBe(false)

    expect(createdSessionData?.openingCashCents).toBe(1_000)
    expect(createdSessionData?.closingCashCents).toBe(12_000)

    const fieldValuesByKey = new Map(createdFieldValues.map((row) => [row.fieldKeySnapshot, row]))
    expect(fieldValuesByKey.get("opening_cash")?.valueCents).toBe(1_000)
    expect(fieldValuesByKey.get("tips_total")?.valueCents).toBe(5_000)
    expect(fieldValuesByKey.get("closing_cash")?.valueCents).toBe(12_000)
    expect(fieldValuesByKey.get("tips_total")?.source).toBe("procedure")
  })
})
