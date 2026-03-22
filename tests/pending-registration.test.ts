import { beforeEach, describe, expect, it, vi } from "vitest"

const cryptoMock = vi.hoisted(() => ({
  randomInt: vi.fn(),
}))

const mocked = vi.hoisted(() => ({
  prisma: {
    pendingRegistration: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
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
  resendPendingRegistration,
  startPendingRegistration,
  verifyPendingRegistration,
} from "@/lib/auth/pending-registration"
import { createHmac } from "node:crypto"

describe("pending registration flow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-22T10:00:00.000Z"))
    process.env.EMAIL_VERIFICATION_SECRET = "test-email-verification-secret"

    cryptoMock.randomInt.mockReturnValue(123456)
    mocked.hashPassword.mockResolvedValue("hashed-password")
    mocked.sendEmail.mockResolvedValue(undefined)
  })

  it("starts pending registration and sends a verification email", async () => {
    mocked.prisma.pendingRegistration.upsert.mockResolvedValue({
      email: "user@example.com",
    })

    const result = await startPendingRegistration({
      fullName: "Иван Петров",
      email: "user@example.com",
      phone: "+420123456789",
      password: "StrongPass123!",
    })

    expect(mocked.hashPassword).toHaveBeenCalledWith("StrongPass123!")
    expect(mocked.prisma.pendingRegistration.upsert).toHaveBeenCalledWith({
      where: { email: "user@example.com" },
      create: expect.objectContaining({
        email: "user@example.com",
        fullName: "Иван Петров",
        phone: "+420123456789",
        passwordHash: "hashed-password",
        verificationCodeHash: expect.any(String),
        verificationAttempts: 0,
        resendCount: 0,
      }),
      update: expect.objectContaining({
        fullName: "Иван Петров",
        phone: "+420123456789",
        passwordHash: "hashed-password",
        verificationCodeHash: expect.any(String),
      }),
    })
    expect(mocked.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@example.com",
        subject: expect.stringContaining("Код подтверждения"),
        html: expect.stringContaining("123456"),
        text: expect.stringContaining("123456"),
      }),
    )
    expect(result.email).toBe("user@example.com")
    expect(result.expiresAt.toISOString()).toBe("2026-03-22T10:10:00.000Z")
    expect(result.resendAvailableAt.toISOString()).toBe("2026-03-22T10:01:00.000Z")
  })

  it("enforces resend cooldown for pending registrations", async () => {
    mocked.prisma.pendingRegistration.findUnique.mockResolvedValue({
      email: "user@example.com",
      fullName: "Иван Петров",
      lastSentAt: new Date("2026-03-22T09:59:30.000Z"),
      resendCount: 0,
    })

    await expect(resendPendingRegistration("user@example.com")).rejects.toMatchObject({
      code: "PENDING_REGISTRATION_RESEND_COOLDOWN",
      status: 429,
    })

    expect(mocked.prisma.pendingRegistration.update).not.toHaveBeenCalled()
    expect(mocked.sendEmail).not.toHaveBeenCalled()
  })

  it("increments attempts when verification code is invalid", async () => {
    mocked.prisma.pendingRegistration.findUnique.mockResolvedValue({
      email: "user@example.com",
      fullName: "Иван Петров",
      phone: null,
      passwordHash: "hashed-password",
      verificationCodeHash: createHmac("sha256", "test-email-verification-secret")
        .update("user@example.com:123456")
        .digest("hex"),
      verificationCodeExpiresAt: new Date("2026-03-22T10:10:00.000Z"),
      verificationAttempts: 0,
      resendCount: 0,
      lastSentAt: new Date("2026-03-22T10:00:00.000Z"),
    })

    await expect(verifyPendingRegistration("user@example.com", "000000")).rejects.toMatchObject({
      code: "PENDING_REGISTRATION_INVALID_CODE",
      status: 400,
    })

    expect(mocked.prisma.pendingRegistration.update).toHaveBeenCalledWith({
      where: { email: "user@example.com" },
      data: {
        verificationAttempts: {
          increment: 1,
        },
      },
    })
  })

  it("creates a verified user and removes pending registration when code is valid", async () => {
    mocked.prisma.pendingRegistration.findUnique.mockResolvedValue({
      email: "user@example.com",
      fullName: "Иван Петров",
      phone: "+420123456789",
      passwordHash: "hashed-password",
      verificationCodeHash: createHmac("sha256", "test-email-verification-secret")
        .update("user@example.com:123456")
        .digest("hex"),
      verificationCodeExpiresAt: new Date("2026-03-22T10:10:00.000Z"),
      verificationAttempts: 0,
      resendCount: 0,
      lastSentAt: new Date("2026-03-22T10:00:00.000Z"),
    })

    const tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "user_1",
          email: "user@example.com",
          emailVerifiedAt: new Date("2026-03-22T10:00:00.000Z"),
          fullName: "Иван Петров",
          phone: "+420123456789",
          status: "active",
          primaryMode: null,
          onboardingReady: false,
        }),
      },
      pendingRegistration: {
        delete: vi.fn().mockResolvedValue(undefined),
      },
    }

    mocked.prisma.$transaction.mockImplementation(async (callback: (input: typeof tx) => Promise<unknown>) => callback(tx))

    const result = await verifyPendingRegistration("user@example.com", "123456")

    expect(tx.user.findUnique).toHaveBeenCalledWith({ where: { email: "user@example.com" } })
    expect(tx.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "user@example.com",
        emailVerifiedAt: expect.any(Date),
        fullName: "Иван Петров",
        phone: "+420123456789",
        passwordHash: "hashed-password",
      }),
    })
    expect(tx.pendingRegistration.delete).toHaveBeenCalledWith({
      where: { email: "user@example.com" },
    })
    expect(result).toEqual(
      expect.objectContaining({
        id: "user_1",
        email: "user@example.com",
      }),
    )
  })
})
