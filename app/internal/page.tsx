/**
 * Internal organization selector.
 *
 * Access (enforced server-side):
 *   - authenticated user
 *   - user.isInternal = true
 *   - at least one enabled InternalGlobalAccess grant
 *
 * Regular users hit redirect("/app"). Anonymous users hit redirect("/login").
 */
import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/auth"
import {
  getEnabledInternalLevels,
  hasAnyEnabledInternalGrant,
} from "@/lib/internal-access/session"
import InternalSelectorClient from "@/components/internal/internal-selector-client"
import { isOrganizationInternalLevel } from "@/lib/types/internal-access"

type InternalAccessLevel = "owner_view" | "employee_view"

function normalizeParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

export default async function InternalSelectorPage({
  searchParams,
}: {
  searchParams: Promise<{ organizationId?: string | string[]; accessLevel?: string | string[] }>
}) {
  const user = await getSessionUser()
  if (!user) redirect("/login")
  if (!user.isInternal) redirect("/app")
  if (!(await hasAnyEnabledInternalGrant(user.id))) redirect("/app")

  // Only owner_view / employee_view drive the org selector. A super_admin grant
  // does NOT, on its own, let the user open organizations — so a user with only
  // super_admin sees no "Open as owner/employee" buttons.
  const enabledLevels = (await getEnabledInternalLevels(user.id)).filter(
    isOrganizationInternalLevel,
  ) as InternalAccessLevel[]

  // Preselect is INTENT ONLY. The accessLevel is normalized to a known value or null;
  // the organizationId is passed through verbatim and re-validated by the preview +
  // start endpoints. Query params never grant access on their own.
  const params = await searchParams
  const rawOrgId = normalizeParam(params.organizationId)?.trim()
  const rawLevel = normalizeParam(params.accessLevel)?.trim()
  const accessLevel: InternalAccessLevel | null =
    rawLevel === "owner_view" || rawLevel === "employee_view" ? rawLevel : null

  const preselect =
    rawOrgId && rawOrgId.length > 0
      ? { organizationId: rawOrgId, accessLevel, rawAccessLevel: rawLevel ?? null }
      : null

  return (
    <InternalSelectorClient
      enabledLevels={enabledLevels}
      currentUser={{
        id: user.id,
        fullName: user.fullName ?? null,
        email: user.email,
      }}
      preselect={preselect}
    />
  )
}
