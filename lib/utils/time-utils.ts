// Utility functions for time calculations
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number)
  return hours * 60 + minutes
}

export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60) % 24
  const mins = minutes % 60
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`
}

export function calculateDuration(startTime: string, endTime: string): number {
  const start = timeToMinutes(startTime)
  let end = timeToMinutes(endTime)

  // Handle overnight shifts
  if (end < start) {
    end += 24 * 60
  }

  return end - start
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60

  if (hours === 0) return `${mins}м`
  if (mins === 0) return `${hours}ч`
  return `${hours}ч ${mins}м`
}

export function getTimeSlots(startHour = 4, endHour = 28): string[] {
  const slots: string[] = []
  for (let i = startHour; i < endHour; i++) {
    const hour = i % 24
    slots.push(`${hour.toString().padStart(2, "0")}:00`)
  }
  return slots
}

export function getWeekDays(date: Date): Date[] {
  const start = new Date(date)
  const day = start.getDay()
  const diff = start.getDate() - day + (day === 0 ? -6 : 1) // Monday as first day

  const monday = new Date(start.setDate(diff))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}
