"use client"

import { useState } from "react"
import Link from "next/link"
import { useAdminList } from "./use-admin-list"
import {
  LEVEL_BUTTON_LABEL,
  preselectUrl,
  selectorUrl,
  type InternalAccessLevel,
} from "../lib/main-app-links"
import {
  CopyButton,
  EmptyState,
  ErrorState,
  formatDateTime,
  LoadingState,
  Pagination,
  StatusBadge,
} from "./ui"

interface OrgRow {
  id: string
  name: string
  status: string
  timezone: string
  currency: string
  owner: { id: string; name: string | null; email: string } | null
  membersCount: number
  employeesCount: number
  locationsCount: number
  createdAt: string
  updatedAt: string
  lastActivityAt: string
}

export default function OrganizationsView({
  mainAppUrl,
  enabledLevels,
}: {
  mainAppUrl: string
  enabledLevels: InternalAccessLevel[]
}) {
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("")
  const [sort, setSort] = useState("createdAt")
  const [order, setOrder] = useState("desc")
  const [page, setPage] = useState(1)

  const { rows, pagination, loading, error } = useAdminList<OrgRow>(
    "/api/admin/organizations",
    { search, status, sort, order },
    page,
  )

  const openSelector = selectorUrl(mainAppUrl) || "/internal"
  const levels: InternalAccessLevel[] = ["owner_view", "employee_view"].filter((l) =>
    enabledLevels.includes(l as InternalAccessLevel),
  ) as InternalAccessLevel[]

  return (
    <section className="rounded-lg border border-neutral-200 bg-white">
      <header className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-4 py-3">
        <h2 className="mr-auto text-lg font-semibold">Organizations</h2>
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          placeholder="Search name / owner…"
          className="w-56 rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        >
          <option value="">All statuses</option>
          <option value="active">active</option>
          <option value="draft">draft</option>
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
          <option value="name:asc">Name A–Z</option>
          <option value="name:desc">Name Z–A</option>
        </select>
      </header>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : rows.length === 0 ? (
        <EmptyState message="No organizations found" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Owner</th>
                <th className="px-4 py-2 font-medium">Members</th>
                <th className="px-4 py-2 font-medium">Employees</th>
                <th className="px-4 py-2 font-medium">Locations</th>
                <th className="px-4 py-2 font-medium">Created</th>
                <th className="px-4 py-2 font-medium">Updated</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((o) => (
                <tr key={o.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-2">
                    <Link
                      href={`/organizations/${o.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {o.name}
                    </Link>
                    <div className="font-mono text-[10px] text-neutral-400">{o.id}</div>
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-4 py-2">
                    {o.owner ? (
                      <div>
                        <div>{o.owner.name || "—"}</div>
                        <div className="text-xs text-neutral-500">{o.owner.email}</div>
                      </div>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 tabular-nums">{o.membersCount}</td>
                  <td className="px-4 py-2 tabular-nums">{o.employeesCount}</td>
                  <td className="px-4 py-2 tabular-nums">{o.locationsCount}</td>
                  <td className="px-4 py-2 text-xs text-neutral-600">{formatDateTime(o.createdAt)}</td>
                  <td className="px-4 py-2 text-xs text-neutral-600">{formatDateTime(o.updatedAt)}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <CopyButton value={o.id} />
                      <a
                        href={openSelector}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded border border-neutral-300 bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-700 hover:bg-neutral-50"
                        title="Opens the internal selector on the main app, which re-checks your access."
                      >
                        Open selector ↗
                      </a>
                      {levels.map((level) => (
                        <a
                          key={level}
                          href={preselectUrl(mainAppUrl, o.id, level)}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded border border-blue-300 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100"
                          title="Hands off to the main app, which re-checks your access before opening."
                        >
                          {LEVEL_BUTTON_LABEL[level]} ↗
                        </a>
                      ))}
                    </div>
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
