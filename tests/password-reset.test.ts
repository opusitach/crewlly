import { beforeEach, describe, expect, it, vi } from "vitest"
import { createHmac } from "node:crypto"

const cryptoMock = vi.hoisted(() => ({
  randomInt: vi.fn(),
  randomUUID: vi.fn(),
}))

const mocked = vi.hoisted(() => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    pendingPasswordReset: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  hashPassword: vi.fn(),
  sendEmail: vi.fn(),
}))

vi.mock("node:crypto", async () => {
  const actual = await vi.importActual<typeof import("node:crypto")>("node:crypto")

  return {
    ...actual,
    randomInt: cryptoMock.randomInt,
    randomUUID: cryptoMock.randomUUID,
  }
})

vi.mock("server-only", () => ({}))

vi.mock("@/lib/prisma", () => ({
  prisma: mocked.prisma,
}))

vi.mock("@/lib/auth", () => ({
  hashPassword: mocked.hashPassword,
}))

vi.mock("@/lib/email/mailer", () => ({
  sendEmail: mocked.sendEmail,
}))

import {
  confirmPasswordReset,
  startPasswordReset,
  verifyPasswordReset,
} from "@/lib/auth/password-reset"

describe("password reset flow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-22T12:00:00.000Z"))
    process.env.EMAIL_VERIFICATION_SECRET = "test-email-verification-secret"

    cryptoMock.randomInt.mockReturnValue(123456)
    cryptoMock.randomUUID.mockReturnValue("reset-token-123")
    mocked.hashPassword.mockResolvedValue("hashed-new-password")
    mocked.sendEmail.mockResolvedValue(undefined)
  })

  it("starts password reset and sends a code", async () => {
    mocked.prisma.user.findUnique.mockResolvedValue({
      email: "user@example.com",
      fullName: "Иван Петров",
      status: "active",
    })
    mocked.prisma.pendingPasswordReset.findUnique.mockResolvedValue(null)
    mocked.prisma.pendingPasswordReset.upsert.mockResolvedValue({
      email: "user@example.com",
    })

    const result = await startPasswordReset("user@example.com")

    expect(mocked.prisma.pendingPasswordReset.upsert).toHaveBeenCalledWith({
      where: { email: "user@example.com" },
      create: expect.objectContaining({
        email: "user@example.com",
        verificationCodeHash: expect.any(String),
        verificationAttempts: 0,
        resendCount: 0,
        resetTokenHash: null,
      }),
      update: expect.objectContaining({
        verificationCodeHash: expect.any(String),
        verificationAttempts: 0,
        resendCount: 0,
        resetTokenHash: null,
      }),
    })
    expect(mocked.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@example.com",
        subject: expect.stringContaining("восстановления пароля"),
        html: expect.stringContaining("123456"),
        text: expect.stringContaining("123456"),
      }),
    )
    expect(result.email).toBe("user@example.com")
    expect(result.expiresAt.toISOString()).toBe("2026-03-22T12:10:00.000Z")
    expect(result.resendAvailableAt.toISOString()).toBe("2026-03-22T12:01:00.000Z")
  })

  it("rejects password reset for unknown email", async () => {
    mocked.prisma.user.findUnique.mockResolvedValue(null)

    await expect(startPasswordReset("missing@example.com")).rejects.toMatchObject({
      code: "PASSWORD_RESET_EMAIL_NOT_FOUND",
      status: 404,
      message: "Такой почты не существует, попробуйте снова.",
    })

    expect(mocked.prisma.pendingPasswordReset.findUnique).not.toHaveBeenCalled()
    expect(mocked.prisma.pendingPasswordReset.upsert).not.toHaveBeenCalled()
    expect(mocked.sendEmail).not.toHaveBeenCalled()
  })

  it("verifies reset code and returns a reset token", async () => {
    mocked.prisma.pendingPasswordReset.findUnique.mockResolvedValue({
      email: "user@example.com",
      verificationCodeHash: createHmac("sha256", "test-email-verification-secret")
        .update("password-reset:user@example.com:123456")
        .digest("hex"),
      verificationCodeExpiresAt: new Date("2026-03-22T12:10:00.000Z"),
      verificationAttempts: 0,
      resendCount: 0,
      lastSentAt: new Date("2026-03-22T12:00:00.000Z"),
      resetTokenHash: null,
      resetTokenExpiresAt: null,
      verifiedAt: null,
    })
    mocked.prisma.user.findUnique.mockResolvedValue({
      status: "active",
    })
    mocked.prisma.pendingPasswordReset.update.mockResolvedValue(undefined)

    const result = await verifyPasswordReset("user@example.com", "123456")

    expect(mocked.prisma.pendingPasswordReset.update).toHaveBeenCalledWith({
      where: { email: "user@example.com" },
      data: expect.objectContaining({
        verificationCodeExpiresAt: expect.any(Date),
        resetTokenHash: expect.any(String),
        resetTokenExpiresAt: expect.any(Date),
        verifiedAt: expect.any(Date),
      }),
    })
    expect(result).toEqual({
      email: "user@example.com",
      resetToken: "reset-token-123",
      resetTokenExpiresAt: new Date("2026-03-22T12:15:00.000Z"),
    })
  })

  it("updates password, deletes sessions, and removes pending reset on confirm", async () => {
    mocked.prisma.pendingPasswordReset.findUnique.mockResolvedValue({
      email: "user@example.com",
      resetTokenHash: createHmac("sha256", "test-email-verification-secret")
        .update("password-reset:user@example.com:reset-token-123")
        .digest("hex"),
      resetTokenExpiresAt: new Date("2026-03-22T12:15:00.000Z"),
    })

    const tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "user_1",
          status: "active",
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
      session: {
        deleteMany: vi.fn().mockResolvedValue(undefined),
      },
      pendingPasswordReset: {
        delete: vi.fn().mockResolvedValue(undefined),
      },
    }

    mocked.prisma.$transaction.mockImplementation(async (callback: (input: typeof tx) => Promise<unknown>) => callback(tx))

    await confirmPasswordReset("user@example.com", "reset-token-123", "NewPass123!")

    expect(mocked.hashPassword).toHaveBeenCalledWith("NewPass123!")
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { email: "user@example.com" },
      data: {
        passwordHash: "hashed-new-password",
      },
    })
    expect(tx.session.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
      },
    })
    expect(tx.pendingPasswordReset.delete).toHaveBeenCalledWith({
      where: { email: "user@example.com" },
    })
  })
})
