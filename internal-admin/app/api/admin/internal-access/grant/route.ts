/**
 * POST /api/admin/internal-access/grant
 * Body: { targetUserId: string, accessLevel: "owner_view" | "employee_view" | "super_admin" }
 *
 * Grants an internal access level to an existing internal user.
 *
 * Authorization: actor MUST have an enabled super_admin grant (requireSuperAdminApi).
 * Data invariants (target exists, target.isInternal, idempotency, audit) are
 * enforced by grantInternalAccess. This route never creates users, never touches
 * OrganizationMember, and never changes business roles.
 */
import { NextResponse } from "next/server"
import { z } from "zod"
import { badRequest, notFound, requireSuperAdminApi } from "../../../../../lib/admin-api"
import { grantInternalAccess } from "@/lib/internal-access/management"

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

  const result = await grantInternalAccess({
    actorUserId: gate.access.user.id,
    targetUserId,
    accessLevel,
  })

  if (!result.ok) {
    if (result.code === "target_not_found") return notFound("User not found")
    // Cannot grant internal access to a regular (non-internal) user.
    return NextResponse.json(
      { error: "Target user is not an internal user" },
      { status: 400 },
    )
  }

  return NextResponse.json({
    ok: true,
    created: result.created,
    targetUserId,
    enabledInternalLevels: result.enabledLevels,
  })
}
