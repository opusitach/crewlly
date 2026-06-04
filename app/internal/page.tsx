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

  const enabledLevels = await getEnabledInternalLevels(user.id)

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
