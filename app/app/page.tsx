import { redirect } from "next/navigation"
import { getSessionUserWithOrg, isOwnerOrManagerRole } from "@/lib/auth"
import OwnerDashboard from "@/components/owner-dashboard"
import WorkerDashboard from "@/components/worker-dashboard"

export default async function AppPage() {
  const session = await getSessionUserWithOrg()
  if (!session?.user) redirect("/login")
  if (!session.user.primaryMode) redirect("/select-role")
  if (!session.user.onboardingReady) {
    redirect(session.user.primaryMode === "owner" ? "/onboarding/owner" : "/onboarding/employee")
  }

  if (isOwnerOrManagerRole(session.membership)) {
    return <OwnerDashboard />
  }

  return <WorkerDashboard />
}
