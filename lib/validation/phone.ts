import {
  DEFAULT_PHONE_COUNTRY_ISO,
  detectPhoneCountryByDialCode,
  getPhoneCountryByIso,
  type PhoneCountry,
} from "@/lib/phone/country-codes"

export const DEFAULT_PHONE_ERROR_MESSAGE = "Введите корректный номер телефона"
export const PHONE_DIGITS_ONLY_ERROR_MESSAGE = "Телефон может содержать только цифры"
export const PHONE_TOO_SHORT_ERROR_MESSAGE = "Слишком короткий номер телефона"
export const PHONE_TOO_LONG_ERROR_MESSAGE = "Слишком длинный номер телефона"

export const MIN_PHONE_DIGITS = 7
export const MAX_PHONE_DIGITS = 15

const PHONE_LETTERS_REGEX = /[A-Za-zА-Яа-яЁё]/
const PHONE_ALLOWED_SYMBOLS_REGEX = /^[+\d\s().-]+$/

export function normalizePhone(rawValue: string | null | undefined): string | null {
  const value = (rawValue ?? "").trim()
  if (!value) {
    return null
  }

  const hasLeadingPlus = value.startsWith("+")
  const digits = value.replace(/\D/g, "")
  if (!digits) {
    return null
  }

  return hasLeadingPlus ? `+${digits}` : digits
}

export function getPhoneValidationError(
  rawValue: string | null | undefined,
  options: { required?: boolean } = {},
): string | null {
  const value = (rawValue ?? "").trim()

  if (!value) {
    return options.required ? "Укажите номер телефона" : null
  }

  if (PHONE_LETTERS_REGEX.test(value)) {
    return PHONE_DIGITS_ONLY_ERROR_MESSAGE
  }

  if (!PHONE_ALLOWED_SYMBOLS_REGEX.test(value)) {
    return DEFAULT_PHONE_ERROR_MESSAGE
  }

  const plusMatches = value.match(/\+/g)
  if (plusMatches && (plusMatches.length > 1 || !value.startsWith("+"))) {
    return DEFAULT_PHONE_ERROR_MESSAGE
  }

  const digits = value.replace(/\D/g, "")
  if (digits.length < MIN_PHONE_DIGITS) {
    return PHONE_TOO_SHORT_ERROR_MESSAGE
  }
  if (digits.length > MAX_PHONE_DIGITS) {
    return PHONE_TOO_LONG_ERROR_MESSAGE
  }

  return null
}

export function splitPhoneNumber(
  rawValue: string | null | undefined,
  fallbackCountryIso: string = DEFAULT_PHONE_COUNTRY_ISO,
): { country: PhoneCountry; nationalNumber: string; normalized: string | null } {
  const fallbackCountry = getPhoneCountryByIso(fallbackCountryIso)
  const normalized = normalizePhone(rawValue)

  if (!normalized) {
    return {
      country: fallbackCountry,
      nationalNumber: "",
      normalized: null,
    }
  }

  const allDigits = normalized.replace(/\D/g, "")
  if (!normalized.startsWith("+")) {
    return {
      country: fallbackCountry,
      nationalNumber: allDigits,
      normalized,
    }
  }

  const detectedCountry = detectPhoneCountryByDialCode(normalized)
  if (!detectedCountry) {
    return {
      country: fallbackCountry,
      nationalNumber: allDigits,
      normalized,
    }
  }

  const dialDigits = detectedCountry.dialCode.replace(/\D/g, "")
  const nationalNumber = allDigits.slice(dialDigits.length)

  return {
    country: detectedCountry,
    nationalNumber,
    normalized,
  }
}

export function buildPhoneValue(countryDialCode: string, rawNationalNumber: string): string {
  const nationalDigits = rawNationalNumber.replace(/\D/g, "")
  if (!nationalDigits) {
    return ""
  }

  const dialDigits = countryDialCode.replace(/\D/g, "")
  return `+${dialDigits}${nationalDigits}`
}

export function formatPhoneForDisplay(rawValue: string | null | undefined): string {
  const normalized = normalizePhone(rawValue)
  if (!normalized) {
    return ""
  }

  const parsed = splitPhoneNumber(normalized)
  if (!normalized.startsWith("+")) {
    return groupPhoneDigits(normalized)
  }

  if (!parsed.nationalNumber) {
    return parsed.country.dialCode
  }

  return `${parsed.country.dialCode} ${groupPhoneDigits(parsed.nationalNumber)}`
}

function groupPhoneDigits(digitsOrPhone: string): string {
  const digits = digitsOrPhone.replace(/\D/g, "")
  if (!digits) {
    return ""
  }

  return digits.replace(/(\d{3})(?=\d)/g, "$1 ").trim()
}
