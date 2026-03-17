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

export function formatShiftTimeRange(startAt: string, endAt: string, timeZone?: string | null) {
  const start = parseShiftDate(startAt)
  const end = parseShiftDate(endAt)

  if (!start || !end) return "—"

  return `${formatTimeInTimeZone(start, timeZone, "—")} - ${formatTimeInTimeZone(end, timeZone, "—")}`
}

export function formatShiftDateLine(startAt: string, timeZone?: string | null) {
  const date = parseShiftDate(startAt)
  if (!date) return "Дата не указана"

  const weekdayRaw = formatDateInTimeZone(date, timeZone, { weekday: "short" }, "").replace(".", "")
  const weekday = weekdayRaw.length > 0 ? `${weekdayRaw.charAt(0).toUpperCase()}${weekdayRaw.slice(1)}` : ""
  const dayMonth = formatDateInTimeZone(date, timeZone, { day: "numeric", month: "long" }, "Дата не указана")

  return weekday ? `${weekday}, ${dayMonth}` : dayMonth
}

export function getShiftDateBadge(startAt: string, timeZone?: string | null): ShiftDateBadge {
  const date = parseShiftDate(startAt)
  if (!date) {
    return {
      day: "--",
      month: "—",
      weekday: "—",
    }
  }

  const weekdayRaw = formatDateInTimeZone(date, timeZone, { weekday: "short" }, "—").replace(".", "")

  return {
    day: formatDateInTimeZone(date, timeZone, { day: "2-digit" }, "--"),
    month: formatDateInTimeZone(date, timeZone, { month: "short" }, "—").replace(".", ""),
    weekday: weekdayRaw.length > 0 ? `${weekdayRaw.charAt(0).toUpperCase()}${weekdayRaw.slice(1)}` : "—",
  }
}
