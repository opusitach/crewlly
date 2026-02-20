import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getSessionUserWithOrg } from "@/lib/auth"
import {
  PAY_COMPONENT_TYPES,
  normalizePayComponentsInput,
  type PayComponentInput,
} from "@/lib/pay-components"
import {
  WORK_INTERVAL_OVERLAP_ERROR_CODE,
  findOverlappingIntervals,
  loadIntervalConflictSummariesByIds,
  recomputeEmployeeConflictStatuses,
} from "@/lib/work-interval-conflicts"
import { getDefaultRuleCountsForPosition, isDefaultRulesetConfigured } from "@/lib/procedures/config"

const customPayTypeValues = ["hourly", "fixed_shift", "percent_revenue"] as const
type CustomPayTypeValue = (typeof customPayTypeValues)[number]
const POSITION_RULES_NOT_CONFIGURED_CODE = "POSITION_RULES_NOT_CONFIGURED"

const customPayTypeInputSchema = z
  .union([z.array(z.enum(customPayTypeValues)), z.enum(customPayTypeValues)])
  .optional()
  .nullable()

const payComponentSchema = z.object({
  componentType: z.enum(PAY_COMPONENT_TYPES),
  amountCents: z.number().int().optional().nullable(),
  rateBp: z.number().int().optional().nullable(),
  isActive: z.boolean().optional(),
  priority: z.number().int().optional(),
})

const intervalCreateSchema = z.object({
  workdayId: z.string().uuid(),
  employeeId: z.string().uuid(),
  positionId: z.string().uuid(),
  startAt: z.string(), // ISO datetime or HH:mm
  endAt: z.string(),
  breakMinutes: z.number().int().default(0),
  revenueCents: z.number().int().optional().nullable(),
  notes: z.string().optional().nullable(),
  useCustomPay: z.boolean().default(false),
  payComponents: z.array(payComponentSchema).optional(),
  customPayType: customPayTypeInputSchema,
  customHourlyRateCents: z.number().int().optional().nullable(),
  customShiftRateCents: z.number().int().optional().nullable(),
  customPercentRevenueBp: z.number().int().optional().nullable(),
  allowConflictStatus: z.boolean().optional().default(false),
})

const intervalUpdateSchema = intervalCreateSchema.partial().extend({
  id: z.string().uuid(),
  status: z.enum(["scheduled", "in_progress", "canceled", "completed", "conflict"]).optional(),
})

const normalizeCustomPayTypes = (
  value: CustomPayTypeValue | CustomPayTypeValue[] | null | undefined,
): CustomPayTypeValue[] | null | undefined => {
  if (value === undefined) return undefined
  if (value === null) return null
  return Array.isArray(value) ? value : [value]
}

const isCustomPayTypeValue = (value: string): value is CustomPayTypeValue =>
  (customPayTypeValues as readonly string[]).includes(value)

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

const buildLegacyIntervalComponents = (payload: {
  customPayType?: CustomPayTypeValue[] | null
  customHourlyRateCents?: number | null
  customShiftRateCents?: number | null
  customPercentRevenueBp?: number | null
}): PayComponentInput[] => {
  const components: PayComponentInput[] = []
  const payTypes = payload.customPayType ?? []
  if ((payTypes.includes("hourly") || payload.customHourlyRateCents != null) && payload.customHourlyRateCents != null) {
    components.push({ componentType: "hourly", amountCents: payload.customHourlyRateCents, rateBp: null })
  }
  if ((payTypes.includes("fixed_shift") || payload.customShiftRateCents != null) && payload.customShiftRateCents != null) {
    components.push({ componentType: "fixed_shift", amountCents: payload.customShiftRateCents, rateBp: null })
  }
  if ((payTypes.includes("percent_revenue") || payload.customPercentRevenueBp != null) && payload.customPercentRevenueBp != null) {
    components.push({ componentType: "percent_revenue", amountCents: null, rateBp: payload.customPercentRevenueBp })
  }
  return components
}

type PrismaTx = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>

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

