import { describe, expect, it } from "vitest"

import {
  TIME_VALUE_PATTERN,
  buildTimeValue,
  isTimeValue,
  normalizeTimeValue,
  splitTimeValue,
  stepTimeValue,
} from "@/lib/utils/time-utils"

describe("time utils", () => {
  it("accepts only 24-hour HH:mm values", () => {
    expect(isTimeValue("00:00")).toBe(true)
    expect(isTimeValue("23:59")).toBe(true)
    expect(TIME_VALUE_PATTERN.test("09:30")).toBe(true)
    expect(isTimeValue("12:00 PM")).toBe(false)
    expect(isTimeValue("24:00")).toBe(false)
    expect(isTimeValue("9:00")).toBe(false)
  })

  it("normalizes invalid values to a safe fallback", () => {
    expect(normalizeTimeValue("18:45")).toBe("18:45")
    expect(normalizeTimeValue("6:45", "09:00")).toBe("09:00")
    expect(normalizeTimeValue(undefined, "invalid")).toBe("00:00")
  })

  it("builds padded time values and splits them back", () => {
    expect(buildTimeValue(7, 5)).toBe("07:05")
    expect(buildTimeValue("26", "99")).toBe("23:59")
    expect(splitTimeValue("07:05")).toEqual({ hours: "07", minutes: "05" })
  })

  it("steps time across day boundaries", () => {
    expect(stepTimeValue("00:10", -15)).toBe("23:55")
    expect(stepTimeValue("23:30", 60)).toBe("00:30")
    expect(stepTimeValue("09:00", 15)).toBe("09:15")
  })
})
