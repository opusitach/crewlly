import { z } from "zod"

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/
const ruDatePattern = /\b(\d{2})\.(\d{2})\.(\d{4})\b/
const cancelReasonPattern = /Причина:\s*(.+)$/u

const ownerCashTabSchema = z.enum(["work_shifts", "cash_sessions", "review_queue"])

const ownerShiftsTargetSchema = z.object({
  view: z.literal("owner_shifts"),
  workDate: z.string().regex(dateOnlyPattern).optional(),
  intervalId: z.string().optional().nullable(),
  preferCanceledInterval: z.boolean().optional(),
  cancelReason: z.string().optional(),
})

const ownerCashTargetSchema = z.object({
  view: z.literal("owner_cash"),
  cashTab: ownerCashTabSchema,
  workDate: z.string().regex(dateOnlyPattern).optional(),
  intervalId: z.string().optional().nullable(),
  cashSessionId: z.string().optional().nullable(),
})

const workerPlannerTargetSchema = z.object({
  view: z.literal("worker_planner"),
  workDate: z.string().regex(dateOnlyPattern),
  intervalId: z.string().optional().nullable(),
  openWeekView: z.boolean().optional(),
})

const workerMoneyTargetSchema = z.object({
  view: z.literal("worker_money"),
  fromDate: z.string().regex(dateOnlyPattern),
  toDate: z.string().regex(dateOnlyPattern),
})

const workerProfileTargetSchema = z.object({
  view: z.literal("worker_profile"),
})

export const notificationNavigationTargetSchema = z.discriminatedUnion("view", [
  ownerShiftsTargetSchema,
  ownerCashTargetSchema,
  workerPlannerTargetSchema,
  workerMoneyTargetSchema,
  workerProfileTargetSchema,
])

export type NotificationNavigationTarget = z.infer<typeof notificationNavigationTargetSchema>

export type NotificationNavigationSource = {
  title: string
  message: string
  payload?: unknown
}

export const parseNotificationNavigationTarget = (value: unknown): NotificationNavigationTarget | null => {
  const parsed = notificationNavigationTargetSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export const toNotificationDateOnly = (value: Date | string | null | undefined): string | null => {
  if (!value) return null
  if (typeof value === "string" && dateOnlyPattern.test(value)) return value

  const parsed = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

const extractWorkDateFromMessage = (message: string): string | undefined => {
  const match = ruDatePattern.exec(message)
  if (!match) return undefined
  const [, day, month, year] = match
  return `${year}-${month}-${day}`
}

const extractCancelReasonFromMessage = (message: string): string | undefined => {
  const match = cancelReasonPattern.exec(message)
  const reason = match?.[1]?.trim()
  return reason && reason.length > 0 ? reason : undefined
}

const isDateOnlyString = (value: unknown): value is string => typeof value === "string" && dateOnlyPattern.test(value)

const toMonthDateRange = (value: string) => {
  const [yearRaw, monthRaw] = value.split("-")
  const year = Number.parseInt(yearRaw, 10)
  const month = Number.parseInt(monthRaw, 10)
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null

  const fromDate = `${yearRaw}-${monthRaw}-01`
  const toDate = toNotificationDateOnly(new Date(Date.UTC(year, month, 0)))
  if (!toDate) return null

  return { fromDate, toDate }
}

const resolveWorkerMoneyTargetFromPayload = (payload: unknown): NotificationNavigationTarget | null => {
  if (!payload || typeof payload !== "object") return null

  const record = payload as Record<string, unknown>
  const fromDate =
    (isDateOnlyString(record.fromDate) ? record.fromDate : null) ??
    (isDateOnlyString(record.periodFrom) ? record.periodFrom : null)
  const toDate =
    (isDateOnlyString(record.toDate) ? record.toDate : null) ??
    (isDateOnlyString(record.periodTo) ? record.periodTo : null)

  if (fromDate && toDate) {
    return {
      view: "worker_money",
      fromDate,
      toDate,
    }
  }

  const effectiveDate = isDateOnlyString(record.effectiveDate) ? record.effectiveDate : null
  if (!effectiveDate) return null

  const monthRange = toMonthDateRange(effectiveDate)
  if (!monthRange) return null

  return {
    view: "worker_money",
    ...monthRange,
  }
}

export const resolveNotificationNavigationTarget = (
  notification: NotificationNavigationSource,
): NotificationNavigationTarget | null => {
  const payloadTarget = parseNotificationNavigationTarget(notification.payload)
  if (payloadTarget) return payloadTarget

  const workDate = extractWorkDateFromMessage(notification.message)

  switch (notification.title) {
    case "Открыта рабочая смена":
    case "Открыта кассовая смена":
      return {
        view: "owner_shifts",
        ...(workDate ? { workDate } : {}),
      }
    case "Отменена рабочая смена":
      return {
        view: "owner_shifts",
        ...(workDate ? { workDate } : {}),
        preferCanceledInterval: true,
        ...(extractCancelReasonFromMessage(notification.message)
          ? { cancelReason: extractCancelReasonFromMessage(notification.message) }
          : {}),
      }
    case "Закрыта рабочая смена":
      return {
        view: "owner_cash",
        cashTab: "work_shifts",
        ...(workDate ? { workDate } : {}),
      }
    case "Смена автоматически завершена":
      return {
        view: "owner_cash",
        cashTab: "review_queue",
        ...(workDate ? { workDate } : {}),
      }
    case "Закрыта кассовая смена":
      return {
        view: "owner_cash",
        cashTab: "review_queue",
        ...(workDate ? { workDate } : {}),
      }
    case "Создана смена":
      if (!workDate) return null
      return {
        view: "worker_planner",
        workDate,
        openWeekView: true,
      }
    case "Начислен бонус":
    case "Начислен штраф":
      return resolveWorkerMoneyTargetFromPayload(notification.payload)
    case "Изменение зарплаты":
      return {
        view: "worker_profile",
      }
    default:
      return null
  }
}
