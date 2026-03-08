import { redirect } from "next/navigation"
import { getSessionUserWithOrg, isOwnerRole } from "@/lib/auth"
import OwnerOnboardingWrapper from "@/components/onboarding/owner-onboarding-wrapper"

export default async function NewVenuePage() {
  const session = await getSessionUserWithOrg()
  if (!session?.user) redirect("/login")
  if (!session.user.primaryMode) redirect("/select-role")
  if (!session.user.onboardingReady) redirect("/onboarding/owner")
  if (!isOwnerRole(session.membership)) redirect("/app")

  return <OwnerOnboardingWrapper mode="new-venue" />
}
