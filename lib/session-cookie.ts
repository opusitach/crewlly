type SessionCookieEnv = {
  NODE_ENV?: string
  COOKIE_SECURE?: string
}

function parseBooleanEnv(value?: string): boolean | null {
  if (!value) return null

  const normalized = value.trim().toLowerCase()
  if (normalized === "true" || normalized === "1") return true
  if (normalized === "false" || normalized === "0") return false
  return null
}

export function resolveSessionCookieSecure(env: SessionCookieEnv = process.env): boolean {
  const explicitValue = parseBooleanEnv(env.COOKIE_SECURE)
  if (explicitValue !== null) return explicitValue
  return env.NODE_ENV === "production"
}
