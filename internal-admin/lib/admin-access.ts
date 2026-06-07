/**
 * Admin access gate for the internal-admin app (admin.crewlly.com).
 *
 * SINGLE SOURCE OF TRUTH for "is this user allowed in admin?".
 * Every server page, layout, and API route must call `requireAdminAccess()` (or its
 * non-redirecting sibling `resolveAdminAccess()`) — there is no app-wide middleware
 * that bypasses this check, by design.
 *
 * Allowed iff:
 *   - request carries a valid Session cookie
 *   - the user has `isInternal = true`
 *   - the user has at least one InternalGlobalAccess row with `enabled = true`
 *
 * Anything else → 403 / redirect to main app's login.
 *
 * Security invariants preserved:
 *   - No `if (user.isInternal) return true` shortcut — grant is also required.
 *   - No new role written into OrganizationMember.
 *   - No business writes from the admin app (this file's API is read-only).
 */
import { getSessionUser } from "@/lib/auth"
import {
  getEnabledInternalLevels,
  hasAnyEnabledInternalGrant,
} from "@/lib/internal-access/session"
import type { InternalAccessLevel } from "@/lib/types/internal-access"

export interface AdminAccessContext {
  user: {
    id: string
    email: string
    fullName: string | null
    isInternal: true
  }
  enabledLevels: InternalAccessLevel[]
  /**
   * True iff the user has an enabled `super_admin` grant. Read-heavy admin access
   * does NOT require this — only internal-access write actions do. Derived from
   * `enabledLevels`, never from `isInternal` alone.
   */
  isSuperAdmin: boolean
}

export type AdminAccessResult =
  | { ok: true; access: AdminAccessContext }
  | { ok: false; reason: "unauthorized" | "forbidden" }

/**
 * Resolve admin access for the current request. Never throws and never redirects —
 * the caller decides how to respond (JSON 401/403 for APIs, redirect for pages).
 */
export async function resolveAdminAccess(): Promise<AdminAccessResult> {
  const user = await getSessionUser()
  if (!user) {
    return { ok: false, reason: "unauthorized" }
  }
  if (!user.isInternal) {
    // Note: we return the same generic "forbidden" rather than leaking that the
    // user exists but lacks the flag. Regular users should not learn the admin
    // app's authorization model.
    return { ok: false, reason: "forbidden" }
  }
  if (!(await hasAnyEnabledInternalGrant(user.id))) {
    return { ok: false, reason: "forbidden" }
  }

  const enabledLevels = await getEnabledInternalLevels(user.id)

  return {
    ok: true,
    access: {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        isInternal: true,
      },
      enabledLevels,
      isSuperAdmin: enabledLevels.includes("super_admin"),
    },
  }
}

/**
 * URL of the main app — admins land here for login if they're not authenticated.
 * Falls back to "/" so we don't crash if env is missing.
 */
export function getMainAppLoginUrl(): string {
  const base = process.env.MAIN_APP_URL?.trim()
  return base ? `${base.replace(/\/$/, "")}/login` : "/"
}
