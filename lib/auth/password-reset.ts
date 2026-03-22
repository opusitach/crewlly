import "server-only"

import { hashPassword } from "@/lib/auth"
import {
  EMAIL_CHALLENGE_CODE_LENGTH,
  generateEmailChallengeCode,
  generateEmailChallengeToken,
  hashEmailChallengeCode,
  hashEmailChallengeToken,
  verifyEmailChallengeCodeHash,
  verifyEmailChallengeTokenHash,
} from "@/lib/auth/email-challenge"
import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email/mailer"
import { buildPasswordResetEmail } from "@/lib/email/templates/password-reset"

const PASSWORD_RESET_CHALLENGE_PURPOSE = "password-reset"

export const PASSWORD_RESET_CODE_LENGTH = EMAIL_CHALLENGE_CODE_LENGTH
export const PASSWORD_RESET_CODE_TTL_MINUTES = 10
export const PASSWORD_RESET_RESEND_COOLDOWN_SECONDS = 60
export const PASSWORD_RESET_MAX_ATTEMPTS = 5
export const PASSWORD_RESET_MAX_RESENDS = 6
export const PASSWORD_RESET_SESSION_TTL_MINUTES = 15

type PasswordResetChallengeMeta = {
  email: string
  expiresAt: Date
  resendAvailableAt: Date
}

type PasswordResetVerificationMeta = {
  email: string
  resetToken: string
  resetTokenExpiresAt: Date
}

export class PasswordResetError extends Error {
  status: number
  code: string

  constructor(message: string, options: { status: number; code: string }) {
    super(message)
    this.name = "PasswordResetError"
    this.status = options.status
    this.code = options.code
  }
}

function normalizeEmail(email: string) {
  return email.trim()
}

function hashVerificationCode(email: string, code: string) {
  return hashEmailChallengeCode(PASSWORD_RESET_CHALLENGE_PURPOSE, email, code)
}

function verifyCodeHash(expectedHash: string, email: string, code: string) {
  return verifyEmailChallengeCodeHash(expectedHash, PASSWORD_RESET_CHALLENGE_PURPOSE, email, code)
}

function hashResetToken(email: string, token: string) {
  return hashEmailChallengeToken(PASSWORD_RESET_CHALLENGE_PURPOSE, email, token)
}

function verifyResetTokenHash(expectedHash: string, email: string, token: string) {
  return verifyEmailChallengeTokenHash(expectedHash, PASSWORD_RESET_CHALLENGE_PURPOSE, email, token)
}

function buildChallengeMeta(email: string, now: Date, expiresAt: Date): PasswordResetChallengeMeta {
  return {
    email,
    expiresAt,
    resendAvailableAt: new Date(now.getTime() + PASSWORD_RESET_RESEND_COOLDOWN_SECONDS * 1000),
  }
}

async function sendPasswordResetCode(email: string, recipientName: string, code: string) {
  const letter = buildPasswordResetEmail({
    code,
    recipientName,
    expiresInMinutes: PASSWORD_RESET_CODE_TTL_MINUTES,
  })

  await sendEmail({
    to: email,
    subject: letter.subject,
    html: letter.html,
    text: letter.text,
  })
}

function resolveRecipientName(user: { fullName?: string | null; email: string } | null) {
  return user?.fullName?.trim() || user?.email || "пользователь"
}

export async function startPasswordReset(emailInput: string) {
  const now = new Date()
  const email = normalizeEmail(emailInput)
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      email: true,
      fullName: true,
      status: true,
    },
  })

  if (!user || user.status === "disabled") {
    throw new PasswordResetError("Такой почты не существует, попробуйте снова.", {
      status: 404,
      code: "PASSWORD_RESET_EMAIL_NOT_FOUND",
    })
  }

  const existing = await prisma.pendingPasswordReset.findUnique({
    where: { email },
  })

  if (existing) {
    const secondsSinceLastSent = Math.floor((now.getTime() - existing.lastSentAt.getTime()) / 1000)
    if (secondsSinceLastSent < PASSWORD_RESET_RESEND_COOLDOWN_SECONDS) {
      throw new PasswordResetError("Подождите немного перед повторной отправкой кода.", {
        status: 429,
        code: "PASSWORD_RESET_RESEND_COOLDOWN",
      })
    }
  }

  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_CODE_TTL_MINUTES * 60 * 1000)
  const code = generateEmailChallengeCode(PASSWORD_RESET_CODE_LENGTH)

  await prisma.pendingPasswordReset.upsert({
    where: { email },
    create: {
      email,
      verificationCodeHash: hashVerificationCode(email, code),
      verificationCodeExpiresAt: expiresAt,
      verificationAttempts: 0,
      resendCount: 0,
      lastSentAt: now,
      resetTokenHash: null,
      resetTokenExpiresAt: null,
      verifiedAt: null,
    },
    update: {
      verificationCodeHash: hashVerificationCode(email, code),
      verificationCodeExpiresAt: expiresAt,
      verificationAttempts: 0,
      resendCount: 0,
      lastSentAt: now,
      resetTokenHash: null,
      resetTokenExpiresAt: null,
      verifiedAt: null,
    },
  })

  await sendPasswordResetCode(email, resolveRecipientName(user), code)

  return buildChallengeMeta(email, now, expiresAt)
}

