export type WorkIntervalStatus = "scheduled" | "in_progress" | "canceled" | "completed" | "conflict"

type TimestampLike = Date | string | null | undefined

type TimeEntryLike<T extends TimestampLike = Date | null> = {
  clockInAt?: T
  clockOutAt?: T
} | null

export type WorkIntervalStatusSource<T extends TimestampLike = Date | null> = {
  status?: string | null
  openedAt?: T
  closedAt?: T
  conflictWithIntervalIds?: string[] | null
  timeEntry?: TimeEntryLike<T>
}

const hasTimestampValue = (value: TimestampLike) => {
  if (value == null) return false
  if (value instanceof Date) return !Number.isNaN(value.getTime())
  if (typeof value === "string") return value.trim().length > 0
  return false
}

export const resolveEffectiveWorkIntervalOpenedAt = <T extends TimestampLike>(
  input: WorkIntervalStatusSource<T>,
): T | null => {
  if (hasTimestampValue(input.openedAt)) {
    return (input.openedAt ?? null) as T
  }
  if (hasTimestampValue(input.timeEntry?.clockInAt)) {
    return (input.timeEntry?.clockInAt ?? null) as T
  }
  return null
}

export const resolveEffectiveWorkIntervalClosedAt = <T extends TimestampLike>(
  input: WorkIntervalStatusSource<T>,
): T | null => {
  if (hasTimestampValue(input.closedAt)) {
    return (input.closedAt ?? null) as T
  }
  if (hasTimestampValue(input.timeEntry?.clockOutAt)) {
    return (input.timeEntry?.clockOutAt ?? null) as T
  }
  return null
}

export const resolveEffectiveWorkIntervalStatus = <T extends TimestampLike>(
  input: WorkIntervalStatusSource<T>,
): WorkIntervalStatus => {
  const rawStatus = input.status ?? "scheduled"
  const hasClosedAt = hasTimestampValue(resolveEffectiveWorkIntervalClosedAt(input))
  const hasOpenedAt = hasTimestampValue(resolveEffectiveWorkIntervalOpenedAt(input))
  const hasConflicts = (input.conflictWithIntervalIds?.length ?? 0) > 0

  if (rawStatus === "canceled") return "canceled"
  if (hasClosedAt) return "completed"
  if (hasOpenedAt) return "in_progress"
  if (rawStatus === "completed") return "completed"
  if (rawStatus === "in_progress") return "in_progress"
  if (rawStatus === "conflict" || hasConflicts) return "conflict"
  return "scheduled"
}

export const isEffectivelyOpenedWorkInterval = <T extends TimestampLike>(input: WorkIntervalStatusSource<T>) =>
  resolveEffectiveWorkIntervalStatus(input) === "in_progress"

export const isEffectivelyClosedWorkInterval = <T extends TimestampLike>(input: WorkIntervalStatusSource<T>) => {
  const status = resolveEffectiveWorkIntervalStatus(input)
  return status === "completed" || status === "canceled"
}

export const isEffectivelyPlannedWorkInterval = <T extends TimestampLike>(input: WorkIntervalStatusSource<T>) => {
  const status = resolveEffectiveWorkIntervalStatus(input)
  return status === "scheduled" || status === "conflict"
}
