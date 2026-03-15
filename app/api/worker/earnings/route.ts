import { NextResponse } from "next/server"
import { z } from "zod"
import { getSessionUserWithOrg, getUserEmployee } from "@/lib/auth"
import { computeEmployeeEarnings } from "@/lib/payroll/earnings"

const querySchema = z.object({
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

const emptySummary = (currency: string | null) => ({
  totalGrossCents: 0,
  totalSalaryCents: 0,
  totalTipsCents: 0,
  totalBonusCents: 0,
  totalPenaltyCents: 0,
  totalAdjustmentsCents: 0,
  totalAccruedCents: 0,
  totalMinutesWorked: 0,
  shiftsCount: 0,
  adjustmentCount: 0,
  currency,
})

export async function GET(request: Request) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const employee = await getUserEmployee(session.user.id, session.organization.id)
  if (!employee) {
    return NextResponse.json({
      data: {
        summary: emptySummary(session.organization.currency ?? null),
        items: [],
      },
    })
  }

  const url = new URL(request.url)
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { dateFrom, dateTo, limit } = parsed.data
  if (dateFrom && dateTo && dateTo < dateFrom) {
    return NextResponse.json({ error: "dateTo must be >= dateFrom" }, { status: 400 })
  }

  const result = await computeEmployeeEarnings({
    organizationId: session.organization.id,
    employeeId: employee.id,
    organizationTimezone: session.organization.timezone ?? "UTC",
    organizationCurrency: session.organization.currency ?? null,
    dateFrom,
    dateTo,
    limit,
  })

  return NextResponse.json({
    data: result,
  })
}
