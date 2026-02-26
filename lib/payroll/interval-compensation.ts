import type { PayComponentType } from "@/lib/pay-components"

type PayComponentRecord = {
  componentType: PayComponentType
  amountCents: number | null
  rateBp: number | null
  isActive?: boolean | null
}

type IntervalTimeRecord = {
  startAt: Date
  endAt: Date
  openedAt?: Date | null
  closedAt?: Date | null
  breakMinutes?: number | null
  status?: string | null
  useCustomPay?: boolean | null
  revenueCents?: number | null
}

type TimeEntryRecord = {
  clockInAt?: Date | null
  clockOutAt?: Date | null
}

const toDiffMinutes = (from: Date, to: Date) =>
  Math.max(0, Math.floor((to.getTime() - from.getTime()) / 60000))

const toSafeBreakMinutes = (value?: number | null) => Math.max(0, Math.floor(value ?? 0))

export const roundPayrollHourlyMinutes = (minutes: number) => {
  const safeMinutes = Math.max(0, Math.floor(minutes))
  const fullHoursMinutes = Math.floor(safeMinutes / 60) * 60
  const remainderMinutes = safeMinutes % 60

  if (remainderMinutes < 15) return fullHoursMinutes
  if (remainderMinutes < 45) return fullHoursMinutes + 30
  return fullHoursMinutes + 60
}

const resolveValidRange = (from?: Date | null, to?: Date | null) => {
  if (!(from instanceof Date) || !(to instanceof Date)) return null
  if (to.getTime() <= from.getTime()) return null
  return { from, to }
}

const filterActiveComponents = (components: PayComponentRecord[]) => {
  const byType = new Map<PayComponentType, PayComponentRecord>()
  for (const component of components) {
    if (component.isActive === false) continue
    byType.set(component.componentType, component)
  }
  return Array.from(byType.values())
}

export const resolveIntervalPayComponents = (input: {
  useCustomPay?: boolean | null
  intervalComponents: PayComponentRecord[]
  employeeComponents: PayComponentRecord[]
}) => {
  if (input.useCustomPay) {
    return filterActiveComponents(input.intervalComponents)
  }
  return filterActiveComponents(input.employeeComponents)
}

export const computeIntervalMinutesWorked = (input: {
  interval: Pick<IntervalTimeRecord, "startAt" | "endAt" | "openedAt" | "closedAt" | "breakMinutes">
  timeEntry?: TimeEntryRecord | null
}) => {
  const plannedRange = { from: input.interval.startAt, to: input.interval.endAt }
  const clockRange = resolveValidRange(input.timeEntry?.clockInAt, input.timeEntry?.clockOutAt)
  const openedClosedRange = resolveValidRange(input.interval.openedAt, input.interval.closedAt)
  const effectiveRange = clockRange ?? openedClosedRange ?? plannedRange
  const plannedMinutes = toDiffMinutes(plannedRange.from, plannedRange.to)
  const actualMinutes = clockRange || openedClosedRange ? toDiffMinutes(effectiveRange.from, effectiveRange.to) : null
  const breakMinutes = toSafeBreakMinutes(input.interval.breakMinutes)
  const baseMinutes = toDiffMinutes(effectiveRange.from, effectiveRange.to)

  return {
    plannedMinutes,
    actualMinutes,
    effectiveStartAt: effectiveRange.from,
    effectiveEndAt: effectiveRange.to,
    usedActualTime: actualMinutes != null,
    minutesWorked: Math.max(0, baseMinutes - breakMinutes),
  }
}

export const computeIntervalCompensation = (input: {
  interval: Pick<IntervalTimeRecord, "status" | "revenueCents">
  minutesWorked: number
  components: PayComponentRecord[]
}) => {
  let hourlyPayCents = 0
  let fixedPayCents = 0
  let percentPayCents = 0
  let unresolvedPercentRevenue = false
  const roundedHourlyMinutes = roundPayrollHourlyMinutes(input.minutesWorked)

  for (const component of input.components) {
    if (component.componentType === "hourly" && component.amountCents != null) {
      hourlyPayCents += Math.round((component.amountCents * roundedHourlyMinutes) / 60)
      continue
    }

    if (component.componentType === "fixed_shift" && component.amountCents != null) {
      const isEligible = input.minutesWorked > 0 && input.interval.status !== "canceled"
      fixedPayCents += isEligible ? component.amountCents : 0
      continue
    }

    if (component.componentType === "percent_revenue" && component.rateBp != null) {
      if (input.interval.revenueCents == null) {
        unresolvedPercentRevenue = true
      } else {
        percentPayCents += Math.floor((input.interval.revenueCents * component.rateBp) / 10000)
      }
    }
  }

  const grossPayCents = Math.max(0, hourlyPayCents + fixedPayCents + percentPayCents)

  return {
    grossPayCents,
    hourlyPayCents,
    fixedPayCents,
    percentPayCents,
    unresolvedPercentRevenue,
  }
}

export const computeIntervalPayrollSnapshot = (input: {
  interval: IntervalTimeRecord
  timeEntry?: TimeEntryRecord | null
  intervalComponents: PayComponentRecord[]
  employeeComponents: PayComponentRecord[]
}) => {
  const components = resolveIntervalPayComponents({
    useCustomPay: input.interval.useCustomPay,
    intervalComponents: input.intervalComponents,
    employeeComponents: input.employeeComponents,
  })
  const minutes = computeIntervalMinutesWorked({
    interval: input.interval,
    timeEntry: input.timeEntry,
  })
  const compensation = computeIntervalCompensation({
    interval: input.interval,
    minutesWorked: minutes.minutesWorked,
    components,
  })

  return {
    ...minutes,
    ...compensation,
    componentsUsed: components,
  }
}

export type IntervalPayComponentRecord = PayComponentRecord
