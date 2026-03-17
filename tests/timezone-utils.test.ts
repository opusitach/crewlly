import { describe, expect, it } from "vitest"

import { combineDateAndTimeInTimeZone, formatTimeValue } from "@/lib/utils/timezone"

describe("timezone utils", () => {
  it("formats the same ISO timestamp in the requested timezone", () => {
    expect(formatTimeValue("2026-03-17T19:48:00.000Z", "UTC")).toBe("19:48")
    expect(formatTimeValue("2026-03-17T19:48:00.000Z", "Europe/Prague")).toBe("20:48")
  })

  it("combines workday date and wall time in organization timezone", () => {
    expect(combineDateAndTimeInTimeZone("2026-03-19", "22:10", "Europe/Prague")?.toISOString()).toBe(
      "2026-03-19T21:10:00.000Z",
    )
    expect(
      combineDateAndTimeInTimeZone(new Date("2026-03-19T00:00:00.000Z"), "06:05", "Europe/Prague")?.toISOString(),
    ).toBe("2026-03-19T05:05:00.000Z")
  })
})
