import { describe, expect, it } from "vitest"
import { syncWorkdayTipsFromCashSessions } from "../lib/cash/tips-sync"

describe("tips sync for cash sessions", () => {
  it("does not multiply cash session formula result by 100 twice", async () => {
    const tx = {
      workday: {
        findUnique: async () => ({ id: "wd_1", status: "draft" }),
      },
      location: {
        findUnique: async () => ({ tipsSplitMethod: "equal" }),
      },
      cashRegisterFormula: {
        findMany: async () => [
          {
            resultKey: "tips_total",
            resultLabel: "Чаевые",
            expression: "tips_total",
            isTipsSource: true,
            displayOrder: 0,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        ],
      },
      cashRegisterField: {
        findMany: async () => [
          {
            key: "tips_total",
            inputStage: "close",
          },
        ],
      },
      cashSession: {
        findMany: async () => [
          {
            fieldValues: [
              {
                fieldKeySnapshot: "tips_total",
                valueCents: 12_345,
              },
            ],
          },
        ],
      },
      tipsPool: {
        upsert: async () => ({ id: "pool_1" }),
      },
      workInterval: {
        findMany: async () => [
          {
            employeeId: "emp_1",
            startAt: new Date("2026-02-20T09:00:00.000Z"),
            endAt: new Date("2026-02-20T17:00:00.000Z"),
            openedAt: null,
            closedAt: null,
            breakMinutes: 0,
            timeEntry: null,
          },
        ],
      },
      tipAllocation: {
        deleteMany: async () => ({ count: 0 }),
        createMany: async () => ({ count: 1 }),
      },
    } as any

    const result = await syncWorkdayTipsFromCashSessions(tx, {
      workdayId: "wd_1",
      locationId: "loc_1",
    })

    expect(result.frozen).toBe(false)
    expect(result.totalAmountCents).toBe(12_345)
    expect(result.allocationsCount).toBe(1)
  })
})
