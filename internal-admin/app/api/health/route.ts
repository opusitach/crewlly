/**
 * GET /api/health
 *
 * Container healthcheck. Public (no auth) — does not expose any sensitive info.
 * Used by docker-compose `healthcheck` and external monitoring.
 *
 * Intentionally does NOT hit the database — a slow/failing DB shouldn't take
 * the admin container out of rotation. Add a `?deep=true` mode later if we
 * decide we want a "ready" signal that also probes Postgres.
 */
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "internal-admin",
    time: new Date().toISOString(),
  })
}
