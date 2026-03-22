import "server-only"

import { prisma } from "@/lib/prisma"
import { hashPassword } from "@/lib/auth"
import { sendEmail } from "@/lib/email/mailer"
import { buildRegistrationVerificationEmail } from "@/lib/email/templates/auth-verification"
import {
  EMAIL_CHALLENGE_CODE_LENGTH,
  generateEmailChallengeCode,
  hashEmailChallengeCode,
  verifyEmailChallengeCodeHash,
} from "@/lib/auth/email-challenge"

const REGISTRATION_CHALLENGE_PURPOSE = "registration"
export const REGISTRATION_VERIFICATION_CODE_LENGTH = EMAIL_CHALLENGE_CODE_LENGTH
export const REGISTRATION_VERIFICATION_CODE_TTL_MINUTES = 10
export const REGISTRATION_VERIFICATION_RESEND_COOLDOWN_SECONDS = 60
export const REGISTRATION_VERIFICATION_MAX_ATTEMPTS = 5
export const REGISTRATION_VERIFICATION_MAX_RESENDS = 6

type StartPendingRegistrationInput = {
  fullName: string
  email: string
  phone?: string | null
  password: string
}

type RegistrationChallengeMeta = {
  email: string
  expiresAt: Date
  resendAvailableAt: Date
}

export class PendingRegistrationError extends Error {
  status: number
  code: string

  constructor(message: string, options: { status: number; code: string }) {
    super(message)
    this.name = "PendingRegistrationError"
    this.status = options.status
    this.code = options.code
  }
}

function normalizeEmail(email: string) {
  return email.trim()
}

function hashVerificationCode(email: string, code: string) {
  return hashEmailChallengeCode(REGISTRATION_CHALLENGE_PURPOSE, email, code)
}

function verifyCodeHash(expectedHash: string, email: string, code: string) {
  return verifyEmailChallengeCodeHash(expectedHash, REGISTRATION_CHALLENGE_PURPOSE, email, code)
}

function generateVerificationCode() {
  return generateEmailChallengeCode(REGISTRATION_VERIFICATION_CODE_LENGTH)
}

function buildChallengeMeta(email: string, now: Date, expiresAt: Date): RegistrationChallengeMeta {
  return {
    email,
    expiresAt,
    resendAvailableAt: new Date(now.getTime() + REGISTRATION_VERIFICATION_RESEND_COOLDOWN_SECONDS * 1000),
  }
}

async function sendRegistrationCode(email: string, fullName: string, code: string) {
  const letter = buildRegistrationVerificationEmail({
    code,
    recipientName: fullName,
    expiresInMinutes: REGISTRATION_VERIFICATION_CODE_TTL_MINUTES,
  })

  await sendEmail({
    to: email,
    subject: letter.subject,
    html: letter.html,
    text: letter.text,
  })
}

export async function startPendingRegistration(input: StartPendingRegistrationInput) {
  const now = new Date()
  const email = normalizeEmail(input.email)
  const fullName = input.fullName.trim()
  const code = generateVerificationCode()
  const expiresAt = new Date(now.getTime() + REGISTRATION_VERIFICATION_CODE_TTL_MINUTES * 60 * 1000)
  const passwordHash = await hashPassword(input.password)

  await prisma.pendingRegistration.upsert({
    where: { email },
    create: {
      email,
      fullName,
      phone: input.phone ?? null,
      passwordHash,
      verificationCodeHash: hashVerificationCode(email, code),
      verificationCodeExpiresAt: expiresAt,
      verificationAttempts: 0,
      resendCount: 0,
      lastSentAt: now,
    },
    update: {
      fullName,
      phone: input.phone ?? null,
      passwordHash,
      verificationCodeHash: hashVerificationCode(email, code),
      verificationCodeExpiresAt: expiresAt,
      verificationAttempts: 0,
      resendCount: 0,
      lastSentAt: now,
    },
  })

  await sendRegistrationCode(email, fullName, code)

  return buildChallengeMeta(email, now, expiresAt)
}

