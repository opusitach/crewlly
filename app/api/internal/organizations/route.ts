/**
 * GET /api/internal/organizations
 *
 * Selector list of organizations for internal users.
 * Access: authenticated User with isInternal = true AND at least one enabled InternalGlobalAccess grant.
 *
 * Not an admin panel — only fields needed to pick an organization in the selector UI.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSessionUser } from "@/lib/auth"
import {
  getEnabledInternalLevels,
  hasAnyEnabledInternalGrant,
} from "@/lib/internal-access/session"

export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!user.isInternal) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!(await hasAnyEnabledInternalGrant(user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const url = new URL(request.url)
  const search = url.searchParams.get("search")?.trim() ?? ""
  const limitParam = Number.parseInt(url.searchParams.get("limit") ?? "100", 10)
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 100

  const where = search
    ? {
        status: "active",
        name: { contains: search, mode: "insensitive" as const },
      }
    : { status: "active" }

  const organizations = await prisma.organization.findMany({
    where,
    select: {
      id: true,
      name: true,
      status: true,
      timezone: true,
      currency: true,
      createdAt: true,
      updatedAt: true,
      createdByUser: { select: { id: true, fullName: true, email: true } },
      locations: {
        where: { isActive: true },
        select: { id: true, name: true, addressText: true },
        orderBy: { createdAt: "asc" },
        take: 5,
      },
      _count: {
        select: {
          employees: { where: { employmentStatus: "active" } },
          locations: { where: { isActive: true } },
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
  })

  const enabledLevels = await getEnabledInternalLevels(user.id)

  return NextResponse.json({
    data: organizations.map((org) => ({
      id: org.id,
      name: org.name,
      status: org.status,
      timezone: org.timezone,
      currency: org.currency,
      createdAt: org.createdAt.toISOString(),
      updatedAt: org.updatedAt.toISOString(),
      owner: org.createdByUser
        ? {
            id: org.createdByUser.id,
            fullName: org.createdByUser.fullName,
            email: org.createdByUser.email,
          }
        : null,
      locations: org.locations,
      employeesCount: org._count.employees,
      locationsCount: org._count.locations,
    })),
    meta: {
      enabledLevels,
    },
  })
}
