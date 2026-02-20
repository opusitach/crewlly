import { redirect } from "next/navigation"
import { getSessionUserWithOrg } from "@/lib/auth"
import WorkerOnboardingWrapper from "@/components/onboarding/worker-onboarding-wrapper"

export default async function EmployeeOnboardingPage() {
  const session = await getSessionUserWithOrg()
  if (!session) redirect("/login")

  const { user } = session

  if (!user.primaryMode) redirect("/select-role")
  if (user.onboardingReady) redirect("/app")
  if (user.primaryMode !== "worker") redirect("/onboarding/owner")

  return <WorkerOnboardingWrapper />
}