export async function resendPendingRegistration(emailInput: string) {
  const now = new Date()
  const email = normalizeEmail(emailInput)
  const pending = await prisma.pendingRegistration.findUnique({
    where: { email },
  })

  if (!pending) {
    throw new PendingRegistrationError("Сессия регистрации не найдена. Начните регистрацию заново.", {
      status: 404,
      code: "PENDING_REGISTRATION_NOT_FOUND",
    })
  }

  const secondsSinceLastSent = Math.floor((now.getTime() - pending.lastSentAt.getTime()) / 1000)
  if (secondsSinceLastSent < REGISTRATION_VERIFICATION_RESEND_COOLDOWN_SECONDS) {
    throw new PendingRegistrationError("Подождите немного перед повторной отправкой кода.", {
      status: 429,
      code: "PENDING_REGISTRATION_RESEND_COOLDOWN",
    })
  }

  if (pending.resendCount >= REGISTRATION_VERIFICATION_MAX_RESENDS) {
    throw new PendingRegistrationError("Лимит повторных отправок исчерпан. Начните регистрацию заново.", {
      status: 429,
      code: "PENDING_REGISTRATION_RESEND_LIMIT",
    })
  }

  const code = generateVerificationCode()
  const expiresAt = new Date(now.getTime() + REGISTRATION_VERIFICATION_CODE_TTL_MINUTES * 60 * 1000)

  await prisma.pendingRegistration.update({
    where: { email },
    data: {
      verificationCodeHash: hashVerificationCode(email, code),
      verificationCodeExpiresAt: expiresAt,
      verificationAttempts: 0,
      resendCount: {
        increment: 1,
      },
      lastSentAt: now,
    },
  })

  await sendRegistrationCode(email, pending.fullName, code)

  return buildChallengeMeta(email, now, expiresAt)
}

export async function verifyPendingRegistration(emailInput: string, codeInput: string) {
  const email = normalizeEmail(emailInput)
  const code = codeInput.trim()
  const pending = await prisma.pendingRegistration.findUnique({
    where: { email },
  })

  if (!pending) {
    throw new PendingRegistrationError("Сессия регистрации не найдена. Начните регистрацию заново.", {
      status: 404,
      code: "PENDING_REGISTRATION_NOT_FOUND",
    })
  }

  if (pending.verificationCodeExpiresAt < new Date()) {
    throw new PendingRegistrationError("Код истек. Запросите новый код и попробуйте снова.", {
      status: 410,
      code: "PENDING_REGISTRATION_CODE_EXPIRED",
    })
  }

  if (pending.verificationAttempts >= REGISTRATION_VERIFICATION_MAX_ATTEMPTS) {
    throw new PendingRegistrationError("Слишком много попыток. Запросите новый код.", {
      status: 429,
      code: "PENDING_REGISTRATION_TOO_MANY_ATTEMPTS",
    })
  }

  if (!verifyCodeHash(pending.verificationCodeHash, email, code)) {
    await prisma.pendingRegistration.update({
      where: { email },
      data: {
        verificationAttempts: {
          increment: 1,
        },
      },
    })

    throw new PendingRegistrationError("Неверный код. Проверьте письмо и попробуйте снова.", {
      status: 400,
      code: "PENDING_REGISTRATION_INVALID_CODE",
    })
  }

  const verifiedAt = new Date()

  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email } })
    if (existing) {
      throw new PendingRegistrationError("Email уже используется", {
        status: 409,
        code: "PENDING_REGISTRATION_EMAIL_EXISTS",
      })
    }

    const user = await tx.user.create({
      data: {
        email,
        emailVerifiedAt: verifiedAt,
        fullName: pending.fullName,
        phone: pending.phone,
        passwordHash: pending.passwordHash,
        status: "active",
        primaryMode: null,
        onboardingReady: false,
      },
    })

    await tx.pendingRegistration.delete({
      where: { email },
    })

    return user
  })
}
