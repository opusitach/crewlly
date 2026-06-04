import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/auth"
import { resolveOrganizationAccess, isOwnerOrManagerEffectiveRole } from "@/lib/organization-access"
import OwnerDashboard from "@/components/owner-dashboard"
import WorkerDashboard from "@/components/worker-dashboard"
import {
  getActiveInternalSession,
  hasAnyEnabledInternalGrant,
} from "@/lib/internal-access/session"

export default async function AppPage() {
  const user = await getSessionUser()
  if (!user) redirect("/login")
  if (!user.primaryMode) redirect("/select-role")
  if (!user.onboardingReady) {
    redirect(user.primaryMode === "owner" ? "/onboarding/owner" : "/onboarding/employee")
  }

  // Internal users: route based on their active internal session.
  // No active session AND they have an enabled grant → send them to the selector.
  // Without any enabled grant, they fall through to the regular flow (membership-only).
  if (user.isInternal) {
    const activeSession = await getActiveInternalSession(user.id)
    if (!activeSession) {
      if (await hasAnyEnabledInternalGrant(user.id)) {
        redirect("/internal")
      }
    }
  }

  // For internal users, the access context follows their active session's accessLevel.
  const access = user.activeOrganizationId
    ? await resolveOrganizationAccess(user.id, user.activeOrganizationId, {
        useActiveInternalSession: user.isInternal,
      })
    : null

  if (access && isOwnerOrManagerEffectiveRole(access)) {
    return <OwnerDashboard />
  }

  return <WorkerDashboard />
}
