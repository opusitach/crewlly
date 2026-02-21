import { describe, expect, it } from "vitest"
import { resolveSessionCookieSecure } from "@/lib/session-cookie"

describe("resolveSessionCookieSecure", () => {
  it("uses explicit COOKIE_SECURE=true", () => {
    const value = resolveSessionCookieSecure({ NODE_ENV: "development", COOKIE_SECURE: "true" })
    expect(value).toBe(true)
  })

  it("uses explicit COOKIE_SECURE=false even in production", () => {
    const value = resolveSessionCookieSecure({ NODE_ENV: "production", COOKIE_SECURE: "false" })
    expect(value).toBe(false)
  })

  it("defaults to secure in production when COOKIE_SECURE is not set", () => {
    const value = resolveSessionCookieSecure({ NODE_ENV: "production" })
    expect(value).toBe(true)
  })

  it("defaults to non-secure outside production when COOKIE_SECURE is not set", () => {
    const value = resolveSessionCookieSecure({ NODE_ENV: "development" })
    expect(value).toBe(false)
  })
})
