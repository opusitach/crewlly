/**
 * Central resolver for organization access context.
 *
 * Handles two access paths:
 *  - Regular member:  Session → User → OrganizationMember → AccessRole
 *  - Internal access: Session → User (isInternal) → InternalGlobalAccess → synthetic role
 *
 * Internal users are never added to OrganizationMember.
 * Caller is responsible for session authentication (getSessionUser) before invoking this.
 */
import { prisma } from "@/lib/prisma"
import { SYSTEM_PERMISSIONS_BY_ROLE } from "@/lib/rbac/default-role-permissions"
import type { InternalAccessLevel, OrganizationInternalLevel } from "@/lib/types/internal-access"
import { isOrganizationInternalLevel } from "@/lib/types/internal-access"

// ─── Types ────────────────────────────────────────────────────────────────────

export type EffectiveRoleKey = "owner" | "manager" | "worker"

export interface OrganizationAccessContext {
  user: {
    id: string
    email: string
    fullName: string | null
    isInternal: boolean
    primaryMode: string | null
  }
  organizationId: string
  organization: {
    id: string
    name: string
    timezone: string
    currency: string
    status: string
  }
  /** true only when access is granted through InternalGlobalAccess, not OrganizationMember */
  isInternalAccess: boolean
  /** null for regular members */
  internalAccessLevel: InternalAccessLevel | null
  /** null for internal-access path */
  membership: {
    id: string
    isActive: boolean
    legacyRole: string | null
    accessRoleId: string | null
    accessRole: { id: string; key: string; name: string } | null
  } | null
  /** null for internal-access path */
  realMembershipId: string | null
  effectiveRoleKey: EffectiveRoleKey
  /** Flat list of permission keys available under effectiveRoleKey */
  permissions: string[]
}

