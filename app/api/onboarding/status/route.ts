import { NextResponse } from "next/server"
import { getSessionUserWithOrg } from "@/lib/auth"

export async function GET() {
  const session = await getSessionUserWithOrg()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { user, organization, accessRole } = session

  // Determine onboarding status based on onboarding flag
  let onboardingStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED"

  if (user.onboardingReady) {
    onboardingStatus = "COMPLETED"
  } else if (!user.primaryMode) {
    onboardingStatus = "NOT_STARTED"
  } else {
    onboardingStatus = "IN_PROGRESS"
  }

  return NextResponse.json({
    primaryMode: user.primaryMode,
    onboardingReady: user.onboardingReady,
    status: user.status,
    onboardingStatus,
    hasOrganization: !!organization,
    organization: organization
      ? {
          id: organization.id,
          name: organization.name,
        }
      : null,
    accessRole: accessRole
      ? {
          id: accessRole.id,
          key: accessRole.key,
          name: accessRole.name,
        }
      : null,
    // Legacy fields for backwards compatibility
    role: user.primaryMode === "owner" ? "OWNER" : user.primaryMode === "worker" ? "EMPLOYEE" : null,
  })
}
