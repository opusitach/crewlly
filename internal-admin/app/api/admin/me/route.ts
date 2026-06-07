/**
 * GET /api/admin/me
 *
 * Returns the authenticated internal user's basic identity and enabled access
 * levels. Used by the admin shell to render the header strip without re-rendering
 * the server page.
 *
 * Strict gate: 401 anonymous, 403 for any user that isn't internal with an
 * enabled grant. Regular users get the same 403 as non-internal users — we do
 * not differentiate, to avoid leaking the existence of internal accounts.
 */
import { NextResponse } from "next/server"
import { resolveAdminAccess } from "../../../../lib/admin-access"

export const dynamic = "force-dynamic"

export async function GET() {
  const result = await resolveAdminAccess()
  if (!result.ok) {
    const status = result.reason === "unauthorized" ? 401 : 403
    return NextResponse.json({ error: "Forbidden" }, { status })
  }

  return NextResponse.json({
    user: {
      id: result.access.user.id,
      email: result.access.user.email,
      name: result.access.user.fullName,
      isInternal: true,
    },
    enabledInternalLevels: result.access.enabledLevels,
    isSuperAdmin: result.access.isSuperAdmin,
  })
}
