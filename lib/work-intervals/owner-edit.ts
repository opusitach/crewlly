import { Prisma } from "@prisma/client"
import { syncWorkdayRevenueFromCashSessions } from "@/lib/cash/revenue-allocation"
import { syncWorkdayTipsFromCashSessions } from "@/lib/cash/tips-sync"
import { buildIntervalPaySnapshot } from "@/lib/work-intervals/close"
import { resolveEffectiveWorkIntervalStatus } from "@/lib/work-intervals/status"

type TransactionClient = Prisma.TransactionClient

type EmployeeNotificationInput = {
  organizationId: string
  userId: string
  title: string
  message: string
  payload?: Prisma.InputJsonValue
}

type ApplyOwnerEditedWorkIntervalTimeInput = {
  intervalId: string
  ownerUserId: string
  openedAt: Date
  closedAt: Date
  reason: string
  employeeNotification?: EmployeeNotificationInput | null
}

export class WorkIntervalOwnerEditError extends Error {
  status: number
  code: string

  constructor(message: string, options: { status: number; code: string }) {
    super(message)
    this.name = "WorkIntervalOwnerEditError"
    this.status = options.status
    this.code = options.code
  }
}

const OWNER_EDIT_INTERVAL_SELECT = {
  id: true,
  employeeId: true,
  status: true,
  startAt: true,
  endAt: true,
  openedAt: true,
  closedAt: true,
  breakMinutes: true,
  useCustomPay: true,
  revenueCents: true,
  conflictWithIntervalIds: true,
  timeEntry: {
    select: {
      clockInAt: true,
      clockOutAt: true,
    },
  },
  workday: {
    select: {
      id: true,
      status: true,
      locationId: true,
      organizationId: true,
      workDate: true,
    },
  },
} satisfies Prisma.WorkIntervalSelect

const RETURN_INTERVAL_SELECT = {
  id: true,
  workdayId: true,
  employeeId: true,
  positionId: true,
  startAt: true,
  endAt: true,
  status: true,
  openedAt: true,
  closedAt: true,
  breakMinutes: true,
  revenueCents: true,
  calculatedMinutesWorked: true,
  calculatedGrossPayCents: true,
  payCalculatedAt: true,
  timeEntry: {
    select: {
      id: true,
      clockInAt: true,
      clockOutAt: true,
      clockInPhotoUrl: true,
      clockOutPhotoUrl: true,
    },
  },
  workday: {
    select: {
      id: true,
      workDate: true,
      status: true,
    },
  },
  employee: {
    select: {
      id: true,
      user: {
        select: {
          fullName: true,
          avatarUrl: true,
        },
      },
    },
  },
  position: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.WorkIntervalSelect

async function recalculateCompletedWorkdayIntervalPayrollSnapshots(
  tx: TransactionClient,
  workdayId: string,
) {
  const intervals = await tx.workInterval.findMany({
    where: {
      workdayId,
      status: { not: "canceled" },
    },
    select: {
      id: true,
      status: true,
      conflictWithIntervalIds: true,
      openedAt: true,
      closedAt: true,
      timeEntry: {
        select: {
          clockInAt: true,
          clockOutAt: true,
        },
      },
    },
  })

  const recalculatedAt = new Date()
  let updatedIntervals = 0

  for (const interval of intervals) {
    const effectiveStatus = resolveEffectiveWorkIntervalStatus(interval)
    if (effectiveStatus !== "completed") continue

    const snapshot = await buildIntervalPaySnapshot(tx, interval.id)
    await tx.workInterval.update({
      where: { id: interval.id },
      data: {
        calculatedMinutesWorked: snapshot?.minutesWorked ?? null,
        calculatedGrossPayCents: snapshot?.grossPayCents ?? null,
        payCalculatedAt: snapshot ? recalculatedAt : null,
      },
    })
    updatedIntervals += 1
  }

  return updatedIntervals
}

export async function applyOwnerEditedWorkIntervalTime(
  tx: TransactionClient,
  input: ApplyOwnerEditedWorkIntervalTimeInput,
) {
  const interval = await tx.workInterval.findUnique({
    where: { id: input.intervalId },
    select: OWNER_EDIT_INTERVAL_SELECT,
  })

  if (!interval) {
    throw new WorkIntervalOwnerEditError("Смена не найдена", {
      status: 404,
      code: "INTERVAL_NOT_FOUND",
    })
  }

  if (interval.workday.status === "published") {
    throw new WorkIntervalOwnerEditError("Изменение времени недоступно для уже проверенной смены", {
      status: 409,
      code: "INTERVAL_ALREADY_REVIEWED",
    })
  }

  const effectiveStatus = resolveEffectiveWorkIntervalStatus(interval)
  if (effectiveStatus !== "completed") {
    throw new WorkIntervalOwnerEditError("Изменять фактическое время можно только у закрытой смены", {
      status: 409,
      code: "INTERVAL_NOT_COMPLETED",
    })
  }

  await tx.timeEntry.upsert({
    where: { workIntervalId: interval.id },
    create: {
      workIntervalId: interval.id,
      employeeId: interval.employeeId,
      clockInAt: input.openedAt,
      clockOutAt: input.closedAt,
    },
    update: {
      clockInAt: input.openedAt,
      clockOutAt: input.closedAt,
    },
  })

  await tx.workInterval.update({
    where: { id: interval.id },
    data: {
      openedAt: input.openedAt,
      closedAt: input.closedAt,
      calculatedMinutesWorked: null,
      calculatedGrossPayCents: null,
      payCalculatedAt: null,
    },
  })

  const revenueSync = await syncWorkdayRevenueFromCashSessions(tx, interval.workday.id)
  const tipsSync = await syncWorkdayTipsFromCashSessions(tx, {
    workdayId: interval.workday.id,
    locationId: interval.workday.locationId,
  })
  const recalculatedIntervals = await recalculateCompletedWorkdayIntervalPayrollSnapshots(tx, interval.workday.id)

  if (input.employeeNotification) {
    await tx.notification.create({
      data: {
        organizationId: input.employeeNotification.organizationId,
        userId: input.employeeNotification.userId,
        type: "shift",
        title: input.employeeNotification.title,
        message: input.employeeNotification.message,
        payload: input.employeeNotification.payload,
        status: "unread",
      },
    })
  }

  const updatedInterval = await tx.workInterval.findUnique({
    where: { id: interval.id },
    select: RETURN_INTERVAL_SELECT,
  })

  if (!updatedInterval) {
    throw new WorkIntervalOwnerEditError("Не удалось загрузить обновлённую смену", {
      status: 500,
      code: "UPDATED_INTERVAL_NOT_FOUND",
    })
  }

  return {
    interval: updatedInterval,
    revenueSync,
    tipsSync,
    recalculatedIntervals,
    reason: input.reason,
  }
}
