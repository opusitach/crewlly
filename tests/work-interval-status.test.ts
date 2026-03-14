import { describe, expect, it } from "vitest"
import {
  resolveEffectiveWorkIntervalClosedAt,
  resolveEffectiveWorkIntervalOpenedAt,
  resolveEffectiveWorkIntervalStatus,
} from "@/lib/work-intervals/status"

describe("work interval effective status", () => {
  it("treats a scheduled interval with clock-in as in_progress", () => {
    const interval = {
      status: "scheduled",
      openedAt: null,
      closedAt: null,
      conflictWithIntervalIds: [],
      timeEntry: {
        clockInAt: new Date("2026-03-04T09:00:00.000Z"),
        clockOutAt: null,
      },
    }

    expect(resolveEffectiveWorkIntervalStatus(interval)).toBe("in_progress")
    expect(resolveEffectiveWorkIntervalOpenedAt(interval)?.toISOString()).toBe("2026-03-04T09:00:00.000Z")
    expect(resolveEffectiveWorkIntervalClosedAt(interval)).toBeNull()
  })

  it("treats an in_progress interval with clock-out as completed", () => {
    const interval = {
      status: "in_progress",
      openedAt: new Date("2026-03-04T09:00:00.000Z"),
      closedAt: null,
      conflictWithIntervalIds: [],
      timeEntry: {
        clockInAt: new Date("2026-03-04T09:00:00.000Z"),
        clockOutAt: new Date("2026-03-04T17:00:00.000Z"),
      },
    }

    expect(resolveEffectiveWorkIntervalStatus(interval)).toBe("completed")
    expect(resolveEffectiveWorkIntervalClosedAt(interval)?.toISOString()).toBe("2026-03-04T17:00:00.000Z")
  })

  it("keeps canceled as terminal even if stale open timestamps exist", () => {
    const interval = {
      status: "canceled",
      openedAt: new Date("2026-03-04T09:00:00.000Z"),
      closedAt: null,
      conflictWithIntervalIds: [],
      timeEntry: {
        clockInAt: new Date("2026-03-04T09:00:00.000Z"),
        clockOutAt: null,
      },
    }

    expect(resolveEffectiveWorkIntervalStatus(interval)).toBe("canceled")
  })

  it("prioritizes runtime open state over conflict planning state", () => {
    const interval = {
      status: "conflict",
      openedAt: new Date("2026-03-04T09:00:00.000Z"),
      closedAt: null,
      conflictWithIntervalIds: ["interval-2"],
      timeEntry: null,
    }

    expect(resolveEffectiveWorkIntervalStatus(interval)).toBe("in_progress")
  })

  it("treats completed without close evidence but with open clock-in as in_progress", () => {
    const interval = {
      status: "completed",
      openedAt: null,
      closedAt: null,
      conflictWithIntervalIds: [],
      timeEntry: {
        clockInAt: new Date("2026-03-04T09:00:00.000Z"),
        clockOutAt: null,
      },
    }

    expect(resolveEffectiveWorkIntervalStatus(interval)).toBe("in_progress")
  })
})
