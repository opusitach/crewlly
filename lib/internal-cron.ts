export function isAuthorizedInternalCronRequest(request: Request, secretEnvKey: string) {
  const secret = process.env[secretEnvKey]
  if (!secret) {
    return process.env.NODE_ENV !== "production"
  }

  const cronHeader = request.headers.get("x-cron-secret")
  if (cronHeader && cronHeader === secret) return true

  const authHeader = request.headers.get("authorization")
  if (authHeader === `Bearer ${secret}`) return true

  return false
}
