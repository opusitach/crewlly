import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/auth"
import { resolveOrganizationAccess, isOwnerEffectiveRole } from "@/lib/organization-access"
import OwnerOnboardingWrapper from "@/components/onboarding/owner-onboarding-wrapper"

export default async function NewVenuePage() {
  const user = await getSessionUser()
  if (!user) redirect("/login")
  if (!user.primaryMode) redirect("/select-role")
  if (!user.onboardingReady) redirect("/onboarding/owner")

  const access = user.activeOrganizationId
    ? await resolveOrganizationAccess(user.id, user.activeOrganizationId, {
        useActiveInternalSession: user.isInternal,
      })
    : null

  if (!access || !isOwnerEffectiveRole(access)) redirect("/app")

  return <OwnerOnboardingWrapper mode="new-venue" />
}
