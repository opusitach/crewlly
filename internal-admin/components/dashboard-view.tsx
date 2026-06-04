"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ErrorState, formatDateTime, LoadingState, StatusBadge } from "./ui"

interface Summary {
  counts: {
    totalOrganizations: number
    activeOrganizations: number
    regularUsers: number
    internalUsers: number
    organizationMembers: number
    employees: number
    auditLogs: number
  }
  latestOrganizations: Array<{ id: string; name: string; status: string; createdAt: string }>
  latestAuditEvents: Array<{
    id: string
    action: string
    accessLevel: string
    entityType: string | null
    createdAt: string
    internalUser: { id: string; email: string; name: string | null } | null
    organization: { id: string; name: string } | null
  }>
}

const CARDS: Array<{ key: keyof Summary["counts"]; label: string }> = [
  { key: "totalOrganizations", label: "Organizations" },
  { key: "activeOrganizations", label: "Active orgs" },
  { key: "regularUsers", label: "Regular users" },
  { key: "internalUsers", label: "Internal users" },
  { key: "organizationMembers", label: "Org members" },
  { key: "employees", label: "Employees" },
  { key: "auditLogs", label: "Audit events" },
]

export default function DashboardView() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/admin/dashboard/summary", { credentials: "include" })
        if (!res.ok) {
          if (!cancelled) setError("Failed to load dashboard")
          return
        }
        const json = (await res.json()) as Summary
        if (!cancelled) setSummary(json)
      } catch {
        if (!cancelled) setError("Network error")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <section className="rounded-lg border border-neutral-200 bg-white p-6">
        <LoadingState />
      </section>
    )
  }
  if (error || !summary) {
    return (
      <section className="rounded-lg border border-neutral-200 bg-white p-6">
        <ErrorState message={error ?? "No data"} />
      </section>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CARDS.map((c) => (
          <div key={c.key} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">{c.label}</div>
            <div className="mt-1 text-2xl font-semibold text-neutral-900">
              {summary.counts[c.key].toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-neutral-200 bg-white">
          <header className="border-b border-neutral-200 px-4 py-3 text-sm font-semibold">
            Latest organizations
          </header>
          {summary.latestOrganizations.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-neutral-500">No organizations</div>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {summary.latestOrganizations.map((o) => (
                <li key={o.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <Link
                      href={`/organizations/${o.id}`}
                      className="truncate font-medium text-blue-600 hover:underline"
                    >
                      {o.name}
                    </Link>
                    <div className="text-xs text-neutral-500">{formatDateTime(o.createdAt)}</div>
                  </div>
                  <StatusBadge status={o.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-neutral-200 bg-white">
          <header className="border-b border-neutral-200 px-4 py-3 text-sm font-semibold">
            Latest internal audit events
          </header>
          {summary.latestAuditEvents.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-neutral-500">No audit events</div>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {summary.latestAuditEvents.map((e) => (
                <li key={e.id} className="px-4 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-medium text-neutral-800">
                      {e.action}
                    </span>
                    <span className="text-xs text-neutral-500">{formatDateTime(e.createdAt)}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {e.internalUser ? (
                      <Link
                        href={`/users/${e.internalUser.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {e.internalUser.email}
                      </Link>
                    ) : (
                      "—"
                    )}{" "}
                    ·{" "}
                    {e.organization ? (
                      <Link
                        href={`/organizations/${e.organization.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {e.organization.name}
                      </Link>
                    ) : (
                      "—"
                    )}{" "}
                    · {e.accessLevel}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
