import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto"

export const EMAIL_CHALLENGE_CODE_LENGTH = 6

export function resolveEmailChallengeSecret(env: NodeJS.ProcessEnv = process.env) {
  const configured = env.EMAIL_VERIFICATION_SECRET?.trim() || env.INTERNAL_CRON_SECRET?.trim()
  if (configured) {
    return configured
  }

  if (env.NODE_ENV !== "production") {
    return "crewlly-dev-email-verification-secret"
  }

  throw new Error("EMAIL_VERIFICATION_SECRET is required in production")
}

export function hashEmailChallengeCode(purpose: string, email: string, code: string) {
  return createHmac("sha256", resolveEmailChallengeSecret())
    .update(`${purpose}:${email.trim().toLowerCase()}:${code}`)
    .digest("hex")
}

export function verifyEmailChallengeCodeHash(expectedHash: string, purpose: string, email: string, code: string) {
  const candidate = hashEmailChallengeCode(purpose, email, code)
  return timingSafeEqual(Buffer.from(expectedHash, "utf8"), Buffer.from(candidate, "utf8"))
}

export function hashEmailChallengeToken(purpose: string, email: string, token: string) {
  return createHmac("sha256", resolveEmailChallengeSecret())
    .update(`${purpose}:${email.trim().toLowerCase()}:${token}`)
    .digest("hex")
}

export function verifyEmailChallengeTokenHash(expectedHash: string, purpose: string, email: string, token: string) {
  const candidate = hashEmailChallengeToken(purpose, email, token)
  return timingSafeEqual(Buffer.from(expectedHash, "utf8"), Buffer.from(candidate, "utf8"))
}

export function generateEmailChallengeCode(length = EMAIL_CHALLENGE_CODE_LENGTH) {
  return String(randomInt(0, 10 ** length)).padStart(length, "0")
}

export function generateEmailChallengeToken() {
  return randomUUID()
}
