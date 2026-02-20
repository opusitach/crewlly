import { describe, expect, it } from "vitest"
import { DEFAULT_TIMEZONE, isValidTimeZone, timezoneSchema } from "@/lib/validation/timezone"

describe("timezone validation", () => {
  it("accepts valid IANA timezones", () => {
    expect(isValidTimeZone("Europe/Prague")).toBe(true)
    expect(isValidTimeZone("UTC")).toBe(true)
  })

  it("rejects invalid timezones", () => {
    expect(isValidTimeZone("Prague")).toBe(false)
    expect(isValidTimeZone("UTC+1")).toBe(false)
    expect(isValidTimeZone("Invalid/Zone")).toBe(false)
  })

  it("schema enforces IANA format", () => {
    expect(timezoneSchema.safeParse(DEFAULT_TIMEZONE).success).toBe(true)
    expect(timezoneSchema.safeParse("GMT+1").success).toBe(false)
  })
})
