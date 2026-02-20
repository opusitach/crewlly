import { redirect } from "next/navigation"
import LoginScreen from "@/components/onboarding/login-screen"
import { getSessionUser } from "@/lib/auth"

export default async function LoginPage() {
  const user = await getSessionUser()
  if (user) {
    if (!user.primaryMode) redirect("/select-role")
    if (!user.onboardingReady) {
      redirect(user.primaryMode === "owner" ? "/onboarding/owner" : "/onboarding/employee")
    }
    redirect("/app")
  }
  return <LoginScreen redirectTo="/select-role" />
}
