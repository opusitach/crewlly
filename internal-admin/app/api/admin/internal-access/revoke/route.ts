/**
 * POST /api/admin/internal-access/revoke
 * Body: { targetUserId: string, accessLevel: "owner_view" | "employee_view" | "super_admin" }
 *
 * Hard-deletes an internal access grant (never enabled=false). Idempotent.
 *
 * Authorization: actor MUST have an enabled super_admin grant (requireSuperAdminApi).
 * Data invariants enforced by revokeInternalAccess:
 *   - owner_view / employee_view → ends matching active sessions.
 *   - super_admin → refuses to remove the last enabled super_admin (409),
 *     count check + delete done in one transaction.
 *
 * POST is used (not DELETE) to carry a JSON body uniformly with grant.
 */
import { NextResponse } from "next/server"
import { z } from "zod"
import { badRequest, conflict, notFound, requireSuperAdminApi } from "../../../../../lib/admin-api"
import { revokeInternalAccess } from "@/lib/internal-access/management"

export const dynamic = "force-dynamic"

const bodySchema = z.object({
  targetUserId: z.string().uuid(),
  accessLevel: z.enum(["owner_view", "employee_view", "super_admin"]),
})

export async function POST(request: Request) {
  const gate = await requireSuperAdminApi()
  if (!gate.ok) return gate.response

  const json = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) return badRequest("Invalid request body")

  const { targetUserId, accessLevel } = parsed.data

  const result = await revokeInternalAccess({
    actorUserId: gate.access.user.id,
    targetUserId,
    accessLevel,
  })

  if (!result.ok) {
    if (result.code === "target_not_found") return notFound("User not found")
    if (result.code === "target_not_internal") {
      return NextResponse.json(
        { error: "Target user is not an internal user" },
        { status: 400 },
      )
    }
    // last_super_admin
    return conflict("Cannot revoke the last super_admin in the system")
  }

  return NextResponse.json({
    ok: true,
    deleted: result.deleted,
    endedSessions: result.endedSessions,
    targetUserId,
    enabledInternalLevels: result.enabledLevels,
  })
}
