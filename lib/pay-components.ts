export const PAY_COMPONENT_TYPES = ["hourly", "fixed_shift", "percent_revenue"] as const

export type PayComponentType = (typeof PAY_COMPONENT_TYPES)[number]

export type PayComponentInput = {
  componentType: PayComponentType
  amountCents?: number | null
  rateBp?: number | null
  isActive?: boolean
  priority?: number
}

export type PayComponent = {
  componentType: PayComponentType
  amountCents: number | null
  rateBp: number | null
  isActive: boolean
  priority: number
}

export const PAY_COMPONENT_LABELS: Record<PayComponentType, string> = {
  hourly: "Почасовая",
  fixed_shift: "Фикс",
  percent_revenue: "Процент",
}

export function normalizePayComponentsInput(components: PayComponentInput[] | null | undefined): PayComponentInput[] {
  if (!components) return []
  const byType = new Map<PayComponentType, PayComponentInput>()
  for (const component of components) {
    byType.set(component.componentType, component)
  }
  return Array.from(byType.values())
}
