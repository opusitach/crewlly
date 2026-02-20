import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSessionUserWithOrg } from "@/lib/auth"

export async function GET() {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const [workShiftsOnReview, cashSessionsOnReview] = await Promise.all([
      prisma.workInterval.count({
        where: {
          status: "completed",
          workday: {
            organizationId: session.organization.id,
            status: { not: "published" },
          },
        },
      }),
      prisma.cashSession.count({
        where: {
          status: "closed",
          cashRegister: {
            location: {
              organizationId: session.organization.id,
            },
          },
        },
      }),
    ])

    return NextResponse.json({
      data: {
        workShiftsOnReview,
        cashSessionsOnReview,
        totalOnReview: workShiftsOnReview + cashSessionsOnReview,
      },
    })
  } catch (error) {
    console.error("[api/verifications/summary]", error)
    return NextResponse.json(
      {
        error: "Не удалось получить сводку проверки",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
