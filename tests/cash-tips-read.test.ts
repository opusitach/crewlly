import { describe, expect, it } from "vitest"
import { computeWorkdayTipsTotalsFromCashSessions } from "../lib/cash/tips-read"

describe("tips read fallback", () => {
  it("reads tips total from cash session values in cents", async () => {
    const db = {
      cashSession: {
        findMany: async () => [
          {
            workdayId: "wd_1",
            fieldValues: [
              { fieldKeySnapshot: "tips_total", valueCents: 12_345 },
            ],
          },
        ],
      },
      cashRegisterFormula: {
        findMany: async () => [
          {
            locationId: "loc_1",
            resultKey: "tips_result",
            resultLabel: "Чаевые",
            expression: "tips_total",
            isTipsSource: true,
            displayOrder: 0,
          },
        ],
      },
      cashRegisterField: {
        findMany: async () => [
          {
            locationId: "loc_1",
            key: "tips_total",
          },
        ],
      },
    } as any

    const tipsByWorkday = await computeWorkdayTipsTotalsFromCashSessions(db, [
      { workdayId: "wd_1", locationId: "loc_1" },
    ])

    expect(tipsByWorkday.get("wd_1")).toBe(12_345)
  })
})

