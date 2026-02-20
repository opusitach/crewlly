import { describe, expect, it } from "vitest"
import { computeEmployeeTipsByWorkdayForEarnings } from "../lib/cash/earnings-tips"

describe("earnings tips aggregation", () => {
  it("uses cash session formula values and splits equally when location uses equal", async () => {
    const db = {
      workInterval: {
        findMany: async () => [
          {
            workdayId: "wd_1",
            employeeId: "emp_1",
            startAt: new Date("2026-02-20T10:00:00.000Z"),
            endAt: new Date("2026-02-20T18:00:00.000Z"),
            openedAt: null,
            closedAt: null,
            breakMinutes: 0,
            timeEntry: null,
          },
          {
            workdayId: "wd_1",
            employeeId: "emp_2",
            startAt: new Date("2026-02-20T10:00:00.000Z"),
            endAt: new Date("2026-02-20T18:00:00.000Z"),
            openedAt: null,
            closedAt: null,
            breakMinutes: 0,
            timeEntry: null,
          },
        ],
      },
      tipsPool: {
        findMany: async () => [
          { workdayId: "wd_1", totalAmountCents: 0, splitMethod: "equal" },
        ],
      },
      location: {
        findMany: async () => [{ id: "loc_1", tipsSplitMethod: "equal" }],
      },
      cashSession: {
        findMany: async () => [
          {
            workdayId: "wd_1",
            fieldValues: [{ fieldKeySnapshot: "tips_total", valueCents: 17_600 }],
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
        findMany: async () => [{ locationId: "loc_1", key: "tips_total" }],
      },
    } as any

    const map = await computeEmployeeTipsByWorkdayForEarnings(db, {
      employeeId: "emp_1",
      targets: [{ workdayId: "wd_1", locationId: "loc_1" }],
    })

    expect(map.get("wd_1")).toBe(8_800)
  })

  it("uses by_hours split from tips pool snapshot", async () => {
    const db = {
      workInterval: {
        findMany: async () => [
          {
            workdayId: "wd_2",
            employeeId: "emp_1",
            startAt: new Date("2026-02-21T10:00:00.000Z"),
            endAt: new Date("2026-02-21T16:00:00.000Z"),
            openedAt: null,
            closedAt: null,
            breakMinutes: 0,
            timeEntry: null,
          },
          {
            workdayId: "wd_2",
            employeeId: "emp_2",
            startAt: new Date("2026-02-21T10:00:00.000Z"),
            endAt: new Date("2026-02-21T12:00:00.000Z"),
            openedAt: null,
            closedAt: null,
            breakMinutes: 0,
            timeEntry: null,
          },
        ],
      },
      tipsPool: {
        findMany: async () => [
          { workdayId: "wd_2", totalAmountCents: 0, splitMethod: "by_hours" },
        ],
      },
      location: {
        findMany: async () => [{ id: "loc_1", tipsSplitMethod: "equal" }],
      },
      cashSession: {
        findMany: async () => [
          {
            workdayId: "wd_2",
            fieldValues: [{ fieldKeySnapshot: "tips_total", valueCents: 8_000 }],
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
        findMany: async () => [{ locationId: "loc_1", key: "tips_total" }],
      },
    } as any

    const map = await computeEmployeeTipsByWorkdayForEarnings(db, {
      employeeId: "emp_1",
      targets: [{ workdayId: "wd_2", locationId: "loc_1" }],
    })

    expect(map.get("wd_2")).toBe(6_000)
  })

  it("does not fallback to stale tips pool when closed cash sessions exist", async () => {
    const db = {
      workInterval: {
        findMany: async () => [
          {
            workdayId: "wd_3",
            employeeId: "emp_1",
            startAt: new Date("2026-02-22T10:00:00.000Z"),
            endAt: new Date("2026-02-22T18:00:00.000Z"),
            openedAt: null,
            closedAt: null,
            breakMinutes: 0,
            timeEntry: {
              clockInAt: new Date("2026-02-22T10:00:00.000Z"),
              clockOutAt: new Date("2026-02-22T18:00:00.000Z"),
            },
          },
        ],
      },
      tipsPool: {
        findMany: async () => [
          { workdayId: "wd_3", totalAmountCents: -864_710, splitMethod: "equal" },
        ],
      },
      location: {
        findMany: async () => [{ id: "loc_1", tipsSplitMethod: "equal" }],
      },
      cashSession: {
        findMany: async () => [
          {
            workdayId: "wd_3",
            fieldValues: [{ fieldKeySnapshot: "tips_total", valueCents: 17_600 }],
          },
        ],
      },
      cashRegisterFormula: {
        findMany: async () => [],
      },
      cashRegisterField: {
        findMany: async () => [],
      },
    } as any

    const map = await computeEmployeeTipsByWorkdayForEarnings(db, {
      employeeId: "emp_1",
      targets: [{ workdayId: "wd_3", locationId: "loc_1" }],
    })

    expect(map.get("wd_3")).toBe(0)
  })

  it("uses tips pool fallback only for days without closed cash sessions", async () => {
    const db = {
      workInterval: {
        findMany: async () => [
          {
            workdayId: "wd_4",
            employeeId: "emp_1",
            startAt: new Date("2026-02-23T10:00:00.000Z"),
            endAt: new Date("2026-02-23T16:00:00.000Z"),
            openedAt: null,
            closedAt: null,
            breakMinutes: 0,
            timeEntry: {
              clockInAt: new Date("2026-02-23T10:00:00.000Z"),
              clockOutAt: new Date("2026-02-23T16:00:00.000Z"),
            },
          },
          {
            workdayId: "wd_4",
            employeeId: "emp_2",
            startAt: new Date("2026-02-23T10:00:00.000Z"),
            endAt: new Date("2026-02-23T16:00:00.000Z"),
            openedAt: null,
            closedAt: null,
            breakMinutes: 0,
            timeEntry: {
              clockInAt: new Date("2026-02-23T10:00:00.000Z"),
              clockOutAt: new Date("2026-02-23T16:00:00.000Z"),
            },
          },
        ],
      },
      tipsPool: {
        findMany: async () => [
          { workdayId: "wd_4", totalAmountCents: 3_000, splitMethod: "equal" },
        ],
      },
      location: {
        findMany: async () => [{ id: "loc_1", tipsSplitMethod: "equal" }],
      },
      cashSession: {
        findMany: async () => [],
      },
      cashRegisterFormula: {
        findMany: async () => [],
      },
      cashRegisterField: {
        findMany: async () => [],
      },
    } as any

    const map = await computeEmployeeTipsByWorkdayForEarnings(db, {
      employeeId: "emp_1",
      targets: [{ workdayId: "wd_4", locationId: "loc_1" }],
    })

    expect(map.get("wd_4")).toBe(1_500)
  })

  it("queries only worked intervals for earnings math", async () => {
    let whereArg: unknown = null

    const db = {
      workInterval: {
        findMany: async (args: unknown) => {
          whereArg = (args as { where?: unknown })?.where ?? null
          return []
        },
      },
      tipsPool: {
        findMany: async () => [],
      },
      location: {
        findMany: async () => [{ id: "loc_1", tipsSplitMethod: "equal" }],
      },
      cashSession: {
        findMany: async () => [],
      },
      cashRegisterFormula: {
        findMany: async () => [],
      },
      cashRegisterField: {
        findMany: async () => [],
      },
    } as any

    await computeEmployeeTipsByWorkdayForEarnings(db, {
      employeeId: "emp_1",
      targets: [{ workdayId: "wd_5", locationId: "loc_1" }],
    })

    const where = whereArg as {
      workdayId?: { in?: string[] }
      OR?: Array<{ status?: unknown; timeEntry?: unknown }>
    }

    expect(where.workdayId?.in).toEqual(["wd_5"])
    expect(where.OR?.[0]).toEqual({ status: "completed" })
    expect(where.OR?.[1]).toEqual({
      status: { notIn: ["canceled", "conflict"] },
      timeEntry: { is: { clockOutAt: { not: null } } },
    })
  })
})
