import { afterEach, describe, expect, it, vi } from "vitest"
import {
  auditActorFromSession,
  hashAuditIdentifier,
  isAuditLoggingEnabled,
  sanitizeAuditMetadata,
} from "@/lib/observability/audit"

describe("audit logger helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("enables audit logging by default in production", () => {
    expect(isAuditLoggingEnabled({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe(true)
  })

  it("respects explicit audit flag", () => {
    expect(
      isAuditLoggingEnabled({
        NODE_ENV: "production",
        AUDIT_LOG_ENABLED: "false",
      } as NodeJS.ProcessEnv),
    ).toBe(false)
  })

  it("redacts sensitive metadata fields", () => {
    const sanitized = sanitizeAuditMetadata({
      password: "secret",
      token: "123",
      nested: {
        authorization: "Bearer abc",
        safe: "ok",
      },
    })

    expect(sanitized).toEqual({
      password: "[REDACTED]",
      token: "[REDACTED]",
      nested: {
        authorization: "[REDACTED]",
        safe: "ok",
      },
    })
  })

  it("normalizes audit identifiers before hashing", () => {
    expect(hashAuditIdentifier(" Test@Example.com ")).toBe(hashAuditIdentifier("test@example.com"))
  })

  it("maps session context into a stable actor shape", () => {
    expect(
      auditActorFromSession({
        user: { id: "user-1", primaryMode: "owner" },
        organization: { id: "org-1" },
        membership: {
          legacyRole: "owner",
          accessRole: { key: "manager" },
        },
      }),
    ).toEqual({
      auth_state: "authenticated",
      user_id: "user-1",
      organization_id: "org-1",
      access_role: "manager",
      primary_mode: "owner",
    })
  })
})
