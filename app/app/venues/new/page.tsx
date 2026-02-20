import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/auth"
import OwnerOnboardingWrapper from "@/components/onboarding/owner-onboarding-wrapper"

export default async function NewVenuePage() {
  const user = await getSessionUser()
  if (!user) redirect("/login")
  if (!user.primaryMode) redirect("/select-role")
  if (user.primaryMode !== "owner") redirect("/app")
  if (!user.onboardingReady) redirect("/onboarding/owner")

  return <OwnerOnboardingWrapper mode="new-venue" />
}
