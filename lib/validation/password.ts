export const PASSWORD_POLICY_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])\S{8,64}$/

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 64

export const PASSWORD_POLICY_ERROR_MESSAGE =
  "Пароль должен содержать 8-64 символов, хотя бы одну заглавную букву, одну цифру, один спецсимвол и не содержать пробелов"

export const PASSWORD_REQUIREMENTS = [
  {
    id: "length",
    label: `Минимум ${PASSWORD_MIN_LENGTH} символов`,
  },
  {
    id: "uppercase",
    label: "Хотя бы одна заглавная буква",
  },
  {
    id: "digit",
    label: "Хотя бы одна цифра",
  },
  {
    id: "special",
    label: "Хотя бы один спецсимвол",
  },
  {
    id: "noWhitespace",
    label: "Без пробелов",
  },
] as const

type PasswordRequirementId = (typeof PASSWORD_REQUIREMENTS)[number]["id"]

const PASSWORD_REQUIREMENT_CHECKS: Record<PasswordRequirementId, (password: string) => boolean> = {
  length: (password) => password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
  uppercase: (password) => /[A-Z]/.test(password),
  digit: (password) => /\d/.test(password),
  special: (password) => /[^A-Za-z0-9\s]/.test(password),
  noWhitespace: (password) => /^\S*$/.test(password),
}

export function isStrongPassword(password: string): boolean {
  return PASSWORD_POLICY_REGEX.test(password)
}

export function getPasswordRequirementChecks(password: string) {
  return PASSWORD_REQUIREMENTS.map((requirement) => ({
    ...requirement,
    met: PASSWORD_REQUIREMENT_CHECKS[requirement.id](password),
  }))
}

export function sanitizeAuthInput(value: string): string {
  // NFD decomposes precomposed characters (é → e + combining acute), \p{M} strips all combining marks
  return value.normalize("NFD").replace(/\p{M}/gu, "").replace(/\s/g, "")
}

// Keeps only printable ASCII (0x21–0x7E) minus injection-risk chars: ' " ` < > ; \ &
const DISALLOWED_PASSWORD_CHARS_RE = /[^!-~]|['"`<>;\\&]/g

export function sanitizePasswordInput(value: string): string {
  return value.replace(DISALLOWED_PASSWORD_CHARS_RE, "")
}

export function getPasswordValidationError(rawValue: string | null | undefined): string | null {
  const value = rawValue ?? ""

  if (!value) {
    return "Введите пароль"
  }

  return isStrongPassword(value) ? null : PASSWORD_POLICY_ERROR_MESSAGE
}
