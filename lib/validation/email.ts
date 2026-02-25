const NON_ASCII_REGEX = /[^\x00-\x7F]/

export const DEFAULT_EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,63}$/
export const DEFAULT_EMAIL_PATTERN = DEFAULT_EMAIL_REGEX.source
export const DEFAULT_EMAIL_ERROR_MESSAGE = "Введите email в формате name@example.com"
export const LATIN_ONLY_EMAIL_ERROR_MESSAGE = "Email должен быть латиницей (например, name@example.com)"

interface EmailValidationOptions {
  required?: boolean
}

export function getEmailValidationError(
  rawValue: string | null | undefined,
  options: EmailValidationOptions = {},
): string | null {
  const value = (rawValue ?? "").trim()

  if (!value) {
    return options.required ? "Укажите email" : null
  }

  if (NON_ASCII_REGEX.test(value)) {
    return LATIN_ONLY_EMAIL_ERROR_MESSAGE
  }

  return DEFAULT_EMAIL_REGEX.test(value) ? null : DEFAULT_EMAIL_ERROR_MESSAGE
}
