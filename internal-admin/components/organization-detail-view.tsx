"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
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
  Section,
  StatusBadge,
} from "./ui"

interface OrgDetail {
  organization: {
    id: string
    name: string
    status: string
    timezone: string
    currency: string
    createdAt: string
    updatedAt: string
    lastActivityAt: string
    owner: { id: string; name: string | null; email: string } | null
    counts: {
      members: number
      employees: number
      locations: number
      positions: number
      accessRoles: number
      payrollRuns: number
      rules: number
      activeWorkIntervals: number
      cashSessions: number
    }
  }
  members: Array<{
    id: string
    user: { id: string; name: string | null; email: string } | null
    roleKey: string | null
    roleName: string | null
    isActive: boolean
    employmentStatus: string | null
    employeeCode: string | null
    joinedAt: string
  }>
  positions: Array<{
    id: string
    name: string
    isActive: boolean
    employeesCount: number
    rulesCount: number
    createdAt: string
  }>
  accessRoles: Array<{
    id: string
    key: string
    name: string
    isSystem: boolean
    isActive: boolean
    membersCount: number
    createdAt: string
  }>
  rules: Array<{
    id: string
    title: string
    type: string
    when: string
    required: boolean
    dayOfWeek: string | null
    position: { id: string; name: string } | null
    createdAt: string
    updatedAt: string
  }>
  recentAuditLogs: Array<{
    id: string
    action: string
    accessLevel: string
    entityType: string | null
    entityId: string | null
    createdAt: string
    internalUser: { id: string; email: string; name: string | null } | null
  }>
  recentWorkIntervals: Array<{
    id: string
    status: string
    startAt: string
    endAt: string
    employeeName: string | null
    positionName: string | null
  }>
  recentCashSessions: Array<{
    id: string
    status: string
    openedAt: string | null
    closedAt: string | null
    cashRegisterName: string | null
  }>
  recentPayrollRuns: Array<{
    id: string
    status: string
    periodStart: string
    periodEnd: string
    createdAt: string
  }>
}

const COUNT_CARDS: Array<{ key: keyof OrgDetail["organization"]["counts"]; label: string }> = [
  { key: "members", label: "Members" },
  { key: "employees", label: "Employees" },
  { key: "locations", label: "Locations" },
  { key: "positions", label: "Positions" },
  { key: "accessRoles", label: "Roles" },
  { key: "rules", label: "Rules" },
  { key: "activeWorkIntervals", label: "Active shifts" },
  { key: "cashSessions", label: "Cash sessions" },
  { key: "payrollRuns", label: "Payroll runs" },
]

