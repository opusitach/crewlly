/**
 * GET /api/admin/organizations
 *
 * Paginated, searchable, filterable list of organizations. Read-only.
 *
 * Query params:
 *   - search:  matches org name OR creator (owner) email/name (case-insensitive)
 *   - status:  exact status filter (draft|active|... whatever is in use)
 *   - sort:    createdAt | updatedAt | name      (default createdAt)
 *   - order:   asc | desc                        (default desc)
 *   - page:    >= 1                               (default 1)
 *   - limit:   1..100                             (default 25)
 *
 * Counts use Prisma `_count` (no N+1). Owner info comes from the `createdByUser`
 * relation — the project has no dedicated "owner" column, so the creator is the
 * closest available signal. "Last activity" is approximated by `updatedAt`
 * (see TODO) to avoid an expensive cross-table scan on every request.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import {
  badRequest,
  enumParam,
  paginatedResponse,
  parsePagination,
  requireAdminApi,
  strParam,
} from "../../../../lib/admin-api"

export const dynamic = "force-dynamic"

const SORT_FIELDS = ["createdAt", "updatedAt", "name"] as const
const ORDERS = ["asc", "desc"] as const

export async function GET(request: Request) {
  const gate = await requireAdminApi()
  if (!gate.ok) return gate.response

  const { searchParams } = new URL(request.url)
  const pagination = parsePagination(searchParams)

  const sort = enumParam(searchParams, "sort", SORT_FIELDS, "createdAt")
  const order = enumParam(searchParams, "order", ORDERS, "desc")
  if (sort === null) return badRequest("Invalid sort field")
  if (order === null) return badRequest("Invalid order")

  const search = strParam(searchParams, "search")
  const status = strParam(searchParams, "status")

  const where: Prisma.OrganizationWhereInput = {
    AND: [
      status ? { status } : {},
      search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { createdByUser: { email: { contains: search, mode: "insensitive" } } },
              { createdByUser: { fullName: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {},
    ],
  }

  const [rows, total] = await Promise.all([
    prisma.organization.findMany({
      where,
      orderBy: { [sort]: order },
      skip: pagination.skip,
      take: pagination.limit,
      select: {
        id: true,
        name: true,
        status: true,
        timezone: true,
        currency: true,
        createdAt: true,
        updatedAt: true,
        createdByUser: { select: { id: true, fullName: true, email: true } },
        _count: { select: { members: true, employees: true, locations: true } },
      },
    }),
    prisma.organization.count({ where }),
  ])

  const data = rows.map((o) => ({
    id: o.id,
    name: o.name,
    status: o.status,
    timezone: o.timezone,
    currency: o.currency,
    owner: o.createdByUser
      ? { id: o.createdByUser.id, name: o.createdByUser.fullName, email: o.createdByUser.email }
      : null,
    membersCount: o._count.members,
    employeesCount: o._count.employees,
    locationsCount: o._count.locations,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    // TODO(stage-10): compute real last-activity from workdays/work_intervals if cheap.
    lastActivityAt: o.updatedAt.toISOString(),
  }))

  return NextResponse.json(paginatedResponse(data, total, pagination))
}
