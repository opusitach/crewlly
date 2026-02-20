import { NextResponse } from "next/server"
import { deleteSessionByToken, getSessionTokenFromCookies, SESSION_COOKIE } from "@/lib/auth"

export async function POST() {
  const token = await getSessionTokenFromCookies()
  await deleteSessionByToken(token ?? undefined)
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(SESSION_COOKIE)
  return res
}