export interface ResolveOrganizationAccessOptions {
  /**
   * When true and the user has InternalGlobalAccess, use the internal-access path
   * even if a real OrganizationMember record exists.
   */
  preferInternalAccess?: boolean
  /**
   * Request a specific internal access level. Has no effect for regular members.
   * When the user has multiple InternalGlobalAccess records and this is omitted,
   * the highest level (owner_view > employee_view) is selected automatically.
   */
  requestedInternalAccessLevel?: InternalAccessLevel
  /**
   * When true and the user has an active InternalAccessSession for THIS organization,
   * the session's accessLevel is used as `requestedInternalAccessLevel` (unless that
   * option is already set explicitly, in which case the explicit value wins).
   *
   * The active session never grants access by itself — `InternalGlobalAccess.enabled`
   * is still re-checked. This option only chooses *which* level among enabled grants.
   */
  useActiveInternalSession?: boolean
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Map an organization-capable InternalAccessLevel to the matching system role key.
 * `super_admin` is intentionally NOT handled here — it is a platform-management
 * level and never confers organization access (see Path B below, which only ever
 * selects owner_view / employee_view grants).
 */
function internalLevelToRoleKey(level: OrganizationInternalLevel): EffectiveRoleKey {
  return level === "owner_view" ? "owner" : "worker"
}

/**
 * Derive effectiveRoleKey from a real membership.
 * Mirrors the project-wide convention: accessRole.key ?? legacyRole.
 */
function membershipToRoleKey(membership: {
  legacyRole: string | null
  accessRole: { key: string } | null
}): EffectiveRoleKey {
  const key = membership.accessRole?.key ?? membership.legacyRole ?? null
  if (key === "owner") return "owner"
  if (key === "manager") return "manager"
  return "worker"
}

/**
 * Build the permission list for a regular member.
 * Permissions come from DB when an accessRole exists; legacy roles fall back to
 * the canonical SYSTEM_PERMISSIONS_BY_ROLE sets.
 */
function buildMemberPermissions(
  membership: {
    legacyRole: string | null
    accessRole: {
      key: string
      permissions: Array<{ permission: { key: string } }>
    } | null
  },
  effectiveRoleKey: EffectiveRoleKey,
): string[] {
  if (membership.accessRole?.permissions?.length) {
    return membership.accessRole.permissions.map((rp) => rp.permission.key)
  }
  // Legacy member without AccessRole record — use canonical set for their role
  return [...SYSTEM_PERMISSIONS_BY_ROLE[effectiveRoleKey]]
}

// ─── Main resolver ────────────────────────────────────────────────────────────

/**
 * Resolve the effective access context for a user in an organisation.
 *
 * Returns null when:
 *  - the organisation does not exist or is not active
 *  - the user has no active OrganizationMember AND no enabled InternalGlobalAccess
 *
 * Authentication (session validity) is the caller's responsibility.
 */
export async function resolveOrganizationAccess(
  userId: string,
  organizationId: string,
  options: ResolveOrganizationAccessOptions = {},
): Promise<OrganizationAccessContext | null> {
  // Fetch user, organisation and real membership concurrently
  const [user, organization, membership] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        isInternal: true,
        primaryMode: true,
      },
    }),
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, timezone: true, currency: true, status: true },
    }),
    prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: {
        id: true,
        isActive: true,
        legacyRole: true,
        accessRoleId: true,
        accessRole: {
          select: {
            id: true,
            key: true,
            name: true,
            permissions: {
              select: { permission: { select: { key: true } } },
            },
          },
        },
      },
    }),
  ])

  if (!user || !organization || organization.status !== "active") return null

  const hasActiveMembership = Boolean(membership?.isActive)
  const useInternalPath =
    user.isInternal &&
    (!hasActiveMembership || options.preferInternalAccess === true)

  // ── Path A: real OrganizationMember ──────────────────────────────────────
  if (hasActiveMembership && !useInternalPath) {
    const m = membership! // narrowed: isActive is true
    const effectiveRoleKey = membershipToRoleKey(m)
    const permissions = buildMemberPermissions(
      m as Parameters<typeof buildMemberPermissions>[0],
      effectiveRoleKey,
    )
    return {
      user,
      organizationId,
      organization,
      isInternalAccess: false,
      internalAccessLevel: null,
      membership: {
        id: m.id,
        isActive: m.isActive,
        legacyRole: m.legacyRole,
        accessRoleId: m.accessRoleId,
        accessRole: m.accessRole
          ? { id: m.accessRole.id, key: m.accessRole.key, name: m.accessRole.name }
          : null,
      },
      realMembershipId: m.id,
      effectiveRoleKey,
      permissions,
    }
  }

  // ── Path B: InternalGlobalAccess ─────────────────────────────────────────
  if (useInternalPath) {
    const grants = await prisma.internalGlobalAccess.findMany({
      where: { userId, enabled: true },
      select: { id: true, accessLevel: true, scope: true },
    })

    // If caller opted into session-driven mode and didn't override the level
    // explicitly, derive the requested level from the active session.
    // The session must match this organizationId — a session for another org
    // does not influence resolution here.
    let requestedLevel = options.requestedInternalAccessLevel
    if (!requestedLevel && options.useActiveInternalSession) {
      const activeSession = await prisma.internalAccessSession.findFirst({
        where: {
          internalUserId: userId,
          organizationId,
          endedAt: null,
        },
        orderBy: { startedAt: "desc" },
        select: { accessLevel: true },
      })
      if (activeSession) {
        requestedLevel = activeSession.accessLevel as InternalAccessLevel
      }
    }

    // Pick the requested level or default to highest available.
    // Only owner_view / employee_view confer organization access — super_admin is
    // a platform-management level and is never resolvable to an org role, even if
    // explicitly requested.
    const grant =
      requestedLevel && isOrganizationInternalLevel(requestedLevel)
        ? grants.find((g) => g.accessLevel === requestedLevel)
        : requestedLevel
          ? undefined // requested super_admin (or other non-org level) → no org access
          : (grants.find((g) => g.accessLevel === "owner_view") ??
              grants.find((g) => g.accessLevel === "employee_view"))

    if (!grant || !isOrganizationInternalLevel(grant.accessLevel as InternalAccessLevel)) {
      return null // isInternal alone (or super_admin alone) is not enough
    }

    const level = grant.accessLevel as OrganizationInternalLevel
    const effectiveRoleKey = internalLevelToRoleKey(level)
    const permissions = [...SYSTEM_PERMISSIONS_BY_ROLE[effectiveRoleKey]]

    return {
      user,
      organizationId,
      organization,
      isInternalAccess: true,
      internalAccessLevel: level,
      membership: null,
      realMembershipId: null,
      effectiveRoleKey,
      permissions,
    }
  }

  return null // no membership, no internal access
}

// ─── Helper predicates ────────────────────────────────────────────────────────

/** True when the context was resolved through InternalGlobalAccess (not OrganizationMember) */
export function isInternalAccessContext(ctx: OrganizationAccessContext): boolean {
  return ctx.isInternalAccess
}

/** True when effectiveRoleKey is "owner" */
export function isOwnerEffectiveRole(ctx: OrganizationAccessContext): boolean {
  return ctx.effectiveRoleKey === "owner"
}

/** True when effectiveRoleKey is "owner" or "manager" */
export function isOwnerOrManagerEffectiveRole(ctx: OrganizationAccessContext): boolean {
  return ctx.effectiveRoleKey === "owner" || ctx.effectiveRoleKey === "manager"
}

/** True when the given permission key is present in the context's permission set */
export function hasEffectivePermission(
  ctx: OrganizationAccessContext,
  permission: string,
): boolean {
  return ctx.permissions.includes(permission)
}
