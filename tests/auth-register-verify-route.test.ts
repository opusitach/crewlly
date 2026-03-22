import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => ({
  verifyPendingRegistration: vi.fn(),
  createSession: vi.fn(),
  hashAuditIdentifier: vi.fn(),
  logAuditEvent: vi.fn(),
}))

vi.mock("@/lib/auth/pending-registration", () => ({
  PendingRegistrationError: class PendingRegistrationError extends Error {
    status: number
    code: string

    constructor(message: string, options: { status: number; code: string }) {
      super(message)
      this.status = options.status
      this.code = options.code
    }
  },
  verifyPendingRegistration: mocked.verifyPendingRegistration,
}))

vi.mock("@/lib/auth", () => ({
  createSession: mocked.createSession,
}))

vi.mock("@/lib/observability/audit", () => ({
  hashAuditIdentifier: mocked.hashAuditIdentifier,
  logAuditEvent: mocked.logAuditEvent,
}))

import { POST } from "@/app/api/auth/register/verify/route"

describe("POST /api/auth/register/verify", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.hashAuditIdentifier.mockReturnValue("hash-email")
  })

  it("creates a session cookie after successful email verification", async () => {
    mocked.verifyPendingRegistration.mockResolvedValue({
      id: "user_1",
      fullName: "Иван Петров",
      email: "user@example.com",
      status: "active",
      primaryMode: null,
      onboardingReady: false,
      emailVerifiedAt: new Date("2026-03-22T10:00:00.000Z"),
    })
    mocked.createSession.mockResolvedValue({
      cookie: {
        name: "session_token",
        value: "session_123",
        options: {
          httpOnly: true,
          sameSite: "lax",
          secure: false,
          path: "/",
          expires: new Date("2026-04-21T10:00:00.000Z"),
        },
      },
    })

    const response = await POST(
      new Request("http://localhost/api/auth/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "user@example.com",
          code: "123456",
        }),
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocked.verifyPendingRegistration).toHaveBeenCalledWith("user@example.com", "123456")
    expect(mocked.createSession).toHaveBeenCalledWith("user_1")
    expect(response.headers.get("set-cookie")).toContain("session_token=session_123")
    expect(body.user.emailVerifiedAt).toBe("2026-03-22T10:00:00.000Z")
  })

  it("returns validation errors for malformed payloads", async () => {
    const response = await POST(
      new Request("http://localhost/api/auth/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "wrong",
          code: "12",
        }),
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBeDefined()
    expect(mocked.verifyPendingRegistration).not.toHaveBeenCalled()
    expect(mocked.createSession).not.toHaveBeenCalled()
  })
})
