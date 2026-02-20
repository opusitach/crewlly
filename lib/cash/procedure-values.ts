const INTEGER_TOKEN_REGEX = /^-?\d+$/
const INTEGER_DRAFT_TOKEN_REGEX = /^-?\d*$/
const CASH_VALUES_SEPARATOR = "|"

export type CashProcedureFieldMeta = {
  key: string
  isRequired: boolean
  isPhotoRequired?: boolean
  label?: string
}

export type CashProcedurePhotoValue = {
  photoS3Key: string | null
  photoUrl: string | null
}

export type CashProcedurePhotoMap = Record<string, CashProcedurePhotoValue>

const normalizePhotoToken = (value: unknown) => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function isCashIntegerToken(value: string) {
  return INTEGER_TOKEN_REGEX.test(value.trim())
}

export function isCashIntegerDraftToken(value: string) {
  return INTEGER_DRAFT_TOKEN_REGEX.test(value.trim())
}

export function normalizeCashIntegerToken(value: string | null | undefined) {
  const trimmed = (value ?? "").trim()
  return isCashIntegerToken(trimmed) ? trimmed : ""
}

export function encodeCashProcedureValues(fieldKeys: string[], valuesByKey: Record<string, string | null | undefined>) {
  const tokens = fieldKeys.map((key) => normalizeCashIntegerToken(valuesByKey[key]))

  while (tokens.length > 0 && tokens[tokens.length - 1] === "") {
    tokens.pop()
  }

  return tokens.join(CASH_VALUES_SEPARATOR)
}

export function decodeCashProcedureValues(
  packed: string | null | undefined,
  fieldKeys: string[],
): Record<string, string> {
  const decoded: Record<string, string> = {}
  if (!packed || !packed.trim()) return decoded

  const tokens = packed.split(CASH_VALUES_SEPARATOR)
  for (let index = 0; index < fieldKeys.length; index += 1) {
    const key = fieldKeys[index]
    const token = tokens[index]?.trim() ?? ""
    if (!token) continue
    if (!isCashIntegerToken(token)) continue
    decoded[key] = token
  }

  return decoded
}

export function normalizeCashProcedurePackedInput(raw: string | null | undefined):
  | { ok: true; packed: string }
  | { ok: false; error: string } {
  const trimmed = (raw ?? "").trim()
  if (!trimmed) {
    return { ok: true, packed: "" }
  }

  const tokens = trimmed.split(CASH_VALUES_SEPARATOR).map((token) => token.trim())
  for (const token of tokens) {
    if (!token) continue
    if (!isCashIntegerToken(token)) {
      return { ok: false, error: "Поля кассы должны содержать только целые числа" }
    }
  }

  while (tokens.length > 0 && tokens[tokens.length - 1] === "") {
    tokens.pop()
  }

  return {
    ok: true,
    packed: tokens.join(CASH_VALUES_SEPARATOR),
  }
}

export function hasRequiredCashProcedureValues(
  packed: string | null | undefined,
  fields: CashProcedureFieldMeta[],
) {
  if (fields.length === 0) return true
  const byKey = decodeCashProcedureValues(
    packed,
    fields.map((field) => field.key),
  )

  return fields.every((field) => {
    if (!field.isRequired) return true
    const token = byKey[field.key] ?? ""
    return isCashIntegerToken(token)
  })
}

export function normalizeCashProcedurePhotoMap(raw: unknown, allowedKeys?: Set<string>): CashProcedurePhotoMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {}
  }

  const normalized: CashProcedurePhotoMap = {}
  for (const [key, value] of Object.entries(raw)) {
    if (allowedKeys && !allowedKeys.has(key)) continue
    if (!value || typeof value !== "object" || Array.isArray(value)) continue

    const photoS3Key = normalizePhotoToken((value as Record<string, unknown>).photoS3Key)
    const photoUrl = normalizePhotoToken((value as Record<string, unknown>).photoUrl)
    if (!photoS3Key && !photoUrl) continue

    normalized[key] = {
      photoS3Key,
      photoUrl,
    }
  }

  return normalized
}

export function getMissingCashProcedurePhotoFieldKeys(input: {
  packed: string | null | undefined
  fields: CashProcedureFieldMeta[]
  photosRaw: unknown
}) {
  if (input.fields.length === 0) return []

  const fieldKeys = input.fields.map((field) => field.key)
  const valuesByKey = decodeCashProcedureValues(input.packed, fieldKeys)
  const photosByKey = normalizeCashProcedurePhotoMap(input.photosRaw, new Set(fieldKeys))

  const missing: string[] = []
  for (const field of input.fields) {
    if (!field.isPhotoRequired) continue

    const token = valuesByKey[field.key] ?? ""
    if (!isCashIntegerToken(token)) continue

    const photo = photosByKey[field.key]
    const hasPhoto = Boolean(photo?.photoS3Key || photo?.photoUrl)
    if (!hasPhoto) {
      missing.push(field.key)
    }
  }

  return missing
}
