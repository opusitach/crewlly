import { describe, expect, it } from "vitest"
import {
  PASSWORD_POLICY_REGEX,
  getPasswordRequirementChecks,
  getPasswordValidationError,
  isStrongPassword,
} from "@/lib/validation/password"

describe("password validation", () => {
  it("accepts passwords that match the requested regex", () => {
    const password = "Crewlly1!"

    expect(PASSWORD_POLICY_REGEX.test(password)).toBe(true)
    expect(isStrongPassword(password)).toBe(true)
    expect(getPasswordValidationError(password)).toBeNull()
  })

  it("rejects passwords without an uppercase letter", () => {
    expect(isStrongPassword("crewlly1!")).toBe(false)
    expect(getPasswordValidationError("crewlly1!")).toContain("заглавную букву")
  })

  it("rejects passwords with spaces or invalid length", () => {
    expect(isStrongPassword("Crew 1!")).toBe(false)
    expect(isStrongPassword(`Crewlly1!${"a".repeat(60)}`)).toBe(false)
  })

  it("reports live requirement states for the registration UI", () => {
    const requirementState = new Map(
      getPasswordRequirementChecks("Crewlly 1").map((requirement) => [requirement.id, requirement.met]),
    )

    expect(requirementState.get("length")).toBe(true)
    expect(requirementState.get("uppercase")).toBe(true)
    expect(requirementState.get("digit")).toBe(true)
    expect(requirementState.get("special")).toBe(false)
    expect(requirementState.get("noWhitespace")).toBe(false)
  })
})
