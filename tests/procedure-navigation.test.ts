import { describe, expect, it } from "vitest"
import { shouldRedirectToAppAfterProcedureAction } from "@/lib/procedures/navigation"

describe("shouldRedirectToAppAfterProcedureAction", () => {
  it("redirects employee to app after successful open", () => {
    expect(
      shouldRedirectToAppAfterProcedureAction({
        when: "OPEN",
        hasManagementAccess: false,
      }),
    ).toBe(true)
  })

  it("keeps owner or manager on page after successful open", () => {
    expect(
      shouldRedirectToAppAfterProcedureAction({
        when: "OPEN",
        hasManagementAccess: true,
      }),
    ).toBe(false)
  })

  it("redirects to app after successful close for any role", () => {
    expect(
      shouldRedirectToAppAfterProcedureAction({
        when: "CLOSE",
        hasManagementAccess: false,
      }),
    ).toBe(true)

    expect(
      shouldRedirectToAppAfterProcedureAction({
        when: "CLOSE",
        hasManagementAccess: true,
      }),
    ).toBe(true)
  })
})
