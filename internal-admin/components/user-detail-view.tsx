"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  CopyButton,
  EmptyState,
  ErrorState,
  formatDateTime,
  formatDuration,
  LoadingState,
  MetadataPreview,
  Section,
} from "./ui"

interface UserDetail {
  user: {
    id: string
    email: string
    name: string | null
    isInternal: boolean
    status: string
    createdAt: string
    updatedAt: string
    enabledInternalLevels: string[]
    counts: { memberships: number; employees: number }
  }
  internalAccess: Array<{
    id: string
    accessLevel: string
    scope: string
    enabled: boolean
    createdAt: string
    updatedAt: string
  }>
  memberships: Array<{
    id: string
    organization: { id: string; name: string; status: string } | null
    roleKey: string | null
    roleName: string | null
    isActive: boolean
    joinedAt: string
  }>
  internalSessions: Array<{
    id: string
    organization: { id: string; name: string } | null
    accessLevel: string
    startedAt: string
    endedAt: string | null
    durationMs: number | null
    active: boolean
  }>
  internalAudit: Array<{
    id: string
    action: string
    accessLevel: string
    entityType: string | null
    entityId: string | null
    metadata: unknown
    createdAt: string
    organization: { id: string; name: string } | null
  }>
}

export default function UserDetailView({ id }: { id: string }) {
  const [data, setData] = useState<UserDetail | null>(null)
  const [status, setStatus] = useState<"loading" | "ok" | "notfound" | "error">("loading")

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/admin/users/${id}`, { credentials: "include" })
        if (res.status === 404) {
          if (!cancelled) setStatus("notfound")
          return
        }
        if (!res.ok) {
          if (!cancelled) setStatus("error")
          return
        }
        const json = (await res.json()) as UserDetail
        if (!cancelled) {
          setData(json)
          setStatus("ok")
        }
      } catch {
        if (!cancelled) setStatus("error")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  if (status === "loading") return <LoadingState />
  if (status === "notfound")
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <EmptyState message="User not found" />
        <div className="text-center">
          <Link href="/users" className="text-sm text-blue-600 hover:underline">
            ← Back to users
          </Link>
        </div>
      </div>
    )
  if (status === "error" || !data) return <ErrorState message="Failed to load user" />

  const u = data.user

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 text-xs text-neutral-500">
            <Link href="/users" className="hover:underline">
              Users
            </Link>{" "}
            / detail
          </div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            {u.email}
            {u.isInternal ? (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                internal
              </span>
            ) : (
              <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
                regular
              </span>
            )}
          </h1>
          <div className="mt-1 font-mono text-[11px] text-neutral-400">{u.id}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton value={u.id} label="Copy id" />
          {u.isInternal && (
            <Link
              href={`/audit-logs?internalUserId=${u.id}`}
              className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Audit logs
            </Link>
          )}
        </div>
      </div>

      {/* Overview */}
      <Section title="Overview">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 px-4 py-3 text-sm sm:grid-cols-3">
          <Field label="Name" value={u.name || "—"} />
          <Field label="Status" value={u.status} />
          <Field label="Internal" value={u.isInternal ? "yes" : "no"} />
          <Field
            label="Enabled levels"
            value={u.enabledInternalLevels.length ? u.enabledInternalLevels.join(", ") : "—"}
          />
          <Field label="Memberships" value={String(u.counts.memberships)} />
          <Field label="Employee profiles" value={String(u.counts.employees)} />
          <Field label="Created" value={formatDateTime(u.createdAt)} />
          <Field label="Updated" value={formatDateTime(u.updatedAt)} />
        </dl>
      </Section>

      {/* Memberships */}
      <Section title="Organization memberships" count={data.memberships.length}>
        {data.memberships.length === 0 ? (
          <EmptyState message="No organization memberships" />
        ) : (
          <Table
            head={["Organization", "Role", "Active", "Joined"]}
            rows={data.memberships.map((m) => [
              m.organization ? (
                <Link
                  key="o"
                  href={`/organizations/${m.organization.id}`}
                  className="text-blue-600 hover:underline"
                >
                  {m.organization.name}
                </Link>
              ) : (
                "—"
              ),
              m.roleKey ?? "—",
              m.isActive ? "yes" : "no",
              formatDateTime(m.joinedAt),
            ])}
          />
        )}
      </Section>

      {/* Internal sections only meaningful for internal users */}
      {u.isInternal && (
        <>
          <Section title="Internal access grants" count={data.internalAccess.length}>
            {data.internalAccess.length === 0 ? (
              <EmptyState message="No internal access grants" />
            ) : (
              <Table
                head={["Level", "Scope", "Enabled", "Created", "Updated"]}
                rows={data.internalAccess.map((g) => [
                  g.accessLevel,
                  g.scope,
                  g.enabled ? "yes" : "no",
                  formatDateTime(g.createdAt),
                  formatDateTime(g.updatedAt),
                ])}
              />
            )}
          </Section>

          <Section title="Recent internal sessions" count={data.internalSessions.length}>
            {data.internalSessions.length === 0 ? (
              <EmptyState message="No internal sessions" />
            ) : (
              <Table
                head={["Organization", "Level", "Started", "Ended", "Duration", "State"]}
                rows={data.internalSessions.map((s) => [
                  s.organization ? (
                    <Link
                      key="o"
                      href={`/organizations/${s.organization.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {s.organization.name}
                    </Link>
                  ) : (
                    "—"
                  ),
                  s.accessLevel,
                  formatDateTime(s.startedAt),
                  formatDateTime(s.endedAt),
                  formatDuration(s.durationMs),
                  s.active ? (
                    <span key="a" className="font-medium text-green-700">
                      active
                    </span>
                  ) : (
                    "ended"
                  ),
                ])}
              />
            )}
          </Section>

          <Section title="Recent internal audit events" count={data.internalAudit.length}>
            {data.internalAudit.length === 0 ? (
              <EmptyState message="No audit events" />
            ) : (
              <Table
                head={["When", "Organization", "Action", "Level", "Entity", "Metadata"]}
                rows={data.internalAudit.map((e) => [
                  formatDateTime(e.createdAt),
                  e.organization ? (
                    <Link
                      key="o"
                      href={`/organizations/${e.organization.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {e.organization.name}
                    </Link>
                  ) : (
                    "—"
                  ),
                  <span key="a" className="font-mono text-[11px] font-medium">
                    {e.action}
                  </span>,
                  e.accessLevel,
                  e.entityType ? `${e.entityType}${e.entityId ? ` (${e.entityId})` : ""}` : "—",
                  <MetadataPreview key="m" value={e.metadata} />,
                ])}
              />
            )}
          </Section>
        </>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  )
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-left text-[11px] uppercase tracking-wide text-neutral-500">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.map((cells, i) => (
            <tr key={i} className="hover:bg-neutral-50">
              {cells.map((c, j) => (
                <td key={j} className="px-4 py-2 align-top">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
