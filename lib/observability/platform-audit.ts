import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

/**
 * Action name constants for PlatformAuditLog.
 *
 * Platform-level (org-less) administrative actions. Unlike INTERNAL_ACTIONS
 * (which require an organizationId), these record actions taken in the internal
 * admin app that affect the platform itself — e.g. internal-access management.
 */
export const PLATFORM_ACTIONS = {
  INTERNAL_ACCESS_GRANT: "platform.internal_access.grant",
  INTERNAL_ACCESS_REVOKE: "platform.internal_access.revoke",
  // Optional / future:
  INTERNAL_ADMIN_OPEN: "platform.internal_admin.open",
  INTERNAL_USER_VIEW: "platform.internal_user.view",
} as const

export type PlatformAction = (typeof PLATFORM_ACTIONS)[keyof typeof PLATFORM_ACTIONS]

/**
 * Keys that must never be persisted in audit metadata. Defence in depth: callers
 * already pass only non-secret data, but we strip these defensively so a future
 * careless caller can't leak credentials into the audit trail.
 */
const FORBIDDEN_METADATA_KEYS = new Set([
  "password",
  "passwordhash",
  "password_hash",
  "passwordHash",
  "token",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "session",
  "sessiontoken",
  "session_token",
  "secret",
  "apikey",
  "api_key",
  "authorization",
  "cookie",
])

function sanitizeMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_METADATA_KEYS.has(key.toLowerCase())) continue
    out[key] = value
  }
  return out
}

export interface PlatformActionParams {
  actorUserId: string
  targetUserId?: string | null
  action: PlatformAction | string
  entityType?: string
  entityId?: string
  metadata?: Record<string, unknown>
}

/**
 * Write a platform-level audit record.
 *
 * Contract:
 *  - NEVER throws — a logging failure must not abort the primary action.
 *  - Logs a server-side error if the write fails.
 *  - Strips known secret-bearing keys from metadata defensively.
 */
export async function logPlatformAction(params: PlatformActionParams): Promise<void> {
  try {
    await prisma.platformAuditLog.create({
      data: {
        actorUserId: params.actorUserId,
        targetUserId: params.targetUserId ?? null,
        action: params.action,
        entityType: params.entityType ?? null,
        entityId: params.entityId ?? null,
        metadata: sanitizeMetadata(params.metadata) as Prisma.InputJsonValue | undefined,
      },
    })
  } catch (error) {
    console.error("[platform-audit] failed to write audit log", {
      action: params.action,
      actorUserId: params.actorUserId,
      targetUserId: params.targetUserId ?? null,
      error,
    })
  }
}
