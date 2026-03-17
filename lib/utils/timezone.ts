const DEFAULT_LOCALE = "ru-RU"
export const DEFAULT_TIMEZONE = "Europe/Prague"

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/
const timeValuePattern = /^([01]\d|2[0-3]):([0-5]\d)$/

type SupportedDateInput = Date | number | string

type ZonedDateParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()

const toValidDate = (value: SupportedDateInput | null | undefined) => {
  if (value == null) return null
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

const getFormatter = (
  locale: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
) => {
  const cacheKey = JSON.stringify([locale, timeZone, options])
  const existing = formatterCache.get(cacheKey)
  if (existing) return existing

  const formatter = new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone,
  })
  formatterCache.set(cacheKey, formatter)
  return formatter
}

export const resolveTimeZone = (timeZone?: string | null) => {
  const candidate = typeof timeZone === "string" && timeZone.trim().length > 0 ? timeZone.trim() : DEFAULT_TIMEZONE

  try {
    new Intl.DateTimeFormat(DEFAULT_LOCALE, { timeZone: candidate })
    return candidate
  } catch {
    return DEFAULT_TIMEZONE
  }
}

export const getZonedDateParts = (value: SupportedDateInput | null | undefined, timeZone?: string | null) => {
  const date = toValidDate(value)
  if (!date) return null

  const formatter = getFormatter("en-US-u-hc-h23", resolveTimeZone(timeZone), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })

  let year = Number.NaN
  let month = Number.NaN
  let day = Number.NaN
  let hour = Number.NaN
  let minute = Number.NaN
  let second = Number.NaN

  for (const part of formatter.formatToParts(date)) {
    if (part.type === "year") year = Number(part.value)
    if (part.type === "month") month = Number(part.value)
    if (part.type === "day") day = Number(part.value)
    if (part.type === "hour") hour = Number(part.value)
    if (part.type === "minute") minute = Number(part.value)
    if (part.type === "second") second = Number(part.value)
  }

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second)
  ) {
    return null
  }

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
  } satisfies ZonedDateParts
}

export const getTimeZoneOffsetMinutes = (value: SupportedDateInput | null | undefined, timeZone?: string | null) => {
  const date = toValidDate(value)
  const parts = getZonedDateParts(value, timeZone)
  if (!date || !parts) return null

  const zonedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return Math.round((zonedAsUtc - date.getTime()) / 60000)
}

const extractWorkDateParts = (workDate: Date | string) => {
  if (typeof workDate === "string") {
    const trimmed = workDate.trim()
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (!match) return null

    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
    }
  }

  if (!(workDate instanceof Date) || Number.isNaN(workDate.getTime())) return null

  return {
    year: workDate.getUTCFullYear(),
    month: workDate.getUTCMonth() + 1,
    day: workDate.getUTCDate(),
  }
}

export const combineDateAndTimeInTimeZone = (
  workDate: Date | string,
  timeValue: string,
  timeZone?: string | null,
) => {
  const dateParts = extractWorkDateParts(workDate)
  const timeMatch = timeValuePattern.exec(timeValue)
  if (!dateParts || !timeMatch) return null

  const hours = Number(timeMatch[1])
  const minutes = Number(timeMatch[2])
  const resolvedTimeZone = resolveTimeZone(timeZone)
  const desiredUtcMs = Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, hours, minutes, 0, 0)

  let utcMs = desiredUtcMs
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const offsetMinutes = getTimeZoneOffsetMinutes(utcMs, resolvedTimeZone)
    if (offsetMinutes == null) return null

    const nextUtcMs = desiredUtcMs - offsetMinutes * 60_000
    if (nextUtcMs === utcMs) break
    utcMs = nextUtcMs
  }

  const result = new Date(utcMs)
  const zonedResult = getZonedDateParts(result, resolvedTimeZone)
  if (
    !zonedResult ||
    zonedResult.year !== dateParts.year ||
    zonedResult.month !== dateParts.month ||
    zonedResult.day !== dateParts.day ||
    zonedResult.hour !== hours ||
    zonedResult.minute !== minutes
  ) {
    return null
  }

  return result
}

export const formatTimeInTimeZone = (
  value: SupportedDateInput | null | undefined,
  timeZone?: string | null,
  fallback = "-",
) => {
  const date = toValidDate(value)
  if (!date) return fallback

  return getFormatter(DEFAULT_LOCALE, resolveTimeZone(timeZone), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

export const formatTimeValue = (
  value: string | null | undefined,
  timeZone?: string | null,
  fallback = "--:--",
) => {
  if (!value) return fallback
  if (value.includes("T")) {
    return formatTimeInTimeZone(value, timeZone, fallback)
  }

  const trimmed = value.trim()
  const timeMatch = trimmed.match(/^([01]\d|2[0-3]):([0-5]\d)/)
  if (timeMatch) {
    return `${timeMatch[1]}:${timeMatch[2]}`
  }

  return trimmed.slice(0, 5) || fallback
}

export const formatDateInTimeZone = (
  value: SupportedDateInput | null | undefined,
  timeZone?: string | null,
  options?: Intl.DateTimeFormatOptions,
  fallback = "—",
) => {
  const date = toValidDate(value)
  if (!date) return fallback

  return getFormatter(DEFAULT_LOCALE, resolveTimeZone(timeZone), options ?? {}).format(date)
}
