import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getSessionUser } from "@/lib/auth"
import { resolveOrganizationAccess, isOwnerOrManagerEffectiveRole } from "@/lib/organization-access"
import { PAY_COMPONENT_TYPES, normalizePayComponentsInput, type PayComponentInput } from "@/lib/pay-components"
import { ensurePercentRevenueCashBasis } from "@/lib/cash/revenue-basis"
import { DEFAULT_PHONE_ERROR_MESSAGE, getPhoneValidationError, normalizePhone } from "@/lib/validation/phone"
import { logInternalAction, INTERNAL_ACTIONS } from "@/lib/observability/internal-audit"

const payComponentSchema = z.object({
  componentType: z.enum(PAY_COMPONENT_TYPES),
  amountCents: z.number().int().optional().nullable(),
  rateBp: z.number().int().optional().nullable(),
  isActive: z.boolean().optional(),
  priority: z.number().int().optional(),
})

const employeeCreateSchema = z.object({
  organizationId: z.string().uuid(),
  locationId: z.string().uuid().optional(),
  fullName: z.string().min(1, "Имя обязательно"),
  email: z.string().email().optional().nullable(),
  phone: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine((value) => value == null || getPhoneValidationError(value) === null, DEFAULT_PHONE_ERROR_MESSAGE),
  positionIds: z.array(z.string().uuid()).optional(),
  payType: z.enum(["hourly", "fixed_shift", "percent_revenue"]).default("hourly"),
  defaultHourlyRateCents: z.number().int().optional(),
  defaultShiftRateCents: z.number().int().optional(),
  percentRevenueBp: z.number().int().optional(),
  payComponents: z.array(payComponentSchema).optional(),
})

const buildLegacyPayComponents = (payload: {
  payType: string
  defaultHourlyRateCents?: number
  defaultShiftRateCents?: number
  percentRevenueBp?: number
}): PayComponentInput[] => {
  const components: PayComponentInput[] = []
  if (payload.payType === "hourly" && payload.defaultHourlyRateCents != null) {
    components.push({ componentType: "hourly", amountCents: payload.defaultHourlyRateCents, rateBp: null })
  }
  if (payload.payType === "fixed_shift" && payload.defaultShiftRateCents != null) {
    components.push({ componentType: "fixed_shift", amountCents: payload.defaultShiftRateCents, rateBp: null })
  }
  if (payload.payType === "percent_revenue" && payload.percentRevenueBp != null) {
    components.push({ componentType: "percent_revenue", amountCents: null, rateBp: payload.percentRevenueBp })
  }
  return components
}

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

