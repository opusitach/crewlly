import { redirect } from "next/navigation"
import { getSessionUserWithOrg } from "@/lib/auth"
import OwnerOnboardingWrapper from "@/components/onboarding/owner-onboarding-wrapper"

export default async function OwnerOnboardingPage() {
  const session = await getSessionUserWithOrg()
  if (!session) redirect("/login")

  const { user } = session

  if (!user.primaryMode) redirect("/select-role")
  if (user.onboardingReady) redirect("/app")
  if (user.primaryMode !== "owner") redirect("/onboarding/employee")

  return <OwnerOnboardingWrapper mode="initial" />
}
