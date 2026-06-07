/**
 * Server-only gate for admin PAGES (not API routes).
 *
 * Keeps the page components terse:
 *   const access = await requireAdminPageAccess()
 *   if (!access) return <Forbidden />        // forbidden (internal w/o grant, or regular user)
 *   // unauthorized users are redirected to the main app login before we get here
 */
import { redirect } from "next/navigation"
import {
  getMainAppLoginUrl,
  resolveAdminAccess,
  type AdminAccessContext,
} from "./admin-access"

/**
 * Returns the access context when allowed.
 * - Anonymous → throws a redirect to the main app login (never returns).
 * - Forbidden (regular user / internal w/o enabled grant) → returns null.
 */
export async function requireAdminPageAccess(): Promise<AdminAccessContext | null> {
  const result = await resolveAdminAccess()
  if (result.ok) return result.access
  if (result.reason === "unauthorized") {
    redirect(getMainAppLoginUrl())
  }
  return null
}

/**
 * Stricter page gate for the internal-access management page.
 * - Anonymous → redirect to main app login (never returns).
 * - Authenticated but not an enabled super_admin → returns null (caller renders
 *   <Forbidden />). Read-only admins land here and are denied, since this page
 *   exposes write actions.
 */
export async function requireSuperAdminPageAccess(): Promise<AdminAccessContext | null> {
  const result = await resolveAdminAccess()
  if (result.ok) return result.access.isSuperAdmin ? result.access : null
  if (result.reason === "unauthorized") {
    redirect(getMainAppLoginUrl())
  }
  return null
}
