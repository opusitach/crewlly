import { NextResponse } from "next/server"
import { getSessionUserWithOrg } from "@/lib/auth"

export async function GET() {
  try {
    const session = await getSessionUserWithOrg()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { user, organization, accessRole, membership } = session

    // Get default location for the organization
    let defaultLocation = null
    if (organization) {
      const { prisma } = await import("@/lib/prisma")
      defaultLocation = await prisma.location.findFirst({
        where: { organizationId: organization.id, isActive: true },
        orderBy: { createdAt: "asc" },
      })
    }

    return NextResponse.json({
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        locale: user.locale,
        status: user.status,
        primaryMode: user.primaryMode,
        onboardingReady: user.onboardingReady,
      },
      organization: organization
        ? {
            id: organization.id,
            name: organization.name,
            timezone: organization.timezone,
            currency: organization.currency,
          }
        : null,
      accessRole: accessRole
        ? {
            id: accessRole.id,
            key: accessRole.key,
            name: accessRole.name,
          }
        : null,
      legacyRole: membership?.legacyRole ?? null,
      defaultLocation: defaultLocation
        ? {
            id: defaultLocation.id,
            name: defaultLocation.name,
          }
        : null,
    })
  } catch (error: unknown) {
    console.error("[auth/me] error", error)
    const message = error instanceof Error ? error.message : "Ошибка"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
