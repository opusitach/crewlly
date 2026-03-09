import { NextResponse } from "next/server"
import { deleteSessionByToken, getSessionTokenFromCookies, getSessionUser, SESSION_COOKIE } from "@/lib/auth"
import { auditActorFromSession, logAuditEvent } from "@/lib/observability/audit"

export async function POST(request: Request) {
  const user = await getSessionUser()
  const token = await getSessionTokenFromCookies()
  await deleteSessionByToken(token ?? undefined)
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(SESSION_COOKIE)
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
