"use client"

import { useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useAdminList } from "./use-admin-list"
import {
  EmptyState,
  ErrorState,
  formatDateTime,
  LoadingState,
  MetadataPreview,
  Pagination,
} from "./ui"

interface AuditRow {
  id: string
  action: string
  accessLevel: string
  entityType: string | null
  entityId: string | null
  metadata: unknown
  createdAt: string
  internalUser: { id: string; email: string; name: string | null } | null
  organization: { id: string; name: string } | null
}

export default function AuditLogsView() {
  // Seed filters from the URL so detail-page deep-links (?organizationId / ?internalUserId) work.
  const searchParams = useSearchParams()
  const [organizationId, setOrganizationId] = useState(searchParams.get("organizationId") ?? "")
  const [internalUserId, setInternalUserId] = useState(searchParams.get("internalUserId") ?? "")
  const [action, setAction] = useState("")
  const [accessLevel, setAccessLevel] = useState("")
  const [entityType, setEntityType] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [page, setPage] = useState(1)

  const { rows, pagination, loading, error } = useAdminList<AuditRow>(
    "/api/admin/audit-logs",
    { organizationId, internalUserId, action, accessLevel, entityType, from, to },
    page,
  )

  const resetPage = () => setPage(1)

  return (
    <section className="rounded-lg border border-neutral-200 bg-white">
      <header className="space-y-2 border-b border-neutral-200 px-4 py-3">
        <h2 className="text-lg font-semibold">Internal Audit Logs</h2>
        <div className="flex flex-wrap gap-2">
          <input
            value={action}
            onChange={(e) => {
              setAction(e.target.value)
              resetPage()
            }}
            placeholder="action (exact)"
            className="w-40 rounded border border-neutral-300 px-2 py-1 text-xs"
          />
          <input
            value={organizationId}
            onChange={(e) => {
              setOrganizationId(e.target.value)
              resetPage()
            }}
            placeholder="organizationId"
            className="w-48 rounded border border-neutral-300 px-2 py-1 text-xs"
          />
          <input
            value={internalUserId}
            onChange={(e) => {
              setInternalUserId(e.target.value)
              resetPage()
            }}
            placeholder="internalUserId"
            className="w-48 rounded border border-neutral-300 px-2 py-1 text-xs"
          />
          <input
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value)
              resetPage()
            }}
            placeholder="entityType"
            className="w-32 rounded border border-neutral-300 px-2 py-1 text-xs"
          />
          <select
            value={accessLevel}
            onChange={(e) => {
              setAccessLevel(e.target.value)
              resetPage()
            }}
            className="rounded border border-neutral-300 px-2 py-1 text-xs"
          >
            <option value="">Any level</option>
            <option value="owner_view">owner_view</option>
            <option value="employee_view">employee_view</option>
          </select>
          <label className="flex items-center gap-1 text-xs text-neutral-500">
            from
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value)
                resetPage()
              }}
              className="rounded border border-neutral-300 px-1 py-1 text-xs"
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-neutral-500">
            to
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value)
                resetPage()
              }}
              className="rounded border border-neutral-300 px-1 py-1 text-xs"
            />
          </label>
        </div>
      </header>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : rows.length === 0 ? (
        <EmptyState message="No audit events found" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Internal user</th>
                <th className="px-4 py-2 font-medium">Organization</th>
                <th className="px-4 py-2 font-medium">Level</th>
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Entity</th>
                <th className="px-4 py-2 font-medium">Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((r) => (
                <tr key={r.id} className="align-top hover:bg-neutral-50">
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-neutral-600">
                    {formatDateTime(r.createdAt)}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {r.internalUser ? (
                      <Link
                        href={`/users/${r.internalUser.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {r.internalUser.email}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {r.organization ? (
                      <Link
                        href={`/organizations/${r.organization.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {r.organization.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className="font-mono text-[11px]">{r.accessLevel}</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className="font-mono text-[11px] font-medium">{r.action}</span>
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {r.entityType ? (
                      <div>
                        <div>{r.entityType}</div>
                        {r.entityId && (
                          <div className="font-mono text-[10px] text-neutral-400">{r.entityId}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <MetadataPreview value={r.metadata} />
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
