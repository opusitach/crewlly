import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/auth"
import ShiftProcedurePage from "@/components/shift-procedure-page"

export default async function ShiftProcedureRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getSessionUser()
  if (!user) redirect("/login")
  if (!user.primaryMode) redirect("/select-role")
  if (!user.onboardingReady) {
    redirect(user.primaryMode === "owner" ? "/onboarding/owner" : "/onboarding/employee")
  }

  return <ShiftProcedurePage intervalId={id} />
}
