import { describe, expect, it } from "vitest"
import {
  buildPhoneValue,
  getPhoneValidationError,
  normalizePhone,
  splitPhoneNumber,
} from "@/lib/validation/phone"

describe("phone validation", () => {
  it("rejects phone numbers with letters", () => {
    expect(getPhoneValidationError("+420123ABC456")).toBe("Телефон может содержать только цифры")
  })

  it("allows empty phone values for optional fields", () => {
    expect(getPhoneValidationError("")).toBeNull()
    expect(getPhoneValidationError(null)).toBeNull()
  })

  it("normalizes phone format to digits with optional leading plus", () => {
    expect(normalizePhone("+420 123-456-789")).toBe("+420123456789")
    expect(normalizePhone("777 123 456")).toBe("777123456")
  })

  it("builds international phone value from country code and local part", () => {
    expect(buildPhoneValue("+420", "123 456 789")).toBe("+420123456789")
    expect(buildPhoneValue("+1", "")).toBe("")
  })

  it("splits international phone by detected country code", () => {
    const parsed = splitPhoneNumber("+420123456789")
    expect(parsed.country.iso2).toBe("CZ")
    expect(parsed.nationalNumber).toBe("123456789")
  })
})
