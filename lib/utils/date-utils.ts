import {
  format,
  parse,
  addDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
} from "date-fns"
import { ru } from "date-fns/locale"
import type { DateRange } from "@/lib/types/shift"

export function formatDate(date: Date | string, formatStr = "yyyy-MM-dd"): string {
  const dateObj = typeof date === "string" ? parseDate(date) : date
  return format(dateObj, formatStr, { locale: ru })
}

export function parseDate(dateStr: string): Date {
  return parse(dateStr, "yyyy-MM-dd", new Date())
}

export function getWeekDays(date: Date): Date[] {
  const start = startOfWeek(date, { weekStartsOn: 1 }) // Monday
  const end = endOfWeek(date, { weekStartsOn: 1 })
  return eachDayOfInterval({ start, end })
}

export function getMonthDays(date: Date): Date[] {
  const start = startOfMonth(date)
  const end = endOfMonth(date)
  return eachDayOfInterval({ start, end })
}

export function getMonthCalendarDays(date: Date): Date[] {
  const monthStart = startOfMonth(date)
  const monthEnd = endOfMonth(date)
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  return eachDayOfInterval({ start: calendarStart, end: calendarEnd })
}

export function getDatesInRange(range: DateRange): string[] {
  const start = parseDate(range.start)
  const end = parseDate(range.end)
  const days = eachDayOfInterval({ start, end })
  return days.map((d) => formatDate(d))
}

export function isDateInRange(date: string, range: DateRange | null): boolean {
  if (!range) return false
  return date >= range.start && date <= range.end
}

export function calculateShiftDuration(startTime: string, endTime: string, breakMinutes: number): number {
  const [startHour, startMin] = startTime.split(":").map(Number)
  const [endHour, endMin] = endTime.split(":").map(Number)

  let totalMinutes = endHour * 60 + endMin - (startHour * 60 + startMin)

  // Handle overnight shifts
  if (totalMinutes < 0) {
    totalMinutes += 24 * 60
  }

  return Math.max(0, totalMinutes - breakMinutes)
}

export { isSameDay, isSameMonth, addDays }
