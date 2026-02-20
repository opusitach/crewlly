import { describe, expect, it, vi } from "vitest"
import { findWorkdayCashSourceAnswer, findWorkdayCashSourceAnswers } from "../lib/cash/workday-cash-source"

const buildDbMock = (rows: Array<Record<string, unknown>>) =>
  ({
    workIntervalProcedureAnswer: {
      findMany: vi.fn().mockResolvedValue(rows),
    },
  }) as any

describe("workday cash source", () => {
  it("selects first cash answer per stage", async () => {
    const db = buildDbMock([
      {
        id: "a1",
        workIntervalId: "interval-1",
        when: "OPEN",
        inputValue: "   ",
        cashPhotosJson: null,
        createdAt: new Date("2026-01-01T08:00:00.000Z"),
        updatedAt: new Date("2026-01-01T08:00:00.000Z"),
      },
      {
        id: "a2",
        workIntervalId: "interval-2",
        when: "OPEN",
        inputValue: "1200",
        cashPhotosJson: null,
        createdAt: new Date("2026-01-01T08:05:00.000Z"),
        updatedAt: new Date("2026-01-01T08:05:00.000Z"),
      },
      {
        id: "a3",
        workIntervalId: "interval-3",
        when: "OPEN",
        inputValue: "1500",
        cashPhotosJson: null,
        createdAt: new Date("2026-01-01T08:10:00.000Z"),
        updatedAt: new Date("2026-01-01T08:10:00.000Z"),
      },
      {
        id: "a4",
        workIntervalId: "interval-4",
        when: "CLOSE",
        inputValue: "2000|3000",
        cashPhotosJson: null,
        createdAt: new Date("2026-01-01T21:00:00.000Z"),
        updatedAt: new Date("2026-01-01T21:00:00.000Z"),
      },
    ])

    const result = await findWorkdayCashSourceAnswers(db, { workdayId: "workday-1" })

    expect(result.OPEN?.answerId).toBe("a1")
    expect(result.OPEN?.workIntervalId).toBe("interval-1")
    expect(result.OPEN?.inputValue).toBe("")
    expect(result.CLOSE?.answerId).toBe("a4")
    expect(db.workIntervalProcedureAnswer.findMany).toHaveBeenCalledTimes(1)
  })

  it("returns only requested stage in single-stage lookup", async () => {
    const db = buildDbMock([
      {
        id: "c1",
        workIntervalId: "interval-1",
        when: "CLOSE",
        inputValue: "5000",
        cashPhotosJson: null,
        createdAt: new Date("2026-01-01T21:00:00.000Z"),
        updatedAt: new Date("2026-01-01T21:00:00.000Z"),
      },
    ])

    const result = await findWorkdayCashSourceAnswer(db, {
      workdayId: "workday-1",
      when: "CLOSE",
    })

    expect(result?.answerId).toBe("c1")
    expect(db.workIntervalProcedureAnswer.findMany).toHaveBeenCalledTimes(1)
    expect(db.workIntervalProcedureAnswer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          when: { in: ["CLOSE"] },
        }),
      }),
    )
  })
})
