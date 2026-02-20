"use client"

import { useRouter } from "next/navigation"
import WorkerOnboarding from "@/components/onboarding/worker-onboarding"

export default function WorkerOnboardingWrapper() {
  const router = useRouter()
  return <WorkerOnboarding onComplete={() => router.push("/app")} />
}

