import type { Metadata } from "next"

import OwnerOnboardingWrapper from "@/components/onboarding/owner-onboarding-wrapper"

export const metadata: Metadata = {
  title: "Owner Onboarding Preview | Crewlly",
  description: "Preview route for Figma capture of the owner onboarding flow.",
}

export default function OwnerOnboardingPreviewPage() {
  return <OwnerOnboardingWrapper mode="initial" />
}
