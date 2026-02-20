import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSessionUserWithOrg, isOwnerOrManagerRole } from "@/lib/auth"
import { getDefaultRuleSetupByPosition, isDefaultRulesetConfigured } from "@/lib/procedures/config"

const positionCreateSchema = z.object({
  organizationId: z.string().uuid(),
  locationId: z.string().uuid().optional().nullable(),
  name: z.string().min(1, "Название обязательно"),
  sortOrder: z.number().int().default(0),
})

export async function GET(request: Request) {
  const session = await getSessionUserWithOrg()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(request.url)
  const organizationId = url.searchParams.get("organizationId") || session.organization?.id
  const locationId = url.searchParams.get("locationId")

  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required" }, { status: 400 })
  }

  // Verify access
  if (session.organization?.id !== organizationId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 })
  }

  const whereClause: { organizationId: string; isActive: boolean; locationId?: string | null } = {
    organizationId,
    isActive: true,
  }

  if (locationId) {
    whereClause.locationId = locationId
  }

  const positions = await prisma.position.findMany({
    where: whereClause,
    orderBy: { sortOrder: "asc" },
  })

  const setupByPositionId = await getDefaultRuleSetupByPosition(
    prisma,
    positions.map((position) => position.id),
  )

  return NextResponse.json({
    data: positions.map((position) => {
      const counts = setupByPositionId.get(position.id) ?? { OPEN: 0, CLOSE: 0 }
      const isConfigured = isDefaultRulesetConfigured(counts)
      return {
        ...position,
        defaultOpenRulesCount: counts.OPEN,
        defaultCloseRulesCount: counts.CLOSE,
        needsRulesSetup: !isConfigured,
      }
    }),
  })
}

export async function POST(request: Request) {
  const session = await getSessionUserWithOrg()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!isOwnerOrManagerRole(session.membership)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const json = await request.json().catch(() => null)
  const parsed = positionCreateSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { organizationId, locationId, name, sortOrder } = parsed.data

  // Verify access
  if (session.organization?.id !== organizationId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 })
  }

  // Check for duplicate name
  const existing = await prisma.position.findFirst({
    where: { organizationId, name },
  })

  if (existing) {
    return NextResponse.json({ error: "Должность с таким названием уже существует" }, { status: 409 })
  }

  const position = await prisma.position.create({
    data: {
      organizationId,
      locationId: locationId || null,
      name,
      sortOrder,
    },
  })

  return NextResponse.json({ data: position })
}
