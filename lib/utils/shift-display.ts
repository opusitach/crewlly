const DEFAULT_LOCALE = "ru-RU"
const DEFAULT_TIMEZONE = "UTC"

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

const resolveTimeZone = (timeZone?: string | null) => {
  if (!timeZone) return DEFAULT_TIMEZONE

  try {
    new Intl.DateTimeFormat(DEFAULT_LOCALE, { timeZone })
    return timeZone
  } catch {
    return DEFAULT_TIMEZONE
  }
}

const createFormatter = (timeZone: string | null | undefined, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    ...options,
    timeZone: resolveTimeZone(timeZone),
  })

export function formatShiftTimeRange(startAt: string, endAt: string, timeZone?: string | null) {
  const start = parseShiftDate(startAt)
  const end = parseShiftDate(endAt)

  if (!start || !end) return "—"

  const formatter = createFormatter(timeZone, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })

  return `${formatter.format(start)} - ${formatter.format(end)}`
}

export function formatShiftDateLine(startAt: string, timeZone?: string | null) {
  const date = parseShiftDate(startAt)
  if (!date) return "Дата не указана"

  const weekdayRaw = createFormatter(timeZone, { weekday: "short" }).format(date).replace(".", "")
  const weekday = weekdayRaw.length > 0 ? `${weekdayRaw.charAt(0).toUpperCase()}${weekdayRaw.slice(1)}` : ""
  const dayMonth = createFormatter(timeZone, { day: "numeric", month: "long" }).format(date)

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

  const weekdayRaw = createFormatter(timeZone, { weekday: "short" }).format(date).replace(".", "")

  return {
    day: createFormatter(timeZone, { day: "2-digit" }).format(date),
    month: createFormatter(timeZone, { month: "short" }).format(date).replace(".", ""),
    weekday: weekdayRaw.length > 0 ? `${weekdayRaw.charAt(0).toUpperCase()}${weekdayRaw.slice(1)}` : "—",
  }
}
