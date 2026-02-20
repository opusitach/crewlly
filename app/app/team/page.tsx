import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/auth"
import TeamPageClient from "@/components/team-page-client"

export default async function TeamPage() {
  const user = await getSessionUser()
  if (!user) redirect("/login")
  if (!user.primaryMode) redirect("/select-role")
  if (!user.onboardingReady) {
    redirect(user.primaryMode === "owner" ? "/onboarding/owner" : "/onboarding/employee")
  }
  if (user.primaryMode !== "owner") redirect("/app")

  return <TeamPageClient />
}
