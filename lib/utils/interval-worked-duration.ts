import { computeIntervalMinutesWorked } from "@/lib/payroll/interval-compensation"

type IntervalWorkedTimeEntry = {
  clockInAt?: string | null
  clockOutAt?: string | null
}

export type IntervalWorkedDurationInput = {
  startAt: string
  endAt: string
  openedAt?: string | null
  closedAt?: string | null
  breakMinutes?: number | null
  calculatedMinutesWorked?: number | null
  timeEntry?: IntervalWorkedTimeEntry | null
}

const toValidDate = (value?: string | null) => {
  if (!value) return null

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

export const formatMinutesDuration = (minutes: number | null | undefined) => {
  if (minutes == null || !Number.isFinite(minutes)) return null

  const safeMinutes = Math.max(0, Math.round(minutes))
  const hours = Math.floor(safeMinutes / 60)
  const restMinutes = safeMinutes % 60

  if (hours === 0) return `${restMinutes} мин`
  if (restMinutes === 0) return `${hours} ч`
  return `${hours} ч ${restMinutes} мин`
}

export const resolveIntervalWorkedMinutes = (interval: IntervalWorkedDurationInput) => {
  if (
    typeof interval.calculatedMinutesWorked === "number" &&
    Number.isFinite(interval.calculatedMinutesWorked) &&
    interval.calculatedMinutesWorked >= 0
  ) {
    return Math.round(interval.calculatedMinutesWorked)
  }

  const startAt = toValidDate(interval.startAt)
  const endAt = toValidDate(interval.endAt)
  if (!startAt || !endAt) return null

  return computeIntervalMinutesWorked({
    interval: {
      startAt,
      endAt,
      openedAt: toValidDate(interval.openedAt),
      closedAt: toValidDate(interval.closedAt),
      breakMinutes: interval.breakMinutes ?? 0,
    },
    timeEntry: interval.timeEntry
      ? {
          clockInAt: toValidDate(interval.timeEntry.clockInAt),
          clockOutAt: toValidDate(interval.timeEntry.clockOutAt),
        }
      : null,
  }).minutesWorked
}

export const formatIntervalWorkedDuration = (interval: IntervalWorkedDurationInput) => {
  const minutesWorked = resolveIntervalWorkedMinutes(interval)
  return formatMinutesDuration(minutesWorked)
}
