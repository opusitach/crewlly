import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSessionUserWithOrg, isOwnerOrManagerRole } from "@/lib/auth"
import { PAY_COMPONENT_TYPES, normalizePayComponentsInput, type PayComponentInput } from "@/lib/pay-components"
import { ensurePercentRevenueCashBasis } from "@/lib/cash/revenue-basis"

const componentSchema = z.object({
  componentType: z.enum(PAY_COMPONENT_TYPES),
  amountCents: z.number().int().optional().nullable(),
  rateBp: z.number().int().optional().nullable(),
  isActive: z.boolean().optional(),
  priority: z.number().int().optional(),
})

const payloadSchema = z.object({
  components: z.array(componentSchema).default([]),
})

type PrismaTx = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>

const validatePayComponents = (components: Array<{ componentType: string; amountCents?: number | null; rateBp?: number | null; isActive?: boolean }>) => {
  for (const component of components) {
    const isActive = component.isActive ?? true
    if (!isActive) continue
    if ((component.componentType === "hourly" || component.componentType === "fixed_shift") && component.amountCents == null) {
      return "amountCents is required for hourly and fixed_shift components"
    }
    if (component.componentType === "percent_revenue" && component.rateBp == null) {
      return "rateBp is required for percent_revenue components"
    }
  }
  return null
}

const buildComponentSnapshot = (
  components: Array<{ componentType: string; amountCents?: number | null; rateBp?: number | null; isActive?: boolean }>,
) => {
  const byType = new Map(components.map((component) => [component.componentType, component]))
  return PAY_COMPONENT_TYPES.map((type) => {
    const component = byType.get(type)
    if (!component) {
      return {
        componentType: type,
        isActive: false,
        amountCents: null,
        rateBp: null,
      }
    }
    const isActive = component.isActive ?? true
    return {
      componentType: type,
      isActive,
      amountCents: isActive ? component.amountCents ?? null : null,
      rateBp: isActive ? component.rateBp ?? null : null,
    }
  })
}

const hasPayComponentsChanged = (
  before: ReturnType<typeof buildComponentSnapshot>,
  after: ReturnType<typeof buildComponentSnapshot>,
) =>
  before.some((component, index) => {
    const next = after[index]
    if (component.componentType !== next.componentType) return true
    if (component.isActive !== next.isActive) return true
    if (component.amountCents !== next.amountCents) return true
    if (component.rateBp !== next.rateBp) return true
    return false
  })

const formatPayValue = (
  componentType: string,
  amountCents: number | null,
  rateBp: number | null,
  currency: string,
) => {
  if (componentType === "percent_revenue" && rateBp != null) {
    const percent = rateBp / 100
    const formatted = Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
    return `${formatted}%`
  }
  if (amountCents == null) return null
  const value = Math.round(amountCents / 100)
  if (componentType === "hourly") return `${value} ${currency}/ч`
  if (componentType === "fixed_shift") return `${value} ${currency} за смену`
  return `${value} ${currency}`
}

const buildPaySummary = (
  snapshot: ReturnType<typeof buildComponentSnapshot>,
  currency: string,
) => {
  const parts = snapshot
    .filter((component) => component.isActive)
    .map((component) =>
      formatPayValue(component.componentType, component.amountCents, component.rateBp, currency),
    )
    .filter((value): value is string => Boolean(value))

  if (parts.length === 0) return "не указана"
  return parts.join(" + ")
}

const applyIntervalPayComponents = async (
  tx: PrismaTx,
  workIntervalId: string,
  componentsInput: PayComponentInput[],
) => {
  const normalized = normalizePayComponentsInput(componentsInput)
  const componentsByType = new Map(normalized.map((component) => [component.componentType, component]))
  const missingTypes = PAY_COMPONENT_TYPES.filter((type) => !componentsByType.has(type))

  for (const component of componentsByType.values()) {
    await tx.workIntervalPayComponent.upsert({
      where: { workIntervalId_componentType: { workIntervalId, componentType: component.componentType } },
      create: {
        workIntervalId,
        componentType: component.componentType,
        amountCents: component.amountCents ?? null,
        rateBp: component.rateBp ?? null,
        isActive: component.isActive ?? true,
        priority: component.priority ?? 0,
      },
      update: {
        amountCents: component.amountCents ?? null,
        rateBp: component.rateBp ?? null,
        isActive: component.isActive ?? true,
        priority: component.priority ?? 0,
      },
    })
  }

  if (missingTypes.length > 0) {
    await tx.workIntervalPayComponent.updateMany({
      where: { workIntervalId, componentType: { in: missingTypes } },
      data: { isActive: false },
    })
  }
}

