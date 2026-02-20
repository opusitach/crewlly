import { redirect } from "next/navigation"
import RoleSelectionWrapper from "@/components/onboarding/role-selection-wrapper"
import { getSessionUser } from "@/lib/auth"

export default async function SelectRolePage() {
  const user = await getSessionUser()
  if (!user) redirect("/login")
  if (user.primaryMode) {
    if (!user.onboardingReady) {
      redirect(user.primaryMode === "owner" ? "/onboarding/owner" : "/onboarding/employee")
    }
    redirect("/app")
  }
  return <RoleSelectionWrapper />
}
