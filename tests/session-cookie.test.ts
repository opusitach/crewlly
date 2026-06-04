import { describe, expect, it } from "vitest"
import {
  resolveSessionCookieDomain,
  resolveSessionCookieSecure,
} from "@/lib/session-cookie"

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

describe("resolveSessionCookieDomain", () => {
  it("returns undefined when SESSION_COOKIE_DOMAIN is unset (host-only cookie)", () => {
    expect(resolveSessionCookieDomain({})).toBeUndefined()
  })

  it("returns undefined when SESSION_COOKIE_DOMAIN is blank", () => {
    expect(resolveSessionCookieDomain({ SESSION_COOKIE_DOMAIN: "   " })).toBeUndefined()
  })

  it("returns the configured parent domain for cross-subdomain sharing", () => {
    expect(resolveSessionCookieDomain({ SESSION_COOKIE_DOMAIN: ".crewlly.com" })).toBe(
      ".crewlly.com",
    )
  })

  it("trims surrounding whitespace", () => {
    expect(resolveSessionCookieDomain({ SESSION_COOKIE_DOMAIN: "  .crewlly.com  " })).toBe(
      ".crewlly.com",
    )
  })
})
