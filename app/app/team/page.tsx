import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/auth"
import { resolveOrganizationAccess, isOwnerOrManagerEffectiveRole } from "@/lib/organization-access"
import TeamPageClient from "@/components/team-page-client"

export default async function TeamPage() {
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

  return <TeamPageClient />
}
