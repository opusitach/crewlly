import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => ({
  confirmPasswordReset: vi.fn(),
  hashAuditIdentifier: vi.fn(),
  logAuditEvent: vi.fn(),
}))

vi.mock("@/lib/auth/password-reset", () => ({
  PasswordResetError: class PasswordResetError extends Error {
    status: number
    code: string

    constructor(message: string, options: { status: number; code: string }) {
      super(message)
      this.status = options.status
      this.code = options.code
    }
  },
  confirmPasswordReset: mocked.confirmPasswordReset,
}))

vi.mock("@/lib/observability/audit", () => ({
  hashAuditIdentifier: mocked.hashAuditIdentifier,
  logAuditEvent: mocked.logAuditEvent,
}))

import { POST } from "@/app/api/auth/password-reset/confirm/route"

describe("POST /api/auth/password-reset/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.hashAuditIdentifier.mockReturnValue("hash-email")
  })

  it("accepts a valid password reset confirmation payload", async () => {
    mocked.confirmPasswordReset.mockResolvedValue(undefined)

    const response = await POST(
      new Request("http://localhost/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "user@example.com",
          resetToken: "reset-token-123",
          password: "NewPass123!",
        }),
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ success: true })
    expect(mocked.confirmPasswordReset).toHaveBeenCalledWith("user@example.com", "reset-token-123", "NewPass123!")
  })

  it("returns validation errors for weak passwords", async () => {
    const response = await POST(
      new Request("http://localhost/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "user@example.com",
          resetToken: "reset-token-123",
          password: "weak",
        }),
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBeDefined()
    expect(mocked.confirmPasswordReset).not.toHaveBeenCalled()
  })
})
