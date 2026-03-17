import { describe, expect, it } from "vitest"

import {
  formatIntervalWorkedDuration,
  formatMinutesDuration,
  resolveIntervalWorkedMinutes,
} from "../lib/utils/interval-worked-duration"

describe("interval worked duration helpers", () => {
  it("formats minute values into compact russian labels", () => {
    expect(formatMinutesDuration(45)).toBe("45 мин")
    expect(formatMinutesDuration(60)).toBe("1 ч")
    expect(formatMinutesDuration(125)).toBe("2 ч 5 мин")
  })

  it("prefers stored calculated minutes when available", () => {
    expect(
      formatIntervalWorkedDuration({
        startAt: "2026-03-10T09:00:00.000Z",
        endAt: "2026-03-10T17:00:00.000Z",
        openedAt: "2026-03-10T09:03:00.000Z",
        closedAt: "2026-03-10T17:11:00.000Z",
        breakMinutes: 30,
        calculatedMinutesWorked: 420,
      }),
    ).toBe("7 ч")
  })

  it("computes actual worked minutes from time marks and break", () => {
    expect(
      resolveIntervalWorkedMinutes({
        startAt: "2026-03-10T09:00:00.000Z",
        endAt: "2026-03-10T17:00:00.000Z",
        openedAt: "2026-03-10T09:05:00.000Z",
        closedAt: "2026-03-10T17:10:00.000Z",
        breakMinutes: 30,
        timeEntry: {
          clockInAt: "2026-03-10T09:07:00.000Z",
          clockOutAt: "2026-03-10T17:12:00.000Z",
        },
      }),
    ).toBe(455)
  })

  it("returns null when interval timestamps are invalid", () => {
    expect(
      formatIntervalWorkedDuration({
        startAt: "invalid",
        endAt: "2026-03-10T17:00:00.000Z",
      }),
    ).toBeNull()
  })
})
