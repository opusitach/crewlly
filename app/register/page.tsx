import { redirect } from "next/navigation"
import RegistrationScreen from "@/components/onboarding/registration-screen"
import { getSessionUser } from "@/lib/auth"

export default async function RegisterPage() {
  const user = await getSessionUser()
  if (user) {
    if (!user.primaryMode) redirect("/select-role")
    if (!user.onboardingReady) {
      redirect(user.primaryMode === "owner" ? "/onboarding/owner" : "/onboarding/employee")
    }
    redirect("/app")
  }
  return <RegistrationScreen redirectTo="/select-role" />
}
