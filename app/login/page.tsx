import { redirect } from "next/navigation"
import LoginScreen from "@/components/onboarding/login-screen"
import { getSessionUser } from "@/lib/auth"
import {
  getActiveInternalSession,
  hasAnyEnabledInternalGrant,
} from "@/lib/internal-access/session"

export default async function LoginPage() {
  const user = await getSessionUser()
  if (user) {
    if (!user.primaryMode) redirect("/select-role")
    if (!user.onboardingReady) {
      redirect(user.primaryMode === "owner" ? "/onboarding/owner" : "/onboarding/employee")
    }
    // Internal users with no active session and at least one enabled grant go to the selector.
    if (user.isInternal) {
      const active = await getActiveInternalSession(user.id)
      if (!active && (await hasAnyEnabledInternalGrant(user.id))) {
        redirect("/internal")
      }
    }
    redirect("/app")
  }
  return <LoginScreen redirectTo="/select-role" />
}
