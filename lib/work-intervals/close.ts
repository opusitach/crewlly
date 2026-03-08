import { Prisma } from "@prisma/client"
import { computeIntervalPayrollSnapshot } from "@/lib/payroll/interval-compensation"
import { syncCashSessionFromWorkdayProcedures } from "@/lib/cash/session-sync"
import { syncWorkdayRevenueFromCashSessions } from "@/lib/cash/revenue-allocation"
import { syncWorkdayTipsFromCashSessions } from "@/lib/cash/tips-sync"
import { notifyOrganizationOwners } from "@/lib/notifications/owner-events"

const HOURS_TO_MS = 60 * 60 * 1000

export const AUTO_CLOSE_AFTER_HOURS = 24
export const AUTO_CLOSE_AFTER_MS = AUTO_CLOSE_AFTER_HOURS * HOURS_TO_MS
export const AUTO_CLOSE_REASON = `Смена автоматически завершена системой после ${AUTO_CLOSE_AFTER_HOURS} часов в статусе in_progress.`

type TransactionClient = Prisma.TransactionClient

type LoadPayComponentsInput = {
  intervalId: string
  employeeId: string
  useCustomPay: boolean
}

type IntervalCloseNotificationInput = {
  organizationId: string
  title: string
  message: string
  payload?: unknown
  excludeUserId?: string | null
}

type FinalizeWorkIntervalCloseInput = {
  intervalId: string
  workdayId: string
  locationId: string
  closedAt: Date
  closedByOwnerId?: string | null
  closeOverrideReason?: string | null
  notification?: IntervalCloseNotificationInput | null
  syncWorkday?: boolean
}

type IntervalAutoCloseAnchor = {
  startAt: Date
  openedAt?: Date | null
  timeEntry?: {
    clockInAt?: Date | null
  } | null
}

const loadPayComponentsForSnapshot = async (tx: TransactionClient, input: LoadPayComponentsInput) => {
  if (input.useCustomPay) {
    const intervalComponents = await tx.workIntervalPayComponent.findMany({
      where: { workIntervalId: input.intervalId, isActive: true },
      orderBy: [{ priority: "desc" }, { componentType: "asc" }],
    })
    return { intervalComponents, employeeComponents: [] }
  }

  const employeeComponents = await tx.employeePayComponent.findMany({
    where: { employeeId: input.employeeId, isActive: true },
    orderBy: [{ priority: "desc" }, { componentType: "asc" }],
  })
  return { intervalComponents: [], employeeComponents }
}

export const isProceduresSchemaMissing = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  (error.code === "P2021" || error.code === "P2022")

export function resolveWorkIntervalAutoCloseAt(input: IntervalAutoCloseAnchor) {
  const anchor = input.openedAt ?? input.timeEntry?.clockInAt ?? input.startAt
  return new Date(anchor.getTime() + AUTO_CLOSE_AFTER_MS)
}

export async function buildIntervalPaySnapshot(
  tx: TransactionClient,
  intervalId: string,
  options?: { closedAtOverride?: Date | null },
) {
  const intervalForCalc = await tx.workInterval.findUnique({
    where: { id: intervalId },
    select: {
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
      timeEntry: {
        select: {
          clockInAt: true,
          clockOutAt: true,
        },
      },
    },
  })

  if (!intervalForCalc) return null

  const { intervalComponents, employeeComponents } = await loadPayComponentsForSnapshot(tx, {
    intervalId: intervalForCalc.id,
    employeeId: intervalForCalc.employeeId,
    useCustomPay: intervalForCalc.useCustomPay,
  })

  const effectiveClosedAt = intervalForCalc.timeEntry?.clockOutAt ?? options?.closedAtOverride ?? intervalForCalc.closedAt

  return computeIntervalPayrollSnapshot({
    interval: {
      startAt: intervalForCalc.startAt,
      endAt: intervalForCalc.endAt,
      openedAt: intervalForCalc.openedAt,
      closedAt: effectiveClosedAt,
      breakMinutes: intervalForCalc.breakMinutes,
      status: intervalForCalc.status,
      useCustomPay: intervalForCalc.useCustomPay,
      revenueCents: intervalForCalc.revenueCents,
    },
    timeEntry: intervalForCalc.timeEntry,
    intervalComponents: intervalComponents.map((component) => ({
      componentType: component.componentType,
      amountCents: component.amountCents,
      rateBp: component.rateBp,
      isActive: component.isActive,
    })),
    employeeComponents: employeeComponents.map((component) => ({
      componentType: component.componentType,
      amountCents: component.amountCents,
      rateBp: component.rateBp,
      isActive: component.isActive,
    })),
  })
}

export async function finalizeWorkIntervalClose(tx: TransactionClient, input: FinalizeWorkIntervalCloseInput) {
  const timeEntry = await tx.timeEntry.findUnique({
    where: { workIntervalId: input.intervalId },
    select: {
      clockInAt: true,
      clockOutAt: true,
    },
  })

  const closedAt = timeEntry?.clockOutAt ?? input.closedAt

  if (timeEntry?.clockInAt && !timeEntry.clockOutAt) {
    await tx.timeEntry.update({
      where: { workIntervalId: input.intervalId },
      data: {
        clockOutAt: closedAt,
      },
    })
  }

  const snapshot = await buildIntervalPaySnapshot(tx, input.intervalId, { closedAtOverride: closedAt })

  const interval = await tx.workInterval.update({
    where: { id: input.intervalId },
    data: {
      status: "completed",
      closedAt,
      closedByOwnerId: input.closedByOwnerId,
      closeOverrideReason: input.closeOverrideReason,
      calculatedMinutesWorked: snapshot?.minutesWorked ?? null,
      calculatedGrossPayCents: snapshot?.grossPayCents ?? null,
      payCalculatedAt: snapshot ? new Date() : null,
    },
  })

  if (input.syncWorkday !== false) {
    await syncCashSessionFromWorkdayProcedures(tx, {
      workdayId: input.workdayId,
      locationId: input.locationId,
    })
    await syncWorkdayRevenueFromCashSessions(tx, input.workdayId)
    await syncWorkdayTipsFromCashSessions(tx, {
      workdayId: input.workdayId,
      locationId: input.locationId,
    })
  }

  if (input.notification) {
    await notifyOrganizationOwners(tx, {
      ...input.notification,
      type: "shift",
    })
  }

  return {
    interval,
    snapshot,
    closedAt,
  }
}
