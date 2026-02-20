"use client"

import { useRouter } from "next/navigation"
import OwnerOnboarding from "@/components/onboarding/owner-onboarding"

type OwnerOnboardingWrapperProps = {
  mode?: "initial" | "new-venue"
}

export default function OwnerOnboardingWrapper({ mode = "initial" }: OwnerOnboardingWrapperProps) {
  const router = useRouter()
  return <OwnerOnboarding mode={mode} onComplete={() => router.push("/app")} />
}
