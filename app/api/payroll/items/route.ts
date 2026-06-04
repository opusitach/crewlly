import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSessionUser, getUserEmployee } from "@/lib/auth"
import { resolveOrganizationAccess, isOwnerOrManagerEffectiveRole } from "@/lib/organization-access"

const querySchema = z.object({
  employeeId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
})

export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const organizationId = user.activeOrganizationId
  if (!organizationId) {
    return NextResponse.json({ error: "Organization not selected" }, { status: 400 })
  }

  const access = await resolveOrganizationAccess(user.id, organizationId)
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const url = new URL(request.url)
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  let employeeId = parsed.data.employeeId
  if (!employeeId) {
    const employee = await getUserEmployee(user.id, organizationId)
    employeeId = employee?.id
  }

  if (!employeeId) {
    return NextResponse.json({ data: [] })
  }

  if (!isOwnerOrManagerEffectiveRole(access)) {
    const employee = await getUserEmployee(user.id, organizationId)
    if (!employee || employee.id !== employeeId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  const items = await prisma.payrollItem.findMany({
    where: {
      employeeId,
      payrollRun: { organizationId: access.organizationId },
    },
    include: {
      payrollRun: true,
    },
    orderBy: {
      payrollRun: { periodEnd: "desc" },
    },
    take: parsed.data.limit ?? 6,
  })

  const mapped = items.map((item) => ({
    id: item.id,
    employeeId: item.employeeId,
    minutesWorked: item.minutesWorked,
    grossPayCents: item.grossPayCents,
    tipsCents: item.tipsCents,
    totalPayoutCents: item.totalPayoutCents,
    payrollRun: {
      id: item.payrollRun.id,
      periodStart: item.payrollRun.periodStart.toISOString().split("T")[0],
      periodEnd: item.payrollRun.periodEnd.toISOString().split("T")[0],
      status: item.payrollRun.status,
    },
    createdAt: item.createdAt.toISOString(),
  }))

  return NextResponse.json({ data: mapped })
}
