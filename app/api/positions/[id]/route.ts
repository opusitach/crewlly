import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSessionUserWithOrg, isOwnerOrManagerRole } from "@/lib/auth"

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
  locationId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().optional(),
})

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { id } = await context.params

  const position = await prisma.position.findUnique({ where: { id } })
  if (!position || position.organizationId !== session.organization.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({ data: position })
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!isOwnerOrManagerRole(session.membership)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id } = await context.params

  const json = await request.json().catch(() => null)
  const parsed = updateSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const position = await prisma.position.findUnique({ where: { id } })
  if (!position || position.organizationId !== session.organization.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const updated = await prisma.position.update({
    where: { id },
    data: {
      name: parsed.data.name ?? undefined,
      sortOrder: parsed.data.sortOrder ?? undefined,
      locationId: parsed.data.locationId === undefined ? undefined : parsed.data.locationId,
      isActive: parsed.data.isActive ?? undefined,
    },
  })

  return NextResponse.json({ data: updated })
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!isOwnerOrManagerRole(session.membership)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id } = await context.params

  const position = await prisma.position.findUnique({ where: { id } })
  if (!position || position.organizationId !== session.organization.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const updated = await prisma.position.update({
    where: { id },
    data: { isActive: false },
  })

  return NextResponse.json({ data: updated })
}
