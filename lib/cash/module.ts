export const CASH_FIELD_KEY_REGEX = /^[a-z][a-z0-9_]{1,63}$/

export const OPENING_CASH_KEY = "opening_cash"
export const CLOSING_CASH_KEY = "closing_cash"

export type CashInputStage = "open" | "close"

export type CashFieldConfig = {
  id: string | null
  key: string
  label: string
  inputStage: CashInputStage
  isRequired: boolean
  isPhotoRequired?: boolean
  isRevenueBasis: boolean
  displayOrder: number
}

export type CashSessionFieldSnapshot = {
  cashRegisterFieldId?: string | null
  fieldKeySnapshot: string
  fieldLabelSnapshot: string
  inputStage: CashInputStage
  isRequiredSnapshot: boolean
  valueCents: number
  isRevenueBasisSnapshot: boolean
  source?: string
}

export function isCashInputStage(value: string): value is CashInputStage {
  return value === "open" || value === "close"
}

export function normalizeCashFieldKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

export function isValidCashFieldKey(value: string): boolean {
  return CASH_FIELD_KEY_REGEX.test(value)
}

export function parseCashFieldValuesPayload(raw: unknown):
  | { ok: true; values: Record<string, number> }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Значения полей должны быть объектом key -> integer" }
  }

  const values: Record<string, number> = {}

  for (const [key, value] of Object.entries(raw)) {
    if (!isValidCashFieldKey(key)) {
      return { ok: false, error: `Некорректный ключ поля: ${key}` }
    }

    const normalized =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.trim().length > 0
          ? Number(value.trim())
          : Number.NaN

    if (!Number.isFinite(normalized) || !Number.isInteger(normalized)) {
      return { ok: false, error: `Поле ${key} должно быть целым числом` }
    }

    values[key] = normalized
  }

  return { ok: true, values }
}

export function toFieldValueMap(values: Pick<CashSessionFieldSnapshot, "fieldKeySnapshot" | "valueCents">[]): Record<string, number> {
  const mapped: Record<string, number> = {}
  for (const value of values) {
    mapped[value.fieldKeySnapshot] = value.valueCents
  }
  return mapped
}

export function findMissingRequiredFieldKeys(fields: CashFieldConfig[], valueMap: Record<string, number>): string[] {
  const missing: string[] = []

  for (const field of fields) {
    if (!field.isRequired) continue
    const value = valueMap[field.key]
    if (!Number.isInteger(value)) {
      missing.push(field.key)
    }
  }

  return missing
}

export function buildSessionFieldSnapshots(input: {
  fields: CashFieldConfig[]
  values: Record<string, number>
  existingByKey?: Record<string, Pick<CashSessionFieldSnapshot, "valueCents">>
}):
  | { ok: true; snapshots: CashSessionFieldSnapshot[] }
  | { ok: false; error: string } {
  const snapshots: CashSessionFieldSnapshot[] = []

  for (const field of input.fields) {
    const directValue = input.values[field.key]
    const fallbackValue = input.existingByKey?.[field.key]?.valueCents
    const valueCents = Number.isInteger(directValue)
      ? directValue
      : Number.isInteger(fallbackValue)
        ? Number(fallbackValue)
        : 0

    if (!Number.isInteger(valueCents)) {
      return {
        ok: false,
        error: `Поле ${field.key} должно быть целым числом`,
      }
    }

    snapshots.push({
      cashRegisterFieldId: field.id ?? null,
      fieldKeySnapshot: field.key,
      fieldLabelSnapshot: field.label,
      inputStage: field.inputStage,
      isRequiredSnapshot: field.isRequired,
      valueCents,
      isRevenueBasisSnapshot: field.isRevenueBasis,
      source: "manual",
    })
  }

  return { ok: true, snapshots }
}

export function computeCashSessionSnapshotTotals(input: {
  allFields: CashFieldConfig[]
  fieldValues: Pick<CashSessionFieldSnapshot, "fieldKeySnapshot" | "valueCents">[]
}):
  | {
      ok: true
      openingCashCents: number
      closingCashCents: number
    }
  | { ok: false; error: string } {
  const valueMap = toFieldValueMap(input.fieldValues)
  const missing = findMissingRequiredFieldKeys(input.allFields, valueMap)
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Не заполнены обязательные поля: ${missing.join(", ")}`,
    }
  }

  const openingCashCents = valueMap[OPENING_CASH_KEY] ?? 0
  const closingCashCents = valueMap[CLOSING_CASH_KEY] ?? 0

  return {
    ok: true,
    openingCashCents,
    closingCashCents,
  }
}

export function sortCashFields(fields: CashFieldConfig[]) {
  return [...fields].sort((a, b) => {
    if (a.inputStage !== b.inputStage) {
      return a.inputStage === "open" ? -1 : 1
    }
    if (a.displayOrder !== b.displayOrder) {
      return a.displayOrder - b.displayOrder
    }
    return a.key.localeCompare(b.key)
  })
}

export function containsActivePercentRevenue(components: Array<{ componentType: string; isActive?: boolean | null }>) {
  return components.some((component) => component.componentType === "percent_revenue" && component.isActive !== false)
}
