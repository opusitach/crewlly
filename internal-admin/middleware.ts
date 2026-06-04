/**
 * Edge middleware — runs on every request to the admin app.
 *
 * Responsibilities:
 *   1. Apply baseline security headers to every response (defense in depth).
 *   2. Block search engines via X-Robots-Tag (in addition to meta and robots.txt).
 *
 * It does NOT enforce auth here. Auth gating is done explicitly in each server
 * page / API route via `resolveAdminAccess()`. Centralizing the gate in route
 * handlers keeps "what's protected" obvious from the code and avoids accidental
 * bypass when files are added.
 */
import { NextResponse, type NextRequest } from "next/server"

export function middleware(_req: NextRequest) {
  const res = NextResponse.next()
  res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive")
  res.headers.set("X-Content-Type-Options", "nosniff")
  res.headers.set("X-Frame-Options", "DENY")
  res.headers.set("Referrer-Policy", "no-referrer")
  res.headers.set("Permissions-Policy", "interest-cohort=()")
  return res
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
