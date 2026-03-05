import { describe, expect, it, vi } from "vitest"
import { getCloseCashSkipEligibility } from "../lib/cash/close-skip"

describe("close cash skip eligibility", () => {
  it("allows skip when another active cash employee remains in the workday", async () => {
    const db = {
      workInterval: {
        findMany: vi.fn().mockResolvedValue([
          { id: "interval-current", positionId: "position-1" },
          { id: "interval-next", positionId: "position-2" },
        ]),
      },
      workIntervalProcedure: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      ruleTemplate: {
        findMany: vi.fn().mockResolvedValue([
          { positionId: "position-1", type: "CASH", dayOfWeek: null },
          { positionId: "position-2", type: "CASH", dayOfWeek: null },
        ]),
      },
    }

    const result = await getCloseCashSkipEligibility(db as any, {
      intervalId: "interval-current",
      workdayId: "workday-1",
      workDate: new Date("2026-03-05T00:00:00.000Z"),
    })

    expect(result).toEqual({
      hasCloseCashRule: true,
      canSkip: true,
      remainingCashEmployees: 1,
      totalCashEmployees: 2,
      reason: null,
    })
  })

  it("uses weekday overrides and blocks skip for the last cash employee", async () => {
    const db = {
      workInterval: {
        findMany: vi.fn().mockResolvedValue([
          { id: "interval-current", positionId: "position-1" },
          { id: "interval-other", positionId: "position-2" },
        ]),
      },
      workIntervalProcedure: {
        findMany: vi.fn().mockResolvedValue([{ workIntervalId: "interval-current" }]),
      },
      ruleTemplate: {
        findMany: vi.fn().mockResolvedValue([
          { positionId: "position-2", type: "CASH", dayOfWeek: null },
          { positionId: "position-2", type: "INPUT", dayOfWeek: "THU" },
        ]),
      },
    }

    const result = await getCloseCashSkipEligibility(db as any, {
      intervalId: "interval-current",
      workdayId: "workday-1",
      workDate: new Date("2026-03-05T00:00:00.000Z"),
    })

    expect(result).toEqual({
      hasCloseCashRule: true,
      canSkip: false,
      remainingCashEmployees: 0,
      totalCashEmployees: 1,
      reason: "Вы последний сотрудник с кассой в этом рабочем дне. Закрытие кассы обязательно.",
    })
  })
})
