"use server"

import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/auth"

export default async function Home() {
  const user = await getSessionUser()
  console.error("[page /] user", {
    id: user?.id,
    primaryMode: user?.primaryMode,
    onboardingReady: user?.onboardingReady,
  })
  if (!user) redirect("/login")
  if (!user.primaryMode) redirect("/select-role")
  if (!user.onboardingReady) {
    redirect(user.primaryMode === "owner" ? "/onboarding/owner" : "/onboarding/employee")
  }
  redirect("/app")
}
