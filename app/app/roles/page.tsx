import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/auth"
import { resolveOrganizationAccess, isOwnerOrManagerEffectiveRole } from "@/lib/organization-access"
import PositionRulesView from "@/components/position-rules-view"

export default async function RolesPage() {
  const user = await getSessionUser()
  if (!user) redirect("/login")
  if (!user.primaryMode) redirect("/select-role")
  if (!user.onboardingReady) {
    redirect(user.primaryMode === "owner" ? "/onboarding/owner" : "/onboarding/employee")
  }

  const access = user.activeOrganizationId
    ? await resolveOrganizationAccess(user.id, user.activeOrganizationId, {
        useActiveInternalSession: user.isInternal,
      })
    : null

  if (!access || !isOwnerOrManagerEffectiveRole(access)) redirect("/app")

  return <PositionRulesView />
}
