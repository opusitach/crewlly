import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSessionUserWithOrg, isOwnerOrManagerRole } from "@/lib/auth"

const payloadSchema = z.object({
  positionIds: z.array(z.string().uuid()).min(1, "At least one position is required"),
})

const resolveEmployeeId = (params?: { id?: string | string[] }, request?: Request) => {
  const raw = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params?.id?.[0] : undefined
  if (raw) return raw
  if (!request) return null
  const parts = new URL(request.url).pathname.split("/")
  return parts.length >= 4 ? parts[parts.length - 2] : null
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!isOwnerOrManagerRole(session.membership)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const employeeId = resolveEmployeeId(params, request)
  if (!employeeId || !z.string().uuid().safeParse(employeeId).success) {
    return NextResponse.json({ error: "Invalid employee id" }, { status: 400 })
  }

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, organizationId: session.organization.id },
  })

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 })
  }

  const json = await request.json().catch(() => null)
  const parsed = payloadSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const positionIds = parsed.data.positionIds
  const positions = await prisma.position.findMany({
    where: { id: { in: positionIds }, organizationId: session.organization.id, isActive: true },
  })

  if (positions.length !== positionIds.length) {
    return NextResponse.json({ error: "Некоторые должности не найдены" }, { status: 400 })
  }

  await prisma.$transaction(async (tx) => {
    await tx.employeePosition.deleteMany({ where: { employeeId } })
    await tx.employeePosition.createMany({
      data: positionIds.map((positionId, index) => ({
        employeeId,
        positionId,
        isPrimary: index === 0,
      })),
    })
  })

  const positionById = new Map(positions.map((pos) => [pos.id, pos]))
  const responsePositions = positionIds.map((positionId, index) => {
    const pos = positionById.get(positionId)
    return { id: positionId, name: pos?.name ?? "", isPrimary: index === 0 }
  })

  return NextResponse.json({ data: { positions: responsePositions } })
}