export default function OrganizationDetailView({
  id,
  mainAppUrl,
  enabledLevels,
}: {
  id: string
  mainAppUrl: string
  enabledLevels: InternalAccessLevel[]
}) {
  const [data, setData] = useState<OrgDetail | null>(null)
  const [status, setStatus] = useState<"loading" | "ok" | "notfound" | "error">("loading")

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/admin/organizations/${id}`, { credentials: "include" })
        if (res.status === 404) {
          if (!cancelled) setStatus("notfound")
          return
        }
        if (!res.ok) {
          if (!cancelled) setStatus("error")
          return
        }
        const json = (await res.json()) as OrgDetail
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
        <EmptyState message="Organization not found" />
        <div className="text-center">
          <Link href="/organizations" className="text-sm text-blue-600 hover:underline">
            ← Back to organizations
          </Link>
        </div>
      </div>
    )
  if (status === "error" || !data) return <ErrorState message="Failed to load organization" />

  const o = data.organization
  const openSelector = selectorUrl(mainAppUrl) || "/internal"
  const levels: InternalAccessLevel[] = ["owner_view", "employee_view"].filter((l) =>
    enabledLevels.includes(l as InternalAccessLevel),
  ) as InternalAccessLevel[]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 text-xs text-neutral-500">
            <Link href="/organizations" className="hover:underline">
              Organizations
            </Link>{" "}
            / detail
          </div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            {o.name}
            <StatusBadge status={o.status} />
          </h1>
          <div className="mt-1 font-mono text-[11px] text-neutral-400">{o.id}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton value={o.id} label="Copy id" />
          <Link
            href={`/audit-logs?organizationId=${o.id}`}
            className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Audit logs
          </Link>
          <a
            href={openSelector}
            target="_blank"
            rel="noreferrer"
            className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
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
              className="rounded border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
              title="Hands off to the main app, which re-checks your access before opening."
            >
              {LEVEL_BUTTON_LABEL[level]} ↗
            </a>
          ))}
        </div>
      </div>

      {/* Overview */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {COUNT_CARDS.map((c) => (
          <div key={c.key} className="rounded-lg border border-neutral-200 bg-white p-3">
            <div className="text-[11px] uppercase tracking-wide text-neutral-500">{c.label}</div>
            <div className="mt-0.5 text-xl font-semibold">{o.counts[c.key].toLocaleString()}</div>
          </div>
        ))}
      </div>

      <Section title="Overview">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 px-4 py-3 text-sm sm:grid-cols-3">
          <Field label="Timezone" value={o.timezone} />
          <Field label="Currency" value={o.currency} />
          <Field label="Owner / creator" value={o.owner ? `${o.owner.name || o.owner.email}` : "—"} />
          <Field label="Created" value={formatDateTime(o.createdAt)} />
          <Field label="Updated" value={formatDateTime(o.updatedAt)} />
          <Field label="Last activity (approx)" value={formatDateTime(o.lastActivityAt)} />
        </dl>
      </Section>

      {/* Members */}
      <Section title="Members" count={data.members.length}>
        {data.members.length === 0 ? (
          <EmptyState message="No members" />
        ) : (
          <Table
            head={["User", "Role", "Employment", "Active", "Joined"]}
            rows={data.members.map((m) => [
              m.user ? (
                <Link
                  key="u"
                  href={`/users/${m.user.id}`}
                  className="text-blue-600 hover:underline"
                >
                  {m.user.email}
                </Link>
              ) : (
                "—"
              ),
              m.roleKey ?? "—",
              m.employmentStatus ?? "—",
              m.isActive ? "yes" : "no",
              formatDateTime(m.joinedAt),
            ])}
          />
        )}
      </Section>

      {/* Positions + Roles */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Positions" count={data.positions.length}>
          {data.positions.length === 0 ? (
            <EmptyState message="No positions" />
          ) : (
            <Table
              head={["Name", "Active", "Employees", "Rules", "Created"]}
              rows={data.positions.map((p) => [
                p.name,
                p.isActive ? "yes" : "no",
                String(p.employeesCount),
                String(p.rulesCount),
                formatDateTime(p.createdAt),
              ])}
            />
          )}
        </Section>

        <Section title="Roles" count={data.accessRoles.length}>
          {data.accessRoles.length === 0 ? (
            <EmptyState message="No roles" />
          ) : (
            <Table
              head={["Key", "Name", "System", "Members", "Created"]}
              rows={data.accessRoles.map((r) => [
                r.key,
                r.name,
                r.isSystem ? "yes" : "no",
                String(r.membersCount),
                formatDateTime(r.createdAt),
              ])}
            />
          )}
        </Section>
      </div>

      {/* Rules */}
      <Section title="Rules" count={data.rules.length}>
        {data.rules.length === 0 ? (
          <EmptyState message="No rules" />
        ) : (
          <Table
            head={["Title", "Type", "When", "Day", "Required", "Position", "Updated"]}
            rows={data.rules.map((r) => [
              r.title,
              r.type,
              r.when,
              r.dayOfWeek ?? "default",
              r.required ? "yes" : "no",
              r.position?.name ?? "—",
              formatDateTime(r.updatedAt),
            ])}
          />
        )}
      </Section>

      {/* Recent activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Recent audit events" count={data.recentAuditLogs.length}>
          {data.recentAuditLogs.length === 0 ? (
            <EmptyState message="No audit events" />
          ) : (
            <ul className="divide-y divide-neutral-100">
              {data.recentAuditLogs.map((e) => (
                <li key={e.id} className="px-4 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-medium">{e.action}</span>
                    <span className="text-neutral-500">{formatDateTime(e.createdAt)}</span>
                  </div>
                  <div className="mt-0.5 text-neutral-500">
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
                    · {e.accessLevel} · {e.entityType ?? "—"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Recent work intervals" count={data.recentWorkIntervals.length}>
          {data.recentWorkIntervals.length === 0 ? (
            <EmptyState message="No work intervals" />
          ) : (
            <Table
              head={["Status", "Employee", "Position", "Start"]}
              rows={data.recentWorkIntervals.map((w) => [
                w.status,
                w.employeeName ?? "—",
                w.positionName ?? "—",
                formatDateTime(w.startAt),
              ])}
            />
          )}
        </Section>

        <Section title="Recent cash sessions" count={data.recentCashSessions.length}>
          {data.recentCashSessions.length === 0 ? (
            <EmptyState message="No cash sessions" />
          ) : (
            <Table
              head={["Status", "Register", "Opened", "Closed"]}
              rows={data.recentCashSessions.map((c) => [
                c.status,
                c.cashRegisterName ?? "—",
                formatDateTime(c.openedAt),
                formatDateTime(c.closedAt),
              ])}
            />
          )}
        </Section>

        <Section title="Recent payroll runs" count={data.recentPayrollRuns.length}>
          {data.recentPayrollRuns.length === 0 ? (
            <EmptyState message="No payroll runs" />
          ) : (
            <Table
              head={["Status", "Period start", "Period end", "Created"]}
              rows={data.recentPayrollRuns.map((p) => [
                p.status,
                formatDateTime(p.periodStart),
                formatDateTime(p.periodEnd),
                formatDateTime(p.createdAt),
              ])}
            />
          )}
        </Section>
      </div>
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
