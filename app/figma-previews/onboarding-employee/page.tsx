import type { Metadata } from "next"

import WorkerOnboardingWrapper from "@/components/onboarding/worker-onboarding-wrapper"

export const metadata: Metadata = {
  title: "Employee Onboarding Preview | Crewlly",
  description: "Preview route for Figma capture of the worker onboarding flow.",
}

export default function EmployeeOnboardingPreviewPage() {
  return <WorkerOnboardingWrapper />
}
