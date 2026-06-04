export function isAuthorizedInternalCronRequest(request: Request, secretEnvKey: string | string[]) {
  const envKeys = Array.isArray(secretEnvKey) ? secretEnvKey : [secretEnvKey]
  const secrets = envKeys
    .map((envKey) => process.env[envKey]?.trim())
    .filter((secret): secret is string => Boolean(secret))

  if (secrets.length === 0) {
    if (process.env.NODE_ENV === "production") return false
    console.warn("[internal-cron] No secret configured — unauthenticated requests allowed in development. Set INTERNAL_CRON_SECRET to require auth.")
    return true
  }

  const cronHeader = request.headers.get("x-cron-secret")
  if (cronHeader && secrets.includes(cronHeader)) return true

  const authHeader = request.headers.get("authorization")
  if (authHeader) {
    for (const secret of secrets) {
      if (authHeader === `Bearer ${secret}`) {
        return true
      }
    }
  }

  return false
}
