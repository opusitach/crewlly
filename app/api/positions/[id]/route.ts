import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSessionUser } from "@/lib/auth"
import { resolveOrganizationAccess, isOwnerOrManagerEffectiveRole } from "@/lib/organization-access"
import { logInternalAction, INTERNAL_ACTIONS } from "@/lib/observability/internal-audit"

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
  locationId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().optional(),
})

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { id } = await context.params

  const position = await prisma.position.findUnique({ where: { id } })
  if (!position) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const access = await resolveOrganizationAccess(user.id, position.organizationId)
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({ data: position })
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { id } = await context.params

  const json = await request.json().catch(() => null)
  const parsed = updateSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const position = await prisma.position.findUnique({ where: { id } })
  if (!position) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const access = await resolveOrganizationAccess(user.id, position.organizationId)
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (!isOwnerOrManagerEffectiveRole(access)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
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

  void logInternalAction(access, {
    action: INTERNAL_ACTIONS.POSITION_UPDATE,
    entityType: "position",
    entityId: id,
    metadata: { changedFields: Object.keys(parsed.data) },
  })

  return NextResponse.json({ data: updated })
}

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { id } = await context.params

  const position = await prisma.position.findUnique({ where: { id } })
  if (!position) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const access = await resolveOrganizationAccess(user.id, position.organizationId)
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (!isOwnerOrManagerEffectiveRole(access)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const updated = await prisma.position.update({
    where: { id },
    data: { isActive: false },
  })

  void logInternalAction(access, {
    action: INTERNAL_ACTIONS.POSITION_DELETE,
    entityType: "position",
    entityId: id,
    metadata: { name: position.name },
  })

  return NextResponse.json({ data: updated })
}