const getActiveEmployeePayComponents = async (tx: PrismaTx, employeeId: string) =>
  tx.employeePayComponent.findMany({
    where: { employeeId, isActive: true },
    orderBy: { componentType: "asc" },
  })

const hhMmPattern = /^([01]\d|2[0-3]):([0-5]\d)$/

const parseDateTimeInput = (value: string, workDate: Date, fieldName: "startAt" | "endAt") => {
  if (value.includes("T")) {
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
      return { error: `Некорректный формат ${fieldName}. Ожидается ISO datetime или HH:mm.` as const }
    }
    return { value: parsed }
  }

  const match = hhMmPattern.exec(value)
  if (!match) {
    return { error: `Некорректный формат ${fieldName}. Ожидается ISO datetime или HH:mm.` as const }
  }

  const hours = Number(match[1])
  const minutes = Number(match[2])
  const parsed = new Date(workDate)
  parsed.setHours(hours, minutes, 0, 0)
  return { value: parsed }
}

const formatTimeLabel = (date: Date) => {
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${hours}:${minutes}`
}

const formatWorkdayDateLabel = (date: Date) =>
  date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })

const stringifyPrismaMeta = (meta: Prisma.PrismaClientKnownRequestError["meta"]) => {
  if (!meta) return undefined
  if (typeof meta === "string") return meta
  if (typeof meta === "object") return JSON.stringify(meta)
  return undefined
}

const buildApiErrorResponse = (
  error: unknown,
  fallbackMessage: string,
  context: "create" | "update" | "delete",
) => {
  console.error(`[api/intervals][${context}]`, error)

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = stringifyPrismaMeta(error.meta)
    if (error.code === "P2002") {
      return NextResponse.json(
        {
          error: "Конфликт данных при сохранении интервала.",
          code: error.code,
          details: meta ?? error.message,
        },
        { status: 409 },
      )
    }
    if (error.code === "P2003") {
      return NextResponse.json(
        {
          error: "Некорректная ссылка на связанную сущность (workday, employee или position).",
          code: error.code,
          hint: "Проверьте актуальность выбранных сотрудника, позиции и рабочего дня.",
          details: meta ?? error.message,
        },
        { status: 400 },
      )
    }
    if (error.code === "P2025") {
      return NextResponse.json(
        {
          error: "Связанная запись не найдена при сохранении интервала.",
          code: error.code,
          details: meta ?? error.message,
        },
        { status: 404 },
      )
    }
    if (error.code === "P2021" || error.code === "P2022") {
      return NextResponse.json(
        {
          error: "Схема базы данных не соответствует текущему коду.",
          code: error.code,
          hint: "Запустите prisma migrate deploy (или prisma db push для dev).",
          details: meta ?? error.message,
        },
        { status: 500 },
      )
    }
    return NextResponse.json(
      {
        error: `Ошибка базы данных (${error.code}).`,
        code: error.code,
        details: meta ?? error.message,
      },
      { status: 500 },
    )
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return NextResponse.json(
      {
        error: "Некорректные данные для сохранения интервала.",
        details: error.message,
      },
      { status: 400 },
    )
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return NextResponse.json(
      {
        error: "База данных недоступна.",
        details: error.message,
      },
      { status: 500 },
    )
  }

  const message = error instanceof Error ? error.message : fallbackMessage
  return NextResponse.json({ error: message, details: String(error) }, { status: 500 })
}

const buildOverlapError = (
  conflicts: Awaited<ReturnType<typeof findOverlappingIntervals>>,
  message = "У сотрудника уже есть смена в это время.",
) =>
  NextResponse.json(
    {
      error: message,
      code: WORK_INTERVAL_OVERLAP_ERROR_CODE,
      conflicts,
    },
    { status: 409 },
  )

const buildPositionRulesNotConfiguredError = (positionName?: string | null) =>
  NextResponse.json(
    {
      error: positionName
        ? `Для роли «${positionName}» нужно настроить default-правила открытия и закрытия.`
        : "Для выбранной роли нужно настроить default-правила открытия и закрытия.",
      code: POSITION_RULES_NOT_CONFIGURED_CODE,
    },
    { status: 409 },
  )

export async function GET(request: Request) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const organizationId = session.organization.id

  const url = new URL(request.url)
  const workdayId = url.searchParams.get("workdayId")
  const employeeId = url.searchParams.get("employeeId")
  const dateFrom = url.searchParams.get("dateFrom")
  const dateTo = url.searchParams.get("dateTo")

  const whereClause: {
    workday?: { organizationId: string; workDate?: { gte?: Date; lte?: Date } }
    workdayId?: string
    employeeId?: string
  } = {}

  if (workdayId) {
    whereClause.workdayId = workdayId
  } else {
    whereClause.workday = { organizationId }
    if (dateFrom || dateTo) {
      whereClause.workday.workDate = {}
      if (dateFrom) whereClause.workday.workDate.gte = new Date(dateFrom)
      if (dateTo) whereClause.workday.workDate.lte = new Date(dateTo)
    }
  }

  if (employeeId) {
    whereClause.employeeId = employeeId
  }

  const intervals = await prisma.workInterval.findMany({
    where: whereClause,
    include: {
      workday: {
        select: { id: true, workDate: true, locationId: true, status: true },
      },
      employee: {
        include: {
          user: {
            select: { fullName: true, avatarUrl: true },
          },
        },
      },
      position: true,
      timeEntry: true,
      payComponents: {
        where: { isActive: true },
        orderBy: [{ priority: "desc" }, { componentType: "asc" }],
      },
    },
    orderBy: { startAt: "asc" },
  })

  const conflictIds = Array.from(
    new Set(intervals.flatMap((interval) => interval.conflictWithIntervalIds ?? [])),
  )
  const conflictMap = await loadIntervalConflictSummariesByIds(prisma, {
    organizationId,
    ids: conflictIds,
  })

  const mapped = intervals.map((wi) => ({
    id: wi.id,
    workdayId: wi.workdayId,
    workday: {
      id: wi.workday.id,
      workDate: wi.workday.workDate.toISOString().split("T")[0],
      locationId: wi.workday.locationId,
      status: wi.workday.status,
    },
    employeeId: wi.employeeId,
    employee: {
      id: wi.employee.id,
      fullName: wi.employee.user.fullName,
      avatarUrl: wi.employee.user.avatarUrl,
    },
    positionId: wi.positionId,
    position: wi.position,
    startAt: wi.startAt.toISOString(),
    endAt: wi.endAt.toISOString(),
    startTime: wi.startAt.toTimeString().slice(0, 5),
    endTime: wi.endAt.toTimeString().slice(0, 5),
    status: wi.status,
    conflictWithIntervalIds: wi.conflictWithIntervalIds ?? [],
    conflicts:
      (wi.conflictWithIntervalIds ?? [])
        .map((conflictId) => conflictMap.get(conflictId))
        .filter((conflict): conflict is NonNullable<typeof conflict> => conflict != null) ?? [],
    openedAt: wi.openedAt?.toISOString() ?? null,
    closedAt: wi.closedAt?.toISOString() ?? null,
    cancelReason: wi.cancelReason ?? null,
    useCustomPay: wi.useCustomPay,
    payComponents: wi.payComponents.map((component) => ({
      componentType: component.componentType,
      amountCents: component.amountCents,
      rateBp: component.rateBp,
      isActive: component.isActive,
      priority: component.priority,
    })),
    customPayType: wi.customPayType,
    customHourlyRateCents: wi.customHourlyRateCents,
    customShiftRateCents: wi.customShiftRateCents,
    customPercentRevenueBp: wi.customPercentRevenueBp,
    breakMinutes: wi.breakMinutes,
    revenueCents: wi.revenueCents,
    calculatedMinutesWorked: wi.calculatedMinutesWorked,
    calculatedGrossPayCents: wi.calculatedGrossPayCents,
    payCalculatedAt: wi.payCalculatedAt?.toISOString() ?? null,
    notes: wi.notes,
    timeEntry: wi.timeEntry
      ? {
          id: wi.timeEntry.id,
          clockInAt: wi.timeEntry.clockInAt?.toISOString(),
          clockOutAt: wi.timeEntry.clockOutAt?.toISOString(),
          clockInPhotoUrl: wi.timeEntry.clockInPhotoUrl,
          clockOutPhotoUrl: wi.timeEntry.clockOutPhotoUrl,
        }
      : null,
  }))

  return NextResponse.json({ data: mapped })
}

export async function POST(request: Request) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const organizationId = session.organization.id
  try {
    const json = await request.json().catch(() => null)
    const parsed = intervalCreateSchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const data = parsed.data
    const allowConflictStatus = data.allowConflictStatus ?? false
    const customPayType = normalizeCustomPayTypes(data.customPayType) ?? []
    const normalizedPayComponents = normalizePayComponentsInput(data.payComponents)
    const intervalComponents = normalizedPayComponents.length > 0
      ? normalizedPayComponents
      : buildLegacyIntervalComponents({
          customPayType,
          customHourlyRateCents: data.customHourlyRateCents,
          customShiftRateCents: data.customShiftRateCents,
          customPercentRevenueBp: data.customPercentRevenueBp,
        })
    const validationError = data.useCustomPay ? validatePayComponents(intervalComponents) : null
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    // Verify workday belongs to organization
    const workday = await prisma.workday.findFirst({
      where: { id: data.workdayId, organizationId },
    })
    if (!workday) {
      return NextResponse.json({ error: "Рабочий день не найден" }, { status: 404 })
    }

    const [employee, position] = await Promise.all([
      prisma.employee.findFirst({
        where: { id: data.employeeId, organizationId },
        select: { id: true, userId: true },
      }),
      prisma.position.findFirst({
        where: { id: data.positionId, organizationId, isActive: true },
        select: { id: true, locationId: true, name: true },
      }),
    ])

    if (!employee) {
      return NextResponse.json({ error: "Сотрудник не найден в текущей организации" }, { status: 404 })
    }
    if (!position) {
      return NextResponse.json({ error: "Позиция не найдена или неактивна" }, { status: 404 })
    }
    const defaultRuleCounts = await getDefaultRuleCountsForPosition(prisma, position.id)
    if (!isDefaultRulesetConfigured(defaultRuleCounts)) {
      return buildPositionRulesNotConfiguredError(position.name ?? null)
    }
    if (position.locationId && position.locationId !== workday.locationId) {
      return NextResponse.json(
        {
          error: "Выбранная позиция недоступна для локации этого рабочего дня",
        },
        { status: 400 },
      )
    }

    const parsedStartAt = parseDateTimeInput(data.startAt, workday.workDate, "startAt")
    if ("error" in parsedStartAt) {
      return NextResponse.json({ error: parsedStartAt.error }, { status: 400 })
    }
    const parsedEndAt = parseDateTimeInput(data.endAt, workday.workDate, "endAt")
    if ("error" in parsedEndAt) {
      return NextResponse.json({ error: parsedEndAt.error }, { status: 400 })
    }

    let startAt = parsedStartAt.value
    let endAt = parsedEndAt.value

    // Handle overnight shifts for HH:mm payloads on same workday date.
    if (!data.endAt.includes("T") && endAt <= startAt) {
      endAt = new Date(endAt)
      endAt.setDate(endAt.getDate() + 1)
    }
    if (endAt <= startAt) {
      return NextResponse.json(
        {
          error: "Время окончания должно быть позже времени начала.",
        },
        { status: 400 },
      )
    }

    const overlaps = await findOverlappingIntervals(prisma, {
      organizationId,
      employeeId: data.employeeId,
      startAt,
      endAt,
    })
    if (overlaps.length > 0 && !allowConflictStatus) {
      return buildOverlapError(overlaps)
    }

    const intervalResult = await prisma.$transaction(async (tx) => {
      const [employeeLocationCount, employeePositionCount] = await Promise.all([
        tx.employeeLocation.count({ where: { employeeId: data.employeeId } }),
        tx.employeePosition.count({ where: { employeeId: data.employeeId } }),
      ])

      // Keep employee relations consistent with selected shift location and position.
      await tx.employeeLocation.upsert({
        where: {
          employeeId_locationId: {
            employeeId: data.employeeId,
            locationId: workday.locationId,
          },
        },
        create: {
          employeeId: data.employeeId,
          locationId: workday.locationId,
          isPrimary: employeeLocationCount === 0,
        },
        update: {},
      })
      await tx.employeePosition.upsert({
        where: {
          employeeId_positionId: {
            employeeId: data.employeeId,
            positionId: data.positionId,
          },
        },
        create: {
          employeeId: data.employeeId,
          positionId: data.positionId,
          isPrimary: employeePositionCount === 0,
        },
        update: {},
      })

      const created = await tx.workInterval.create({
        data: {
          workdayId: data.workdayId,
          employeeId: data.employeeId,
          positionId: data.positionId || null,
          startAt,
          endAt,
          status: "scheduled",
          conflictWithIntervalIds: [],
          breakMinutes: data.breakMinutes,
          revenueCents: data.revenueCents ?? null,
          notes: data.notes || null,
          useCustomPay: data.useCustomPay,
          customPayType,
          customHourlyRateCents: data.customHourlyRateCents,
          customShiftRateCents: data.customShiftRateCents,
          customPercentRevenueBp: data.customPercentRevenueBp,
          createdByUserId: session.user.id,
        },
      })

      if (data.useCustomPay) {
        await applyIntervalPayComponents(tx, created.id, intervalComponents)
      } else {
        const employeeComponents = await getActiveEmployeePayComponents(tx, data.employeeId)
        await applyIntervalPayComponents(tx, created.id, employeeComponents)
      }

      await recomputeEmployeeConflictStatuses(tx, {
        organizationId,
        employeeId: data.employeeId,
      })

      if (employee.userId !== session.user.id) {
        const positionLabel = position.name?.trim() ? ` (${position.name.trim()})` : ""
        await tx.notification.create({
          data: {
            organizationId,
            userId: employee.userId,
            type: "shift",
            title: "Создана смена",
            message: `Вам назначили смену${positionLabel} на ${formatWorkdayDateLabel(workday.workDate)}, ${formatTimeLabel(startAt)}–${formatTimeLabel(endAt)}.`,
            status: "unread",
          },
        })
      }

      const interval = await tx.workInterval.findUnique({
        where: { id: created.id },
        include: {
          employee: {
            include: {
              user: { select: { fullName: true } },
            },
          },
          position: true,
          payComponents: {
            where: { isActive: true },
            orderBy: [{ priority: "desc" }, { componentType: "asc" }],
          },
        },
      })

      const conflicts = await loadIntervalConflictSummariesByIds(tx, {
        organizationId,
        ids: interval?.conflictWithIntervalIds ?? [],
      })

      return { interval, conflicts }
    })

    const interval = intervalResult.interval
    const intervalConflicts =
      (interval?.conflictWithIntervalIds ?? [])
        .map((conflictId) => intervalResult.conflicts.get(conflictId))
        .filter((conflict): conflict is NonNullable<typeof conflict> => conflict != null) ?? []

    return NextResponse.json({
      data: {
        id: interval?.id,
        workdayId: interval?.workdayId,
        employeeId: interval?.employeeId,
        positionId: interval?.positionId,
        startAt: interval?.startAt.toISOString(),
        endAt: interval?.endAt.toISOString(),
        startTime: interval?.startAt.toTimeString().slice(0, 5),
        endTime: interval?.endAt.toTimeString().slice(0, 5),
        status: interval?.status,
        conflictWithIntervalIds: interval?.conflictWithIntervalIds ?? [],
        conflicts: intervalConflicts,
        cancelReason: interval?.cancelReason ?? null,
        useCustomPay: interval?.useCustomPay,
        payComponents: interval?.payComponents.map((component) => ({
          componentType: component.componentType,
          amountCents: component.amountCents,
          rateBp: component.rateBp,
          isActive: component.isActive,
          priority: component.priority,
        })) ?? [],
        customPayType: interval?.customPayType ?? [],
        customHourlyRateCents: interval?.customHourlyRateCents ?? null,
        customShiftRateCents: interval?.customShiftRateCents ?? null,
        customPercentRevenueBp: interval?.customPercentRevenueBp ?? null,
        revenueCents: interval?.revenueCents ?? null,
        calculatedMinutesWorked: interval?.calculatedMinutesWorked ?? null,
        calculatedGrossPayCents: interval?.calculatedGrossPayCents ?? null,
        payCalculatedAt: interval?.payCalculatedAt?.toISOString() ?? null,
        employee: interval?.employee
          ? {
              id: interval.employee.id,
              fullName: interval.employee.user.fullName,
            }
          : null,
        position: interval?.position ?? null,
      },
    })
  } catch (error) {
    return buildApiErrorResponse(error, "Не удалось создать рабочий интервал.", "create")
  }
}

export async function PUT(request: Request) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const organizationId = session.organization.id
  try {
    const json = await request.json().catch(() => null)
    const parsed = intervalUpdateSchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const { id, ...updateData } = parsed.data

    // Verify interval exists and belongs to organization
    const existing = await prisma.workInterval.findFirst({
      where: { id },
      include: { workday: true },
    })

    if (!existing || existing.workday.organizationId !== organizationId) {
      return NextResponse.json({ error: "Интервал не найден" }, { status: 404 })
    }

    let targetWorkday = existing.workday
    if (updateData.workdayId && updateData.workdayId !== existing.workdayId) {
      const nextWorkday = await prisma.workday.findFirst({
        where: { id: updateData.workdayId, organizationId },
      })
      if (!nextWorkday) {
        return NextResponse.json({ error: "Рабочий день не найден" }, { status: 404 })
      }
      targetWorkday = nextWorkday
    }

    const nextEmployeeId = updateData.employeeId ?? existing.employeeId
    const nextPositionId = updateData.positionId ?? existing.positionId

    if (updateData.employeeId) {
      const employee = await prisma.employee.findFirst({
        where: { id: updateData.employeeId, organizationId },
        select: { id: true },
      })
      if (!employee) {
        return NextResponse.json({ error: "Сотрудник не найден в текущей организации" }, { status: 404 })
      }
    }

    if (nextPositionId && (updateData.positionId !== undefined || updateData.workdayId !== undefined)) {
      const position = await prisma.position.findFirst({
        where: { id: nextPositionId, organizationId, isActive: true },
        select: { id: true, locationId: true, name: true },
      })
      if (!position) {
        return NextResponse.json({ error: "Позиция не найдена или неактивна" }, { status: 404 })
      }
      if (updateData.positionId !== undefined) {
        const defaultRuleCounts = await getDefaultRuleCountsForPosition(prisma, position.id)
        if (!isDefaultRulesetConfigured(defaultRuleCounts)) {
          return buildPositionRulesNotConfiguredError(position.name ?? null)
        }
      }
      if (position.locationId && position.locationId !== targetWorkday.locationId) {
        return NextResponse.json(
          {
            error: "Выбранная позиция недоступна для локации этого рабочего дня",
          },
          { status: 400 },
        )
      }
    }

    // Parse and validate times
    let nextStartAt = existing.startAt
    if (updateData.startAt !== undefined) {
      const parsedStartAt = parseDateTimeInput(updateData.startAt, targetWorkday.workDate, "startAt")
      if ("error" in parsedStartAt) {
        return NextResponse.json({ error: parsedStartAt.error }, { status: 400 })
      }
      nextStartAt = parsedStartAt.value
    }

    let nextEndAt = existing.endAt
    if (updateData.endAt !== undefined) {
      const parsedEndAt = parseDateTimeInput(updateData.endAt, targetWorkday.workDate, "endAt")
      if ("error" in parsedEndAt) {
        return NextResponse.json({ error: parsedEndAt.error }, { status: 400 })
      }
      nextEndAt = parsedEndAt.value
      if (!updateData.endAt.includes("T") && nextEndAt <= nextStartAt) {
        nextEndAt = new Date(nextEndAt)
        nextEndAt.setDate(nextEndAt.getDate() + 1)
      }
    }

    if (nextEndAt <= nextStartAt) {
      return NextResponse.json(
        {
          error: "Время окончания должно быть позже времени начала.",
        },
        { status: 400 },
      )
    }

    const dataToUpdate: Record<string, unknown> = { ...updateData }
    delete dataToUpdate.allowConflictStatus
    const payComponentsInput = updateData.payComponents
    delete dataToUpdate.payComponents
    const normalizedPayComponents = normalizePayComponentsInput(payComponentsInput)
    const hasPayInput =
      updateData.useCustomPay !== undefined ||
      updateData.customPayType !== undefined ||
      updateData.customHourlyRateCents !== undefined ||
      updateData.customShiftRateCents !== undefined ||
      updateData.customPercentRevenueBp !== undefined ||
      payComponentsInput !== undefined
    const affectsPayCalculation =
      updateData.employeeId !== undefined ||
      updateData.startAt !== undefined ||
      updateData.endAt !== undefined ||
      updateData.breakMinutes !== undefined ||
      updateData.revenueCents !== undefined ||
      hasPayInput

    if (updateData.customPayType !== undefined) {
      const normalizedCustomPayType = normalizeCustomPayTypes(updateData.customPayType)
      dataToUpdate.customPayType = normalizedCustomPayType ?? []
    }

    if (updateData.startAt !== undefined) {
      dataToUpdate.startAt = nextStartAt
    }
    if (updateData.endAt !== undefined) {
      dataToUpdate.endAt = nextEndAt
    }

    const nextUseCustomPay = updateData.useCustomPay ?? existing.useCustomPay
    const customPayType: CustomPayTypeValue[] = updateData.customPayType !== undefined
      ? normalizeCustomPayTypes(updateData.customPayType) ?? []
      : (existing.customPayType ?? []).filter(isCustomPayTypeValue)
    const intervalComponents = normalizedPayComponents.length > 0
      ? normalizedPayComponents
      : buildLegacyIntervalComponents({
          customPayType,
          customHourlyRateCents: updateData.customHourlyRateCents ?? existing.customHourlyRateCents,
          customShiftRateCents: updateData.customShiftRateCents ?? existing.customShiftRateCents,
          customPercentRevenueBp: updateData.customPercentRevenueBp ?? existing.customPercentRevenueBp,
        })
    if (hasPayInput && nextUseCustomPay) {
      const validationError = validatePayComponents(intervalComponents)
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 })
      }
    }

    const nextStatus = updateData.status ?? existing.status
    if (nextStatus === "scheduled") {
      const overlaps = await findOverlappingIntervals(prisma, {
        organizationId,
        employeeId: nextEmployeeId,
        startAt: nextStartAt,
        endAt: nextEndAt,
        excludeIntervalId: id,
      })
      if (overlaps.length > 0) {
        return buildOverlapError(overlaps)
      }
    }

    if (affectsPayCalculation) {
      dataToUpdate.calculatedMinutesWorked = null
      dataToUpdate.calculatedGrossPayCents = null
      dataToUpdate.payCalculatedAt = null
    }

    const intervalResult = await prisma.$transaction(async (tx) => {
      const updated = await tx.workInterval.update({
        where: { id },
        data: dataToUpdate,
      })

      const employeeIdChanged =
        updateData.employeeId !== undefined && updateData.employeeId !== existing.employeeId
      const switchingToStandard = updateData.useCustomPay === false && existing.useCustomPay === true
      const existingComponents = await tx.workIntervalPayComponent.findMany({
        where: { workIntervalId: updated.id, isActive: true },
      })
      const hasExistingSnapshot = existingComponents.length > 0
      const shouldRefreshStandard =
        !nextUseCustomPay && (switchingToStandard || employeeIdChanged || !hasExistingSnapshot)

      if (hasPayInput || shouldRefreshStandard) {
        if (nextUseCustomPay) {
          await applyIntervalPayComponents(tx, updated.id, intervalComponents)
        } else if (shouldRefreshStandard) {
          const employeeComponents = await getActiveEmployeePayComponents(
            tx,
            updateData.employeeId ?? existing.employeeId,
          )
          await applyIntervalPayComponents(tx, updated.id, employeeComponents)
        }
      }

      const employeesToRecompute = Array.from(new Set([existing.employeeId, updated.employeeId]))
      for (const employeeId of employeesToRecompute) {
        await recomputeEmployeeConflictStatuses(tx, {
          organizationId,
          employeeId,
        })
      }

      const interval = await tx.workInterval.findUnique({
        where: { id: updated.id },
        include: {
          employee: {
            include: { user: { select: { fullName: true } } },
          },
          position: true,
          payComponents: {
            where: { isActive: true },
            orderBy: [{ priority: "desc" }, { componentType: "asc" }],
          },
        },
      })

      const conflicts = await loadIntervalConflictSummariesByIds(tx, {
        organizationId,
        ids: interval?.conflictWithIntervalIds ?? [],
      })

      return { interval, conflicts }
    })

    const interval = intervalResult.interval
    const intervalConflicts =
      (interval?.conflictWithIntervalIds ?? [])
        .map((conflictId) => intervalResult.conflicts.get(conflictId))
        .filter((conflict): conflict is NonNullable<typeof conflict> => conflict != null) ?? []

    return NextResponse.json({
      data: {
        id: interval?.id,
        workdayId: interval?.workdayId,
        employeeId: interval?.employeeId,
        positionId: interval?.positionId,
        startAt: interval?.startAt.toISOString(),
        endAt: interval?.endAt.toISOString(),
        status: interval?.status,
        conflictWithIntervalIds: interval?.conflictWithIntervalIds ?? [],
        conflicts: intervalConflicts,
        cancelReason: interval?.cancelReason ?? null,
        useCustomPay: interval?.useCustomPay,
        payComponents: interval?.payComponents.map((component) => ({
          componentType: component.componentType,
          amountCents: component.amountCents,
          rateBp: component.rateBp,
          isActive: component.isActive,
          priority: component.priority,
        })) ?? [],
        customPayType: interval?.customPayType ?? [],
        customHourlyRateCents: interval?.customHourlyRateCents ?? null,
        customShiftRateCents: interval?.customShiftRateCents ?? null,
        customPercentRevenueBp: interval?.customPercentRevenueBp ?? null,
        revenueCents: interval?.revenueCents ?? null,
        calculatedMinutesWorked: interval?.calculatedMinutesWorked ?? null,
        calculatedGrossPayCents: interval?.calculatedGrossPayCents ?? null,
        payCalculatedAt: interval?.payCalculatedAt?.toISOString() ?? null,
      },
    })
  } catch (error) {
    return buildApiErrorResponse(error, "Не удалось обновить рабочий интервал.", "update")
  }
}

export async function DELETE(request: Request) {
  const session = await getSessionUserWithOrg()
  if (!session || !session.organization) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const organizationId = session.organization.id

  const url = new URL(request.url)
  const id = url.searchParams.get("id")

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 })
  }

  // Verify interval exists and belongs to organization
  const existing = await prisma.workInterval.findFirst({
    where: { id },
    include: { workday: true },
  })

  if (!existing || existing.workday.organizationId !== organizationId) {
    return NextResponse.json({ error: "Интервал не найден" }, { status: 404 })
  }

  await prisma.$transaction(async (tx) => {
    await tx.workInterval.delete({ where: { id } })
    await recomputeEmployeeConflictStatuses(tx, {
      organizationId,
      employeeId: existing.employeeId,
    })
  })

  return NextResponse.json({ success: true })
}
