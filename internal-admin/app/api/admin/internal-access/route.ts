/**
 * GET /api/admin/internal-access
 *
 * Paginated, searchable list of INTERNAL users (isInternal = true) and their
 * enabled internal access levels.
 *
 * Access: READ is allowed for any eligible admin (any enabled grant) — write
 * actions live on separate routes and require super_admin. This mirrors the
 * "read = any grant, write = super_admin" model.
 *
 * Query params:
 *   - search: matches email OR full name (case-insensitive)
 *   - level:  owner_view | employee_view | super_admin (filter to users with that
 *             enabled grant)
 *   - sort:   createdAt | updatedAt | email   (default createdAt)
 *   - order:  asc | desc                       (default desc)
 *   - page / limit
 *
 * SECURITY: the Prisma `select` is an allow-list. passwordHash, sessions, tokens
 * and any other secret-bearing relations are NEVER selected.
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

const SORT_FIELDS = ["createdAt", "updatedAt", "email"] as const
const ORDERS = ["asc", "desc"] as const
const LEVELS = ["owner_view", "employee_view", "super_admin"] as const

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

  const levelRaw = searchParams.get("level")?.trim()
  if (levelRaw && !(LEVELS as readonly string[]).includes(levelRaw)) {
    return badRequest("Invalid level")
  }
  const level = levelRaw as (typeof LEVELS)[number] | undefined

  const where: Prisma.UserWhereInput = {
    AND: [
      // Only internal users are listed here.
      { isInternal: true },
      search
        ? {
            OR: [
              { email: { contains: search, mode: "insensitive" } },
              { fullName: { contains: search, mode: "insensitive" } },
            ],
          }
        : {},
      level ? { internalAccess: { some: { accessLevel: level, enabled: true } } } : {},
    ],
  }

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { [sort]: order },
      skip: pagination.skip,
      take: pagination.limit,
      select: {
        id: true,
        email: true,
        fullName: true,
        isInternal: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        internalAccess: {
          where: { enabled: true },
          select: { accessLevel: true },
        },
        // NOTE: passwordHash, sessions, tokens etc. intentionally NOT selected.
      },
    }),
    prisma.user.count({ where }),
  ])

  const data = rows.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.fullName,
    isInternal: u.isInternal,
    status: u.status,
    enabledInternalLevels: u.internalAccess.map((g) => g.accessLevel),
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  }))

  return NextResponse.json(paginatedResponse(data, total, pagination))
}
