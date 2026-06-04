import { formatDateInTimeZone, formatTimeInTimeZone } from "@/lib/utils/timezone"

export type ShiftDateBadge = {
  day: string
  month: string
  weekday: string
}

const parseShiftDate = (value: string) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  return parsed
}

export function formatShiftTimeRange(startAt: string, endAt: string, timeZone?: string | null, locale?: string) {
  const start = parseShiftDate(startAt)
  const end = parseShiftDate(endAt)

  if (!start || !end) return "—"

  return `${formatTimeInTimeZone(start, timeZone, "—", locale)} - ${formatTimeInTimeZone(end, timeZone, "—", locale)}`
}

export function formatShiftDateLine(startAt: string, timeZone?: string | null, locale?: string) {
  const date = parseShiftDate(startAt)
  const fallback = locale?.startsWith("en") ? "Date not set" : "Дата не указана"
  if (!date) return fallback

  const weekdayRaw = formatDateInTimeZone(date, timeZone, { weekday: "short" }, "", locale).replace(".", "")
  const weekday = weekdayRaw.length > 0 ? `${weekdayRaw.charAt(0).toUpperCase()}${weekdayRaw.slice(1)}` : ""
  const dayMonth = formatDateInTimeZone(date, timeZone, { day: "numeric", month: "long" }, fallback, locale)

  return weekday ? `${weekday}, ${dayMonth}` : dayMonth
}

export function getShiftDateBadge(startAt: string, timeZone?: string | null, locale?: string): ShiftDateBadge {
  const date = parseShiftDate(startAt)
  if (!date) {
    return {
      day: "--",
      month: "—",
      weekday: "—",
    }
  }

  const weekdayRaw = formatDateInTimeZone(date, timeZone, { weekday: "short" }, "—", locale).replace(".", "")

  return {
    day: formatDateInTimeZone(date, timeZone, { day: "2-digit" }, "--", locale),
    month: formatDateInTimeZone(date, timeZone, { month: "short" }, "—", locale).replace(".", ""),
    weekday: weekdayRaw.length > 0 ? `${weekdayRaw.charAt(0).toUpperCase()}${weekdayRaw.slice(1)}` : "—",
  }
}