export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(request.url)
  const organizationId = url.searchParams.get("organizationId") ?? user.activeOrganizationId
  const locationId = url.searchParams.get("locationId")

  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required" }, { status: 400 })
  }

  const access = await resolveOrganizationAccess(user.id, organizationId)
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const whereClause: { organizationId: string; employeeLocations?: { some: { locationId: string } } } = {
    organizationId,
  }

  if (locationId) {
    whereClause.employeeLocations = {
      some: { locationId },
    }
  }

  const employees = await prisma.employee.findMany({
    where: whereClause,
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          avatarUrl: true,
          organizationMembers: {
            where: {
              organizationId,
              isActive: true,
            },
            select: {
              legacyRole: true,
              accessRole: {
                select: {
                  key: true,
                  name: true,
                },
              },
            },
            take: 1,
          },
        },
      },
      employeePositions: {
        include: { position: true },
        orderBy: { isPrimary: "desc" },
      },
      employeeLocations: {
        include: { location: true },
      },
      payComponents: {
        orderBy: { componentType: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  // Map to API response shape
  const mapped = employees.map((e) => {
    const membership = e.user.organizationMembers[0]
    const accessRoleKey = membership?.accessRole?.key ?? membership?.legacyRole ?? "worker"
    const accessRoleName =
      membership?.accessRole?.name ??
      (accessRoleKey === "owner" ? "Владелец" : accessRoleKey === "manager" ? "Менеджер" : "Сотрудник")

    return {
      id: e.id,
      organizationId: e.organizationId,
      userId: e.userId,
      employeeCode: e.employeeCode,
      employmentStatus: e.employmentStatus,
      payType: e.payType,
      defaultHourlyRateCents: e.defaultHourlyRateCents,
      defaultShiftRateCents: e.defaultShiftRateCents,
      percentRevenueBp: e.percentRevenueBp,
      payComponents: e.payComponents.map((component) => ({
        componentType: component.componentType,
        amountCents: component.amountCents,
        rateBp: component.rateBp,
        isActive: component.isActive,
        priority: component.priority,
      })),
      // From user
      fullName: e.user.fullName,
      name: e.user.fullName, // alias for UI compatibility
      email: e.user.email,
      phone: e.user.phone,
      avatarUrl: e.user.avatarUrl,
      accessRoleKey,
      accessRoleName,
      isManager: accessRoleKey === "manager",
      // Positions
      positions: e.employeePositions.map((ep) => ({
        id: ep.position.id,
        name: ep.position.name,
        isPrimary: ep.isPrimary,
      })),
      primaryPosition: e.employeePositions.find((ep) => ep.isPrimary)?.position || e.employeePositions[0]?.position,
      // Locations
      locations: e.employeeLocations.map((el) => ({
        id: el.location.id,
        name: el.location.name,
        isPrimary: el.isPrimary,
      })),
      // Legacy fields for UI compatibility
      role: mapPositionToLegacyRole(e.employeePositions.find((ep) => ep.isPrimary)?.position?.name),
      pay: {
        payType: mapPayType(e.payType),
        payValue: getPayValue(e),
        currency: "CZK",
      },
      createdAt: e.createdAt.toISOString(),
    }
  })

  return NextResponse.json({ data: mapped })
}

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const json = await request.json().catch(() => null)
  const parsed = employeeCreateSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const {
    organizationId,
    locationId,
    fullName,
    email,
    phone,
    positionIds,
    payType,
    defaultHourlyRateCents,
    defaultShiftRateCents,
    percentRevenueBp,
    payComponents,
  } = parsed.data

  const access = await resolveOrganizationAccess(user.id, organizationId)
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (!isOwnerOrManagerEffectiveRole(access)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const normalizedComponents = normalizePayComponentsInput(payComponents)
  const componentsToCreate: PayComponentInput[] = normalizedComponents.length > 0
    ? normalizedComponents
    : buildLegacyPayComponents({ payType, defaultHourlyRateCents, defaultShiftRateCents, percentRevenueBp })
  const validationError = validatePayComponents(componentsToCreate)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  const requiresPercentRevenueBasis =
    payType === "percent_revenue" ||
    componentsToCreate.some((component) => component.componentType === "percent_revenue" && component.isActive !== false)
  if (requiresPercentRevenueBasis) {
    const basisCheck = await prisma.$transaction((tx) =>
      ensurePercentRevenueCashBasis({
        tx,
        organizationId,
        locationId: locationId ?? undefined,
      }),
    )
    if (!basisCheck.ok) {
      return NextResponse.json({ error: basisCheck.error }, { status: 409 })
    }
  }

  // Check if user with email already exists
  let empUser = email
    ? await prisma.user.findUnique({ where: { email } })
    : null

  // Create user if needed
  if (!empUser) {
    const userEmail = email || `employee-${Date.now()}-${Math.random().toString(36).slice(2)}@crewlly.local`
    empUser = await prisma.user.create({
      data: {
        email: userEmail,
        fullName,
        phone: normalizePhone(phone),
        passwordHash: "",
        status: email ? "invited" : "active",
        primaryMode: "worker",
      },
    })
  }

  // Create employee record
  const employee = await prisma.employee.create({
    data: {
      organizationId,
      userId: empUser.id,
      payType,
      defaultHourlyRateCents,
      defaultShiftRateCents,
      percentRevenueBp,
      employmentStatus: "active",
    },
  })
  if (componentsToCreate.length > 0) {
    await prisma.employeePayComponent.createMany({
      data: componentsToCreate.map((component) => ({
        employeeId: employee.id,
        componentType: component.componentType,
        amountCents: component.amountCents ?? null,
        rateBp: component.rateBp ?? null,
        isActive: component.isActive ?? true,
        priority: component.priority ?? 0,
      })),
      skipDuplicates: true,
    })
  }

  // Link to location if provided
  if (locationId) {
    await prisma.employeeLocation.create({
      data: {
        employeeId: employee.id,
        locationId,
        isPrimary: true,
      },
    })
  } else {
    // Link to first location in organization
    const firstLocation = await prisma.location.findFirst({
      where: { organizationId, isActive: true },
    })
    if (firstLocation) {
      await prisma.employeeLocation.create({
        data: {
          employeeId: employee.id,
          locationId: firstLocation.id,
          isPrimary: true,
        },
      })
    }
  }

  // Link to positions if provided
  if (positionIds && positionIds.length > 0) {
    await prisma.employeePosition.createMany({
      data: positionIds.map((positionId, idx) => ({
        employeeId: employee.id,
        positionId,
        isPrimary: idx === 0,
      })),
    })
  }

  // Create organization membership
  const workerRole = await prisma.accessRole.findFirst({
    where: { organizationId, key: "worker" },
  })

  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: { organizationId, userId: empUser.id },
    },
    create: {
      organizationId,
      userId: empUser.id,
      accessRoleId: workerRole?.id,
      legacyRole: "worker",
      createdVia: "manual",
    },
    update: {},
  })

  void logInternalAction(access, {
    action: INTERNAL_ACTIONS.EMPLOYEE_CREATE,
    entityType: "employee",
    entityId: employee.id,
    metadata: { organizationId, fullName, payType },
  })

  return NextResponse.json({
    data: {
      id: employee.id,
      fullName: empUser.fullName,
      email: empUser.email,
      payType: employee.payType,
    },
  })
}

// Helper functions for legacy compatibility
function mapPositionToLegacyRole(positionName?: string): string {
  if (!positionName) return "waiter"
  const map: Record<string, string> = {
    "Официант": "waiter",
    "Бармен": "bartender",
    "Менеджер": "manager",
    "Повар": "cook",
    "Хостес": "host",
  }
  return map[positionName] || "waiter"
}

function mapPayType(payType: string): "hourly" | "fixed" | "percent" {
  const map: Record<string, "hourly" | "fixed" | "percent"> = {
    hourly: "hourly",
    fixed_shift: "fixed",
    percent_revenue: "percent",
  }
  return map[payType] || "hourly"
}

function getPayValue(employee: { payType: string; defaultHourlyRateCents?: number | null; defaultShiftRateCents?: number | null; percentRevenueBp?: number | null }): number {
  switch (employee.payType) {
    case "hourly":
      return (employee.defaultHourlyRateCents ?? 0) / 100
    case "fixed_shift":
      return (employee.defaultShiftRateCents ?? 0) / 100
    case "percent_revenue":
      return (employee.percentRevenueBp ?? 0) / 100
    default:
      return 0
  }
}
