import { describe, expect, it } from "vitest"

import { formatShiftDateLine, formatShiftTimeRange, getShiftDateBadge } from "@/lib/utils/shift-display"

describe("shift display utils", () => {
  it("formats time range in organization timezone", () => {
    expect(formatShiftTimeRange("2026-03-05T08:00:00.000Z", "2026-03-05T16:30:00.000Z", "Europe/Prague")).toBe(
      "09:00 - 17:30",
    )
    expect(formatShiftTimeRange("2026-03-05T08:00:00.000Z", "2026-03-05T16:30:00.000Z", "UTC")).toBe("08:00 - 16:30")
  })

  it("uses timezone when building date labels", () => {
    expect(formatShiftDateLine("2026-03-05T23:30:00.000Z", "Europe/Prague")).toBe("Пт, 6 марта")
    expect(formatShiftDateLine("2026-03-05T23:30:00.000Z", "UTC")).toBe("Чт, 5 марта")
  })

  it("returns badge parts in organization timezone", () => {
    expect(getShiftDateBadge("2026-03-05T23:30:00.000Z", "Europe/Prague")).toEqual({
      day: "06",
      month: "март",
      weekday: "Пт",
    })
  })

  it("falls back safely for invalid input", () => {
    expect(formatShiftTimeRange("invalid", "2026-03-05T16:30:00.000Z", "Europe/Prague")).toBe("—")
    expect(formatShiftDateLine("invalid", "Europe/Prague")).toBe("Дата не указана")
    expect(getShiftDateBadge("invalid", "Europe/Prague")).toEqual({
      day: "--",
      month: "—",
      weekday: "—",
    })
  })
})
