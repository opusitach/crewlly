import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/auth"
import OwnerDashboard from "@/components/owner-dashboard"
import WorkerDashboard from "@/components/worker-dashboard"

export default async function AppPage() {
  const user = await getSessionUser()
  if (!user) redirect("/login")
  if (!user.primaryMode) redirect("/select-role")
  if (!user.onboardingReady) {
    redirect(user.primaryMode === "owner" ? "/onboarding/owner" : "/onboarding/employee")
  }

  if (user.primaryMode === "owner") {
    return <OwnerDashboard />
  }

  return <WorkerDashboard />
}
