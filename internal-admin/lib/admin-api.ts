/**
 * Shared helpers for admin API routes (admin.crewlly.com).
 *
 * Every admin API route MUST start with `requireAdminApi()`. It returns either
 * the resolved access context or a ready-to-return NextResponse with a uniform
 * error body — so forbidden responses look identical everywhere and never leak
 * which condition failed.
 *
 * All admin APIs are READ-ONLY (GET). This module deliberately exposes no write
 * helpers.
 */
import { NextResponse } from "next/server"
import { resolveAdminAccess, type AdminAccessContext } from "./admin-access"

export const DEFAULT_LIMIT = 25
export const MAX_LIMIT = 100

export type AdminApiGate =
  | { ok: true; access: AdminAccessContext }
  | { ok: false; response: NextResponse }

/**
 * Gate an admin API route. Usage:
 *   const gate = await requireAdminApi()
 *   if (!gate.ok) return gate.response
 *   // ... gate.access is available
 */
export async function requireAdminApi(): Promise<AdminApiGate> {
  const result = await resolveAdminAccess()
  if (!result.ok) {
    const status = result.reason === "unauthorized" ? 401 : 403
    // Uniform body for both 401/403 — no detail about why.
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status }) }
  }
  return { ok: true, access: result.access }
}

/**
 * Stricter gate for WRITE actions on internal access. Requires an enabled
 * `super_admin` grant — read-heavy admin access (any enabled grant) is NOT
 * enough. Anonymous → 401; everyone else who isn't a super_admin → 403 with the
 * same uniform body, so a non-super-admin internal user can't distinguish their
 * case from a regular user's.
 */
export async function requireSuperAdminApi(): Promise<AdminApiGate> {
  const result = await resolveAdminAccess()
  if (!result.ok) {
    const status = result.reason === "unauthorized" ? 401 : 403
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status }) }
  }
  if (!result.access.isSuperAdmin) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  return { ok: true, access: result.access }
}

/** Standard 409 for conflicting state (e.g. revoking the last super_admin). */
export function conflict(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 409 })
}

export interface Pagination {
  page: number
  limit: number
  skip: number
}

/**
 * Parse `page` and `limit` query params with safe bounds.
 * - page: integer >= 1 (default 1)
 * - limit: integer in [1, MAX_LIMIT] (default DEFAULT_LIMIT)
 */
export function parsePagination(searchParams: URLSearchParams): Pagination {
  const pageRaw = Number.parseInt(searchParams.get("page") ?? "", 10)
  const limitRaw = Number.parseInt(searchParams.get("limit") ?? "", 10)

  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, MAX_LIMIT) : DEFAULT_LIMIT

  return { page, limit, skip: (page - 1) * limit }
}

/**
 * Build the standard paginated envelope returned by list endpoints.
 */
export function paginatedResponse<T>(
  rows: T[],
  total: number,
  pagination: Pagination,
): {
  data: T[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
} {
  return {
    data: rows,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.limit)),
    },
  }
}

/** Read a trimmed, non-empty string query param or undefined. */
export function strParam(searchParams: URLSearchParams, key: string): string | undefined {
  const v = searchParams.get(key)?.trim()
  return v && v.length > 0 ? v : undefined
}

/**
 * Validate a value against an allowed set, returning a fallback when missing
 * and `null` when present-but-invalid (so callers can 400).
 */
export function enumParam<T extends string>(
  searchParams: URLSearchParams,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T | null {
  const raw = searchParams.get(key)?.trim()
  if (!raw) return fallback
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : null
}

/** Parse an ISO date param. Returns undefined if absent, null if invalid. */
export function dateParam(searchParams: URLSearchParams, key: string): Date | null | undefined {
  const raw = searchParams.get(key)?.trim()
  if (!raw) return undefined
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Standard 400 for invalid query params. */
export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 })
}

/** Standard 404 for missing entities. */
export function notFound(message = "Not found"): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Validate a UUID before hitting Prisma. A malformed UUID against a `@db.Uuid`
 * column throws at the driver level (P2023); we'd rather return a clean 404.
 */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}
