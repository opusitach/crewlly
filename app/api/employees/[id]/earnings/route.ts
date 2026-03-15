import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getOrganizationReadScope, getSessionUserWithOrg } from "@/lib/auth"
import { auditActorFromSession, logAuditEvent } from "@/lib/observability/audit"
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

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, context: RouteContext) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    logAuditEvent(request, {
      event_type: "employee.earnings.read",
      outcome: "denied",
      status: 401,
      route: "/api/employees/[id]/earnings",
      reason: "unauthorized",
    })
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: employeeId } = await context.params
  const readScope = await getOrganizationReadScope(session, {
    orgWidePermissions: ["payroll:view"],
  })
  if (readScope.scope === "none") {
    logAuditEvent(request, {
      event_type: "employee.earnings.read",
      outcome: "denied",
      status: 403,
      route: "/api/employees/[id]/earnings",
      actor: auditActorFromSession(session),
      target: {
        type: "employee",
        id: employeeId,
        organization_id: session.organization.id,
        employee_id: employeeId,
      },
      reason: "missing_payroll_view_access",
    })
    return NextResponse.json({ error: "Недостаточно прав для просмотра начислений" }, { status: 403 })
  }
  if (readScope.scope === "self" && readScope.employeeId !== employeeId) {
    logAuditEvent(request, {
      event_type: "employee.earnings.read",
      outcome: "denied",
      status: 403,
      route: "/api/employees/[id]/earnings",
      actor: auditActorFromSession(session),
      target: {
        type: "employee",
        id: employeeId,
        organization_id: session.organization.id,
        employee_id: employeeId,
      },
      reason: "not_own_employee_earnings",
    })
    return NextResponse.json({ error: "Недостаточно прав для просмотра начислений" }, { status: 403 })
  }

  const employee = await prisma.employee.findFirst({
    where: {
      id: employeeId,
      organizationId: session.organization.id,
    },
    select: {
      id: true,
    },
  })

  if (!employee) {
    logAuditEvent(request, {
      event_type: "employee.earnings.read",
      outcome: "failure",
      status: 404,
      route: "/api/employees/[id]/earnings",
      actor: auditActorFromSession(session),
      target: {
        type: "employee",
        id: employeeId,
        organization_id: session.organization.id,
        employee_id: employeeId,
      },
      reason: "employee_not_found",
    })
    return NextResponse.json({ error: "Сотрудник не найден" }, { status: 404 })
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

  logAuditEvent(request, {
    event_type: "employee.earnings.read",
    outcome: "success",
    status: 200,
    route: "/api/employees/[id]/earnings",
    actor: auditActorFromSession(session),
    target: {
      type: "employee",
      id: employee.id,
      organization_id: session.organization.id,
      employee_id: employee.id,
    },
    metadata: {
      access_scope: readScope.scope,
      result_count: result.items.length,
      date_from: dateFrom,
      date_to: dateTo,
    },
  })

  return NextResponse.json({
    data: result,
  })
}