const resolveEmployeeId = (params?: { id?: string | string[] }, request?: Request) => {
  const raw = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params?.id?.[0] : undefined
  if (raw) return raw
  if (!request) return null
  const parts = new URL(request.url).pathname.split("/")
  return parts.length >= 4 ? parts[parts.length - 2] : null
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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

  const components = await prisma.employeePayComponent.findMany({
    where: { employeeId },
    orderBy: { componentType: "asc" },
  })

  return NextResponse.json({
    data: components.map((component) => ({
      componentType: component.componentType,
      amountCents: component.amountCents,
      rateBp: component.rateBp,
      isActive: component.isActive,
      priority: component.priority,
    })),
  })
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const organizationId = session.organization.id

  if (!isOwnerOrManagerRole(session.membership)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const employeeId = resolveEmployeeId(params, request)
  if (!employeeId || !z.string().uuid().safeParse(employeeId).success) {
    return NextResponse.json({ error: "Invalid employee id" }, { status: 400 })
  }

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, organizationId },
  })

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 })
  }

  const json = await request.json().catch(() => null)
  const parsed = payloadSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const normalized = normalizePayComponentsInput(parsed.data.components)
  const validationError = validatePayComponents(normalized)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  const requiresPercentRevenueBasis = normalized.some(
    (component) => component.componentType === "percent_revenue" && component.isActive !== false,
  )
  if (requiresPercentRevenueBasis) {
    const basisCheck = await prisma.$transaction((tx) =>
      ensurePercentRevenueCashBasis({
        tx,
        organizationId,
        employeeId,
      }),
    )
    if (!basisCheck.ok) {
      return NextResponse.json({ error: basisCheck.error }, { status: 409 })
    }
  }

  const existingComponents = await prisma.employeePayComponent.findMany({
    where: { employeeId },
    orderBy: { componentType: "asc" },
  })

  const componentsByType = new Map(normalized.map((component) => [component.componentType, component]))
  const missingTypes = PAY_COMPONENT_TYPES.filter((type) => !componentsByType.has(type))
  const beforeSnapshot = buildComponentSnapshot(existingComponents)
  const afterSnapshot = buildComponentSnapshot([
    ...normalized,
    ...missingTypes.map((type) => ({ componentType: type, isActive: false })),
  ])
  const payChanged = hasPayComponentsChanged(beforeSnapshot, afterSnapshot)
  const nextPayChangeCount = payChanged ? (employee.payChangeCount ?? 0) + 1 : employee.payChangeCount ?? 0
  const currency = session.organization.currency ?? "CZK"

  await prisma.$transaction(async (tx) => {
    if (payChanged) {
      const intervalsToSnapshot = await tx.workInterval.findMany({
        where: {
          employeeId,
          useCustomPay: false,
          payComponents: { none: { isActive: true } },
        },
        select: { id: true },
      })
      if (intervalsToSnapshot.length > 0) {
        const snapshotComponents: PayComponentInput[] = existingComponents
          .filter((component) => component.isActive)
          .map((component) => ({
            componentType: component.componentType,
            amountCents: component.amountCents,
            rateBp: component.rateBp,
            isActive: component.isActive,
            priority: component.priority,
          }))
        for (const interval of intervalsToSnapshot) {
          await applyIntervalPayComponents(tx, interval.id, snapshotComponents)
        }
      }
    }

    for (const component of componentsByType.values()) {
      await tx.employeePayComponent.upsert({
        where: { employeeId_componentType: { employeeId, componentType: component.componentType } },
        create: {
          employeeId,
          componentType: component.componentType,
          amountCents: component.amountCents ?? null,
          rateBp: component.rateBp ?? null,
          isActive: component.isActive ?? true,
          priority: component.priority ?? 0,
        },
        update: {
          amountCents: component.amountCents ?? null,
          rateBp: component.rateBp ?? null,
          isActive: component.isActive ?? true,
          priority: component.priority ?? 0,
        },
      })
    }

    if (missingTypes.length > 0) {
      await tx.employeePayComponent.updateMany({
        where: { employeeId, componentType: { in: missingTypes } },
        data: { isActive: false },
      })
    }

    if (payChanged) {
      await tx.employee.update({
        where: { id: employeeId },
        data: { payChangeCount: nextPayChangeCount },
      })
    }

    if (payChanged) {
      const beforeLabel = buildPaySummary(beforeSnapshot, currency)
      const afterLabel = buildPaySummary(afterSnapshot, currency)
      await tx.notification.create({
        data: {
          organizationId,
          userId: employee.userId,
          type: "system",
          title: "Изменение зарплаты",
          message: `Ваша зарплата была изменена с ${beforeLabel} на ${afterLabel}.`,
          payload: {
            view: "worker_profile",
          },
          status: "unread",
        },
      })
    }
  })

  const updated = await prisma.employeePayComponent.findMany({
    where: { employeeId },
    orderBy: { componentType: "asc" },
  })

  return NextResponse.json({
    data: updated.map((component) => ({
      componentType: component.componentType,
      amountCents: component.amountCents,
      rateBp: component.rateBp,
      isActive: component.isActive,
      priority: component.priority,
    })),
  })
}
