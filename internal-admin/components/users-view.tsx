"use client"

import { useState } from "react"
import Link from "next/link"
import { useAdminList } from "./use-admin-list"
import {
  CopyButton,
  EmptyState,
  ErrorState,
  formatDateTime,
  LoadingState,
  Pagination,
} from "./ui"

interface UserRow {
  id: string
  email: string
  name: string | null
  isInternal: boolean
  status: string
  enabledInternalLevels: string[]
  membershipsCount: number
  createdAt: string
  updatedAt: string
}

export default function UsersView() {
  const [search, setSearch] = useState("")
  const [isInternal, setIsInternal] = useState("")
  const [level, setLevel] = useState("")
  const [sort, setSort] = useState("createdAt")
  const [order, setOrder] = useState("desc")
  const [page, setPage] = useState(1)

  const { rows, pagination, loading, error } = useAdminList<UserRow>(
    "/api/admin/users",
    { search, isInternal, level, sort, order },
    page,
  )

  return (
    <section className="rounded-lg border border-neutral-200 bg-white">
      <header className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-4 py-3">
        <h2 className="mr-auto text-lg font-semibold">Users</h2>
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          placeholder="Search email / name…"
          className="w-56 rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <select
          value={isInternal}
          onChange={(e) => {
            setIsInternal(e.target.value)
            setPage(1)
          }}
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        >
          <option value="">All users</option>
          <option value="true">Internal only</option>
          <option value="false">Regular only</option>
        </select>
        <select
          value={level}
          onChange={(e) => {
            setLevel(e.target.value)
            setPage(1)
          }}
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        >
          <option value="">Any level</option>
          <option value="super_admin">super_admin</option>
          <option value="owner_view">owner_view</option>
          <option value="employee_view">employee_view</option>
        </select>
        <select
          value={`${sort}:${order}`}
          onChange={(e) => {
            const [s, o] = e.target.value.split(":")
            setSort(s)
            setOrder(o)
            setPage(1)
          }}
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        >
          <option value="createdAt:desc">Newest</option>
          <option value="createdAt:asc">Oldest</option>
          <option value="updatedAt:desc">Recently updated</option>
          <option value="email:asc">Email A–Z</option>
          <option value="email:desc">Email Z–A</option>
        </select>
      </header>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : rows.length === 0 ? (
        <EmptyState message="No users found" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Internal levels</th>
                <th className="px-4 py-2 font-medium">Memberships</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Created</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((u) => (
                <tr key={u.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-2">
                    <Link href={`/users/${u.id}`} className="font-medium text-blue-600 hover:underline">
                      {u.email}
                    </Link>
                    <div className="font-mono text-[10px] text-neutral-400">{u.id}</div>
                  </td>
                  <td className="px-4 py-2">{u.name || <span className="text-neutral-400">—</span>}</td>
                  <td className="px-4 py-2">
                    {u.isInternal ? (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                        internal
                      </span>
                    ) : (
                      <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
                        regular
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {u.enabledInternalLevels.length > 0 ? (
                      <span className="font-mono text-[11px]">
                        {u.enabledInternalLevels.join(", ")}
                      </span>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 tabular-nums">{u.membershipsCount}</td>
                  <td className="px-4 py-2 text-xs">{u.status}</td>
                  <td className="px-4 py-2 text-xs text-neutral-600">{formatDateTime(u.createdAt)}</td>
                  <td className="px-4 py-2">
                    <CopyButton value={u.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          onPage={(n) => setPage(n)}
        />
      )}
    </section>
  )
}