export async function resendPasswordReset(emailInput: string) {
  const now = new Date()
  const email = normalizeEmail(emailInput)
  const pending = await prisma.pendingPasswordReset.findUnique({
    where: { email },
  })

  if (!pending) {
    throw new PasswordResetError("Сессия восстановления не найдена. Начните заново.", {
      status: 404,
      code: "PASSWORD_RESET_NOT_FOUND",
    })
  }

  const secondsSinceLastSent = Math.floor((now.getTime() - pending.lastSentAt.getTime()) / 1000)
  if (secondsSinceLastSent < PASSWORD_RESET_RESEND_COOLDOWN_SECONDS) {
    throw new PasswordResetError("Подождите немного перед повторной отправкой кода.", {
      status: 429,
      code: "PASSWORD_RESET_RESEND_COOLDOWN",
    })
  }

  if (pending.resendCount >= PASSWORD_RESET_MAX_RESENDS) {
    throw new PasswordResetError("Лимит повторных отправок исчерпан. Начните восстановление заново.", {
      status: 429,
      code: "PASSWORD_RESET_RESEND_LIMIT",
    })
  }

  const code = generateEmailChallengeCode(PASSWORD_RESET_CODE_LENGTH)
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_CODE_TTL_MINUTES * 60 * 1000)

  await prisma.pendingPasswordReset.update({
    where: { email },
    data: {
      verificationCodeHash: hashVerificationCode(email, code),
      verificationCodeExpiresAt: expiresAt,
      verificationAttempts: 0,
      resendCount: {
        increment: 1,
      },
      lastSentAt: now,
      resetTokenHash: null,
      resetTokenExpiresAt: null,
      verifiedAt: null,
    },
  })

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      email: true,
      fullName: true,
      status: true,
    },
  })

  if (user && user.status !== "disabled") {
    await sendPasswordResetCode(email, resolveRecipientName(user), code)
  }

  return buildChallengeMeta(email, now, expiresAt)
}

export async function verifyPasswordReset(emailInput: string, codeInput: string) {
  const email = normalizeEmail(emailInput)
  const code = codeInput.trim()
  const pending = await prisma.pendingPasswordReset.findUnique({
    where: { email },
  })

  if (!pending) {
    throw new PasswordResetError("Код недействителен или истек. Запросите новый код.", {
      status: 400,
      code: "PASSWORD_RESET_INVALID_CODE",
    })
  }

  if (pending.verificationCodeExpiresAt < new Date()) {
    throw new PasswordResetError("Код истек. Запросите новый код и попробуйте снова.", {
      status: 410,
      code: "PASSWORD_RESET_CODE_EXPIRED",
    })
  }

  if (pending.verificationAttempts >= PASSWORD_RESET_MAX_ATTEMPTS) {
    throw new PasswordResetError("Слишком много попыток. Запросите новый код.", {
      status: 429,
      code: "PASSWORD_RESET_TOO_MANY_ATTEMPTS",
    })
  }

  if (!verifyCodeHash(pending.verificationCodeHash, email, code)) {
    await prisma.pendingPasswordReset.update({
      where: { email },
      data: {
        verificationAttempts: {
          increment: 1,
        },
      },
    })

    throw new PasswordResetError("Неверный код. Проверьте письмо и попробуйте снова.", {
      status: 400,
      code: "PASSWORD_RESET_INVALID_CODE",
    })
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      status: true,
    },
  })

  if (!user || user.status === "disabled") {
    throw new PasswordResetError("Сессия восстановления недействительна. Начните заново.", {
      status: 400,
      code: "PASSWORD_RESET_INVALID_SESSION",
    })
  }

  const verifiedAt = new Date()
  const resetToken = generateEmailChallengeToken()
  const resetTokenExpiresAt = new Date(verifiedAt.getTime() + PASSWORD_RESET_SESSION_TTL_MINUTES * 60 * 1000)

  await prisma.pendingPasswordReset.update({
    where: { email },
    data: {
      verificationCodeExpiresAt: verifiedAt,
      resetTokenHash: hashResetToken(email, resetToken),
      resetTokenExpiresAt,
      verifiedAt,
    },
  })

  return {
    email,
    resetToken,
    resetTokenExpiresAt,
  } satisfies PasswordResetVerificationMeta
}

export async function confirmPasswordReset(emailInput: string, resetTokenInput: string, password: string) {
  const email = normalizeEmail(emailInput)
  const resetToken = resetTokenInput.trim()
  const pending = await prisma.pendingPasswordReset.findUnique({
    where: { email },
  })

  if (!pending?.resetTokenHash || !pending.resetTokenExpiresAt) {
    throw new PasswordResetError("Сессия восстановления недействительна. Начните заново.", {
      status: 400,
      code: "PASSWORD_RESET_INVALID_SESSION",
    })
  }

  if (pending.resetTokenExpiresAt < new Date()) {
    throw new PasswordResetError("Сессия восстановления истекла. Запросите новый код.", {
      status: 410,
      code: "PASSWORD_RESET_SESSION_EXPIRED",
    })
  }

  if (!verifyResetTokenHash(pending.resetTokenHash, email, resetToken)) {
    throw new PasswordResetError("Сессия восстановления недействительна. Начните заново.", {
      status: 400,
      code: "PASSWORD_RESET_INVALID_SESSION",
    })
  }

  const passwordHash = await hashPassword(password)

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { email },
      select: {
        id: true,
        status: true,
      },
    })

    if (!user || user.status === "disabled") {
      throw new PasswordResetError("Сессия восстановления недействительна. Начните заново.", {
        status: 400,
        code: "PASSWORD_RESET_INVALID_SESSION",
      })
    }

    await tx.user.update({
      where: { email },
      data: {
        passwordHash,
      },
    })

    await tx.session.deleteMany({
      where: {
        userId: user.id,
      },
    })

    await tx.pendingPasswordReset.delete({
      where: { email },
    })
  })
}
