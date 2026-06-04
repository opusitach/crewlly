/**
 * Internal access session — tracks which organization + accessLevel an internal user
 * has currently "opened" in the main crewlly.com app.
 *
 * Important: this model does NOT grant access by itself. It's a UX mechanism to remember
 * the chosen mode across requests. Final permission is still checked through
 * `resolveOrganizationAccess` which validates `InternalGlobalAccess.enabled` on every call.
 *
 * Invariants:
 *  - At most one active session per internal user (active = `endedAt IS NULL`).
 *  - Starting a new session ends any previous active one.
 *  - Internal users are NEVER added to OrganizationMember.
 */
import { prisma } from "@/lib/prisma"
import type { Prisma, PrismaClient } from "@prisma/client"
import type { InternalAccessLevel } from "@/lib/types/internal-access"

type TxClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">

export interface InternalAccessSessionRecord {
  id: string
  internalUserId: string
  organizationId: string
  accessLevel: InternalAccessLevel
  startedAt: Date
  endedAt: Date | null
}

/**
 * Get the user's currently active internal session, if any.
 * Returns null when the user has no active session (or is not internal).
 *
 * Does NOT verify InternalGlobalAccess — callers must do that separately.
 */
export async function getActiveInternalSession(
  userId: string,
  client: TxClient | typeof prisma = prisma,
): Promise<InternalAccessSessionRecord | null> {
  const session = await client.internalAccessSession.findFirst({
    where: { internalUserId: userId, endedAt: null },
    orderBy: { startedAt: "desc" },
  })
  return session
    ? {
        id: session.id,
        internalUserId: session.internalUserId,
        organizationId: session.organizationId,
        accessLevel: session.accessLevel as InternalAccessLevel,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
      }
    : null
}

/**
 * Verify the user has an enabled InternalGlobalAccess grant for the requested level.
 * Returns true only when:
 *  - user.isInternal = true
 *  - there is at least one InternalGlobalAccess row with the requested level and enabled = true
 *
 * Note: a separate request for owner_view will succeed for users who only have employee_view
 * iff this returns true — i.e. the check is per-level, not "any level".
 */
export async function hasEnabledInternalGrant(
  userId: string,
  accessLevel: InternalAccessLevel,
  client: TxClient | typeof prisma = prisma,
): Promise<boolean> {
  const grant = await client.internalGlobalAccess.findFirst({
    where: { userId, accessLevel, enabled: true },
    select: { id: true },
  })
  return Boolean(grant)
}

/**
 * Check whether the user has any enabled InternalGlobalAccess grant.
 * Used to gate access to the /internal selector page.
 */
export async function hasAnyEnabledInternalGrant(
  userId: string,
  client: TxClient | typeof prisma = prisma,
): Promise<boolean> {
  const grant = await client.internalGlobalAccess.findFirst({
    where: { userId, enabled: true },
    select: { id: true },
  })
  return Boolean(grant)
}

/**
 * Get the list of enabled internal access levels for a user.
 */
export async function getEnabledInternalLevels(
  userId: string,
  client: TxClient | typeof prisma = prisma,
): Promise<InternalAccessLevel[]> {
  const grants = await client.internalGlobalAccess.findMany({
    where: { userId, enabled: true },
    select: { accessLevel: true },
  })
  return grants.map((g) => g.accessLevel as InternalAccessLevel)
}

/**
 * Start a new internal session.
 *
 * Caller is responsible for verifying:
 *  - the user is internal
 *  - the user has an enabled `InternalGlobalAccess` grant for `accessLevel`
 *  - the organization exists and is active
 *
 * Any existing active session for this user is ended (endedAt = now()) before the new one is created.
 * Both operations run inside a single transaction.
 */
export async function startInternalSession(params: {
  internalUserId: string
  organizationId: string
  accessLevel: InternalAccessLevel
}): Promise<InternalAccessSessionRecord> {
  return prisma.$transaction(async (tx) => {
    const now = new Date()

    // End any previous active session for this user
    await tx.internalAccessSession.updateMany({
      where: { internalUserId: params.internalUserId, endedAt: null },
      data: { endedAt: now },
    })

    const created = await tx.internalAccessSession.create({
      data: {
        internalUserId: params.internalUserId,
        organizationId: params.organizationId,
        accessLevel: params.accessLevel as Prisma.InternalAccessSessionCreateInput["accessLevel"],
      },
    })

    return {
      id: created.id,
      internalUserId: created.internalUserId,
      organizationId: created.organizationId,
      accessLevel: created.accessLevel as InternalAccessLevel,
      startedAt: created.startedAt,
      endedAt: created.endedAt,
    }
  })
}

/**
 * End the user's active internal session, if any.
 * Idempotent — returns null when there was nothing to end.
 */
export async function endActiveInternalSession(
  internalUserId: string,
): Promise<InternalAccessSessionRecord | null> {
  return prisma.$transaction(async (tx) => {
    const active = await tx.internalAccessSession.findFirst({
      where: { internalUserId, endedAt: null },
      orderBy: { startedAt: "desc" },
    })

    if (!active) return null

    const ended = await tx.internalAccessSession.update({
      where: { id: active.id },
      data: { endedAt: new Date() },
    })

    return {
      id: ended.id,
      internalUserId: ended.internalUserId,
      organizationId: ended.organizationId,
      accessLevel: ended.accessLevel as InternalAccessLevel,
      startedAt: ended.startedAt,
      endedAt: ended.endedAt,
    }
  })
}
