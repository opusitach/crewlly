export type TipsSplitMethod = "equal" | "by_hours"

export const normalizeTipsSplitMethod = (raw: string | null | undefined): TipsSplitMethod =>
  raw === "by_hours" ? "by_hours" : "equal"

export function allocateCentsEqual(totalCents: number, employeeIds: string[]) {
  const allocations = new Map<string, number>()
  if (employeeIds.length === 0) {
    return allocations
  }

  for (const employeeId of employeeIds) {
    allocations.set(employeeId, 0)
  }

  if (totalCents === 0) {
    return allocations
  }

  const sign = totalCents < 0 ? -1 : 1
  const absolute = Math.abs(totalCents)
  const share = Math.floor(absolute / employeeIds.length)

  for (const employeeId of employeeIds) {
    allocations.set(employeeId, share * sign)
  }

  let remainder = absolute - share * employeeIds.length
  let index = 0
  while (remainder > 0) {
    const employeeId = employeeIds[index]
    allocations.set(employeeId, (allocations.get(employeeId) ?? 0) + sign)
    remainder -= 1
    index += 1
    if (index >= employeeIds.length) {
      index = 0
    }
  }

  return allocations
}

export function allocateCentsByMinutes(totalCents: number, weighted: Array<{ employeeId: string; minutes: number }>) {
  const allocations = new Map<string, number>()
  if (weighted.length === 0) {
    return allocations
  }

  for (const item of weighted) {
    allocations.set(item.employeeId, 0)
  }

  if (totalCents === 0) {
    return allocations
  }

  const totalMinutes = weighted.reduce((sum, item) => sum + Math.max(0, item.minutes), 0)
  if (totalMinutes <= 0) {
    return allocateCentsEqual(
      totalCents,
      weighted.map((item) => item.employeeId).sort((a, b) => a.localeCompare(b)),
    )
  }

  const sign = totalCents < 0 ? -1 : 1
  const absolute = Math.abs(totalCents)
  const totalMinutesBigInt = BigInt(totalMinutes)

  const rows = weighted.map((item) => {
    const minutes = Math.max(0, item.minutes)
    const numerator = BigInt(absolute) * BigInt(minutes)
    const base = Number(numerator / totalMinutesBigInt)
    const remainder = Number(numerator % totalMinutesBigInt)

    return {
      employeeId: item.employeeId,
      base,
      remainder,
    }
  })

  let distributed = 0
  for (const row of rows) {
    allocations.set(row.employeeId, row.base * sign)
    distributed += row.base
  }

  let remainder = absolute - distributed
  if (remainder <= 0) {
    return allocations
  }

  rows.sort((a, b) => {
    if (a.remainder !== b.remainder) {
      return b.remainder - a.remainder
    }
    return a.employeeId.localeCompare(b.employeeId)
  })

  let index = 0
  while (remainder > 0) {
    const row = rows[index]
    allocations.set(row.employeeId, (allocations.get(row.employeeId) ?? 0) + sign)
    remainder -= 1
    index += 1
    if (index >= rows.length) {
      index = 0
    }
  }

  return allocations
}

