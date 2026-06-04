type SessionCookieEnv = {
  NODE_ENV?: string
  COOKIE_SECURE?: string
  SESSION_COOKIE_DOMAIN?: string
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

/**
 * Optional parent-domain scope for the session cookie (e.g. ".crewlly.com").
 * When set, the same cookie is shared across subdomains — required for the
 * `admin.crewlly.com` container to read sessions issued by `crewlly.com`.
 *
 * When unset (typical for local dev), the cookie stays host-only, preserving
 * existing single-host behavior.
 */
export function resolveSessionCookieDomain(env: SessionCookieEnv = process.env): string | undefined {
  const value = env.SESSION_COOKIE_DOMAIN?.trim()
  return value && value.length > 0 ? value : undefined
}
