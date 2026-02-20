import { z } from "zod"
import timezones from "@/lib/constants/timezones.json"

export const DEFAULT_TIMEZONE = "Europe/Prague"
export const TIMEZONE_ERROR =
  "Неверная таймзона. Используйте формат IANA, например Europe/Prague"

const timezoneSet = new Set(timezones)
const timezoneLookup = new Map(timezones.map((tz) => [tz.toLowerCase(), tz]))
const legacyTimezoneAliases = new Map<string, string>([
  ["prague", DEFAULT_TIMEZONE],
  ["praha", DEFAULT_TIMEZONE],
  ["czech", DEFAULT_TIMEZONE],
  ["cz", DEFAULT_TIMEZONE],
  ["cet", DEFAULT_TIMEZONE],
  ["utc+1", DEFAULT_TIMEZONE],
  ["gmt+1", DEFAULT_TIMEZONE],
  ["utc+01", DEFAULT_TIMEZONE],
  ["gmt+01", DEFAULT_TIMEZONE],
  ["utc+1:00", DEFAULT_TIMEZONE],
  ["gmt+1:00", DEFAULT_TIMEZONE],
  ["utc+01:00", DEFAULT_TIMEZONE],
  ["gmt+01:00", DEFAULT_TIMEZONE],
])

export function normalizeTimezone(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (timezoneSet.has(trimmed)) return trimmed
  const lower = trimmed.toLowerCase()
  const mapped = timezoneLookup.get(lower)
  if (mapped) return mapped
  const legacy = legacyTimezoneAliases.get(lower)
  if (legacy) return legacy
  return trimmed
}

export function isValidTimeZone(value: string) {
  if (!value) return false
  if (timezoneSet.has(value)) return true
  if (timezoneLookup.has(value.toLowerCase())) return true
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value })
    return true
  } catch {
    return false
  }
}

export const timezoneSchema = z.preprocess(
  (value) => normalizeTimezone(value),
  z.string().refine(isValidTimeZone, {
    message: TIMEZONE_ERROR,
  }),
)
