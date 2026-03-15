import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSessionUserWithOrg, hasOrganizationActionAccess } from "@/lib/auth"
import { auditActorFromSession, logAuditEvent } from "@/lib/observability/audit"

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/

const payloadSchema = z.object({
  adjustmentType: z.enum(["bonus", "penalty"]),
  amount: z.coerce.number().positive().max(10_000_000),
  comment: z.string().trim().min(1).max(500),
  effectiveDate: z.string().regex(dateOnlyPattern),
  periodFrom: z.string().regex(dateOnlyPattern).optional(),
  periodTo: z.string().regex(dateOnlyPattern).optional(),
})

const formatMoney = (valueCents: number, currency: string | null | undefined) => {
  const safeCurrency = currency || "CZK"
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: safeCurrency,
      maximumFractionDigits: 0,
    }).format(valueCents / 100)
  } catch {
    return `${Math.round(valueCents / 100)} ${safeCurrency}`
  }
}

const toEffectiveDate = (value: string) => {
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10))
  return new Date(Date.UTC(year, month - 1, day))
}

const isAdjustmentStorageUnavailableError = (error: unknown) => {
  if (error instanceof TypeError) {
    return error.message.includes("create") || error.message.includes("findMany")
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2021" || error.code === "P2022"
  }

  if (!(error instanceof Error)) return false

  return (
    error.message.includes("employeeEarningAdjustment") ||
    error.message.includes("EmployeeEarningAdjustment") ||
    error.message.includes("employee_earning_adjustment")
  )
}

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    logAuditEvent(request, {
      event_type: "employee.earnings.adjustment.create",
      outcome: "denied",
      status: 401,
      route: "/api/employees/[id]/earnings/adjustments",
      reason: "unauthorized",
    })
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: employeeId } = await context.params
  const canManagePayroll = await hasOrganizationActionAccess(session, {
    permission: "payroll:manage",
    allowManagementRole: true,
  })
  if (!canManagePayroll) {
    logAuditEvent(request, {
      event_type: "employee.earnings.adjustment.create",
      outcome: "denied",
      status: 403,
      route: "/api/employees/[id]/earnings/adjustments",
      actor: auditActorFromSession(session),
      target: {
        type: "employee",
        id: employeeId,
        organization_id: session.organization.id,
        employee_id: employeeId,
      },
      reason: "missing_payroll_manage_access",
    })
    return NextResponse.json({ error: "Недостаточно прав для управления начислениями" }, { status: 403 })
  }

  const json = await request.json().catch(() => null)
  const parsed = payloadSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  if (parsed.data.periodFrom && parsed.data.periodTo && parsed.data.periodTo < parsed.data.periodFrom) {
    return NextResponse.json({ error: "Период начисления указан некорректно" }, { status: 400 })
  }

  const employee = await prisma.employee.findFirst({
    where: {
      id: employeeId,
      organizationId: session.organization.id,
    },
    select: {
      id: true,
      userId: true,
    },
  })

  if (!employee) {
    logAuditEvent(request, {
      event_type: "employee.earnings.adjustment.create",
      outcome: "failure",
      status: 404,
      route: "/api/employees/[id]/earnings/adjustments",
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

  const amountCents = Math.round(parsed.data.amount * 100)
  const effectiveDate = toEffectiveDate(parsed.data.effectiveDate)
  const isBonus = parsed.data.adjustmentType === "bonus"
  const title = isBonus ? "Начислен бонус" : "Начислен штраф"
  const message = `${title}: ${formatMoney(amountCents, session.organization.currency)}. Комментарий: ${parsed.data.comment}`

  if (!("employeeEarningAdjustment" in prisma) || !prisma.employeeEarningAdjustment) {
    return NextResponse.json(
      { error: "Бонусы и штрафы временно недоступны, пока Prisma Client не обновлен" },
      { status: 503 },
    )
  }

  let adjustment: Awaited<ReturnType<typeof prisma.employeeEarningAdjustment.create>>
  try {
    adjustment = await prisma.$transaction(async (tx) => {
      const created = await tx.employeeEarningAdjustment.create({
        data: {
          organizationId: session.organization.id,
          employeeId: employee.id,
          createdByUserId: session.user.id,
          adjustmentType: parsed.data.adjustmentType,
          amountCents,
          comment: parsed.data.comment,
          effectiveDate,
        },
      })

      await tx.notification.create({
        data: {
          organizationId: session.organization.id,
          userId: employee.userId,
          type: "system",
          title,
          message,
          payload: {
            view: "worker_money",
            fromDate: parsed.data.periodFrom ?? parsed.data.effectiveDate,
            toDate: parsed.data.periodTo ?? parsed.data.effectiveDate,
            adjustmentType: parsed.data.adjustmentType,
            effectiveDate: parsed.data.effectiveDate,
            amountCents,
          },
          status: "unread",
        },
      })

      return created
    })
  } catch (error) {
    if (!isAdjustmentStorageUnavailableError(error)) {
      throw error
    }

    logAuditEvent(request, {
      event_type: "employee.earnings.adjustment.create",
      outcome: "failure",
      status: 503,
      route: "/api/employees/[id]/earnings/adjustments",
      actor: auditActorFromSession(session),
      target: {
        type: "employee",
        id: employee.id,
        organization_id: session.organization.id,
        employee_id: employee.id,
      },
      reason: "adjustment_storage_unavailable",
    })

    return NextResponse.json(
      { error: "Бонусы и штрафы временно недоступны, пока база данных не обновлена" },
      { status: 503 },
    )
  }

  logAuditEvent(request, {
    event_type: "employee.earnings.adjustment.create",
    outcome: "success",
    status: 201,
    route: "/api/employees/[id]/earnings/adjustments",
    actor: auditActorFromSession(session),
    target: {
      type: "employee",
      id: employee.id,
      organization_id: session.organization.id,
      employee_id: employee.id,
    },
    metadata: {
      adjustment_id: adjustment.id,
      adjustment_type: parsed.data.adjustmentType,
      amount_cents: amountCents,
      effective_date: parsed.data.effectiveDate,
    },
  })

  return NextResponse.json(
    {
      data: {
        id: adjustment.id,
        adjustmentType: adjustment.adjustmentType,
        amountCents: adjustment.amountCents,
        comment: adjustment.comment,
        effectiveDate: parsed.data.effectiveDate,
        createdAt: adjustment.createdAt.toISOString(),
      },
    },
    { status: 201 },
  )
}
