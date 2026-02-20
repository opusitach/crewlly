import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSessionUserWithOrg } from "@/lib/auth"
import { timezoneSchema } from "@/lib/validation/timezone"

const orgUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  timezone: timezoneSchema.optional(),
  currency: z.string().optional(),
})

export async function GET() {
  const session = await getSessionUserWithOrg()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!session.organization) {
    return NextResponse.json({ data: null })
  }

  const org = await prisma.organization.findUnique({
    where: { id: session.organization.id },
    include: {
      locations: {
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
      },
      positions: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      },
      _count: {
        select: {
          employees: true,
          members: true,
        },
      },
    },
  })

  return NextResponse.json({ data: org })
}

export async function PUT(request: Request) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const json = await request.json().catch(() => null)
  const parsed = orgUpdateSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const org = await prisma.organization.update({
    where: { id: session.organization.id },
    data: parsed.data,
  })

  return NextResponse.json({ data: org })
}
