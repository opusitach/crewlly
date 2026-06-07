/**
 * Internal access management — grant & revoke InternalGlobalAccess records.
 *
 * This is the ONLY write path for internal access and the first write feature in
 * the admin app. Every invariant from Stage 12 is enforced here, on the backend,
 * inside a transaction where ordering matters:
 *
 *  - Access can only be granted to EXISTING users with isInternal = true.
 *    Regular users are never promoted; no user is ever created.
 *  - No OrganizationMember / hidden membership / RBAC role is ever written.
 *  - Revoke is a HARD DELETE of the InternalGlobalAccess row (never enabled=false).
 *  - Revoking owner_view / employee_view ends matching active InternalAccessSessions.
 *  - The system can never be left with zero enabled super_admins — the count check
 *    and the delete happen in the same transaction to avoid races.
 *
 * Authorization (actor must be an enabled super_admin) is enforced by the API
 * layer before these functions are called; they assume an authorized actor and
 * focus on data invariants. `actorUserId` is threaded through only for auditing.
 */
import { prisma } from "@/lib/prisma"
import type { Prisma, PrismaClient } from "@prisma/client"
import type { InternalAccessLevel } from "@/lib/types/internal-access"
import { isOrganizationInternalLevel } from "@/lib/types/internal-access"
import { logPlatformAction, PLATFORM_ACTIONS } from "@/lib/observability/platform-audit"

type TxClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>

const DEFAULT_SCOPE = "all_establishments" as const

/**
 * Does this user have an enabled super_admin grant? This is the gate for every
 * internal-access write action. Never short-circuits on isInternal alone.
 */
export async function hasSuperAdminAccess(
  userId: string,
  client: TxClient | typeof prisma = prisma,
): Promise<boolean> {
  const grant = await client.internalGlobalAccess.findFirst({
    where: { userId, accessLevel: "super_admin", enabled: true },
    select: { id: true },
  })
  return Boolean(grant)
}

/** Enabled levels for a single user (used to build response payloads). */
async function enabledLevelsFor(
  userId: string,
  client: TxClient | typeof prisma = prisma,
): Promise<InternalAccessLevel[]> {
  const grants = await client.internalGlobalAccess.findMany({
    where: { userId, enabled: true },
    select: { accessLevel: true },
  })
  return grants.map((g) => g.accessLevel as InternalAccessLevel)
}

export type GrantResult =
  | { ok: true; created: boolean; enabledLevels: InternalAccessLevel[] }
  | { ok: false; code: "target_not_found" | "target_not_internal" }

/**
 * Grant `accessLevel` to an existing internal user. Idempotent: re-granting an
 * existing enabled access returns ok with created=false and writes no audit.
 */
export async function grantInternalAccess(params: {
  actorUserId: string
  targetUserId: string
  accessLevel: InternalAccessLevel
}): Promise<GrantResult> {
  const { actorUserId, targetUserId, accessLevel } = params

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, isInternal: true },
  })
  if (!target) return { ok: false, code: "target_not_found" }
  // Hard rule: access can only be granted to existing internal users. A regular
  // user is never auto-promoted to internal here.
  if (!target.isInternal) return { ok: false, code: "target_not_internal" }

  const existing = await prisma.internalGlobalAccess.findFirst({
    where: { userId: targetUserId, accessLevel, scope: DEFAULT_SCOPE, enabled: true },
    select: { id: true },
  })

  if (existing) {
    return { ok: true, created: false, enabledLevels: await enabledLevelsFor(targetUserId) }
  }

  // upsert covers the legacy case of a disabled row existing for this triple.
  await prisma.internalGlobalAccess.upsert({
    where: {
      userId_accessLevel_scope: {
        userId: targetUserId,
        accessLevel: accessLevel as Prisma.InternalGlobalAccessCreateInput["accessLevel"],
        scope: DEFAULT_SCOPE,
      },
    },
    update: { enabled: true },
    create: {
      userId: targetUserId,
      accessLevel: accessLevel as Prisma.InternalGlobalAccessCreateInput["accessLevel"],
      scope: DEFAULT_SCOPE,
      enabled: true,
    },
  })

  await logPlatformAction({
    actorUserId,
    targetUserId,
    action: PLATFORM_ACTIONS.INTERNAL_ACCESS_GRANT,
    entityType: "internal_global_access",
    metadata: { accessLevel, scope: DEFAULT_SCOPE },
  })

  return { ok: true, created: true, enabledLevels: await enabledLevelsFor(targetUserId) }
}

export type RevokeResult =
  | { ok: true; deleted: boolean; endedSessions: number; enabledLevels: InternalAccessLevel[] }
  | { ok: false; code: "target_not_found" | "target_not_internal" | "last_super_admin" }

/**
 * Revoke (hard delete) `accessLevel` from an internal user.
 *
 * - Idempotent: revoking a non-existent grant returns ok with deleted=false.
 * - owner_view / employee_view: ends the user's matching active sessions.
 * - super_admin: the system-wide enabled super_admin count check and the delete
 *   run in one transaction; refuses to remove the last enabled super_admin.
 */
export async function revokeInternalAccess(params: {
  actorUserId: string
  targetUserId: string
  accessLevel: InternalAccessLevel
}): Promise<RevokeResult> {
  const { actorUserId, targetUserId, accessLevel } = params

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, isInternal: true },
  })
  if (!target) return { ok: false, code: "target_not_found" }
  if (!target.isInternal) return { ok: false, code: "target_not_internal" }

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.internalGlobalAccess.findFirst({
      where: { userId: targetUserId, accessLevel, enabled: true },
      select: { id: true },
    })

    if (!existing) {
      // Nothing to revoke — idempotent success.
      return { kind: "noop" as const }
    }

    if (accessLevel === "super_admin") {
      // Last-super-admin protection. Count enabled super_admin grants across the
      // whole system; refuse if removing this one would leave none. Done inside
      // the transaction so a concurrent revoke can't slip past the check.
      const enabledSuperAdmins = await tx.internalGlobalAccess.count({
        where: { accessLevel: "super_admin", enabled: true },
      })
      if (enabledSuperAdmins <= 1) {
        return { kind: "last_super_admin" as const }
      }
    }

    await tx.internalGlobalAccess.deleteMany({
      where: { userId: targetUserId, accessLevel },
    })

    let endedSessions = 0
    if (isOrganizationInternalLevel(accessLevel)) {
      const ended = await tx.internalAccessSession.updateMany({
        where: { internalUserId: targetUserId, accessLevel, endedAt: null },
        data: { endedAt: new Date() },
      })
      endedSessions = ended.count
    }

    return { kind: "deleted" as const, endedSessions }
  })

  if (result.kind === "last_super_admin") {
    return { ok: false, code: "last_super_admin" }
  }

  if (result.kind === "noop") {
    return { ok: true, deleted: false, endedSessions: 0, enabledLevels: await enabledLevelsFor(targetUserId) }
  }

  await logPlatformAction({
    actorUserId,
    targetUserId,
    action: PLATFORM_ACTIONS.INTERNAL_ACCESS_REVOKE,
    entityType: "internal_global_access",
    metadata: {
      accessLevel,
      scope: DEFAULT_SCOPE,
      endedSessions: result.endedSessions,
    },
  })

  return {
    ok: true,
    deleted: true,
    endedSessions: result.endedSessions,
    enabledLevels: await enabledLevelsFor(targetUserId),
  }
}
