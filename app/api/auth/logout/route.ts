import { NextResponse } from "next/server"
import { deleteSessionByToken, getSessionTokenFromCookies, getSessionUser, SESSION_COOKIE } from "@/lib/auth"
import { resolveSessionCookieDomain } from "@/lib/session-cookie"
import { auditActorFromSession, logAuditEvent } from "@/lib/observability/audit"

export async function POST(request: Request) {
  const user = await getSessionUser()
  const token = await getSessionTokenFromCookies()
  await deleteSessionByToken(token ?? undefined)
  const res = NextResponse.json({ ok: true })
  // Clear the host-scoped cookie (legacy and dev) AND, when configured, the
  // parent-domain cookie used to share auth with admin.crewlly.com.
  res.cookies.delete(SESSION_COOKIE)
  const cookieDomain = resolveSessionCookieDomain()
  if (cookieDomain) {
    res.cookies.set(SESSION_COOKIE, "", {
      domain: cookieDomain,
      path: "/",
      expires: new Date(0),
    })
  }
  logAuditEvent(request, {
    event_type: "auth.logout",
    outcome: "success",
    status: 200,
    route: "/api/auth/logout",
    actor: auditActorFromSession({ user }),
    metadata: {
      session_present: Boolean(token),
    },
  })
  return res
}
