import crypto from "crypto"
import { Prisma } from "@prisma/client"
import type { PrismaClient } from "@prisma/client"

const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const INVITE_CODE_MIN_LENGTH = 8
const INVITE_CODE_MAX_LENGTH = 12
const INVITE_CODE_RETRY_LIMIT = 5

export function normalizeInviteCode(input: string) {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "")
}

export function hashInviteCode(code: string) {
  const normalized = normalizeInviteCode(code)
  return crypto.createHash("sha256").update(normalized).digest("hex")
}

export function generateInviteCode() {
  const length =
    INVITE_CODE_MIN_LENGTH +
    crypto.randomInt(INVITE_CODE_MAX_LENGTH - INVITE_CODE_MIN_LENGTH + 1)
  let value = ""
  for (let i = 0; i < length; i += 1) {
    const index = crypto.randomInt(INVITE_CODE_ALPHABET.length)
    value += INVITE_CODE_ALPHABET[index]
  }
  return value
}

type CreateInviteCodeInput = {
  organizationId: string
  createdByUserId: string
  expiresAt?: Date | null
  maxUses?: number | null
  revokeExisting?: boolean
}

type CreateInviteCodeResult = {
  code: string
  invitationId: string
  expiresAt: Date | null
  maxUses: number | null
  usesCount: number
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"

export async function createInviteCode(
  prisma: PrismaClient,
  {
    organizationId,
    createdByUserId,
    expiresAt = null,
    maxUses = null,
    revokeExisting = true,
  }: CreateInviteCodeInput,
): Promise<CreateInviteCodeResult> {
  for (let attempt = 0; attempt < INVITE_CODE_RETRY_LIMIT; attempt += 1) {
    const code = generateInviteCode()
    const codeHash = hashInviteCode(code)

    try {
      const invitation = await prisma.$transaction(async (tx) => {
        if (revokeExisting) {
          await tx.invitationCode.updateMany({
            where: { organizationId, status: "active" },
            data: { status: "revoked" },
          })
        }

        return tx.invitationCode.create({
          data: {
            organizationId,
            code,
            codeHash,
            status: "active",
            expiresAt,
            maxUses,
            usesCount: 0,
            createdByUserId,
          },
        })
      })

      return {
        code,
        invitationId: invitation.id,
        expiresAt: invitation.expiresAt ?? null,
        maxUses: invitation.maxUses ?? null,
        usesCount: invitation.usesCount,
      }
    } catch (error) {
      if (isUniqueViolation(error)) {
        continue
      }
      throw error
    }
  }

  throw new Error("Failed to generate unique invite code")
}

export async function ensureInviteCodeForOrganization(
  prisma: PrismaClient,
  organizationId: string,
  createdByUserId: string,
) {
  const existing = await prisma.invitationCode.findFirst({
    where: { organizationId, status: "active" },
    select: { id: true },
  })

  if (existing) {
    return null
  }

  return createInviteCode(prisma, {
    organizationId,
    createdByUserId,
    revokeExisting: false,
  })
}
