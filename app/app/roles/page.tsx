import { redirect } from "next/navigation"
import { getSessionUserWithOrg, isOwnerRole } from "@/lib/auth"
import PositionRulesView from "@/components/position-rules-view"

export default async function RolesPage() {
  const session = await getSessionUserWithOrg()
  if (!session?.user) redirect("/login")
  if (!session.user.primaryMode) redirect("/select-role")
  if (!session.user.onboardingReady) {
    redirect(session.user.primaryMode === "owner" ? "/onboarding/owner" : "/onboarding/employee")
  }
  if (!isOwnerRole(session.membership)) redirect("/app")

  return <PositionRulesView />
}
