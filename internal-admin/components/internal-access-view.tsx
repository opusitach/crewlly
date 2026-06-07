"use client"

/**
 * Internal access management table (super_admin only — the page gate enforces it).
 *
 * Per internal user, shows enabled levels and grant/revoke buttons. Every
 * grant/revoke goes through a confirmation modal with explicit, blunt copy, then
 * hits the backend (which re-checks authorization and all invariants — the UI is
 * never trusted). On success we patch the row in place from the returned
 * enabledInternalLevels.
 */
import { useState } from "react"
import { useAdminList } from "./use-admin-list"
import {
  EmptyState,
  ErrorState,
  formatDateTime,
  LoadingState,
  Pagination,
} from "./ui"

type AccessLevel = "owner_view" | "employee_view" | "super_admin"
type Action = "grant" | "revoke"

const LEVELS: AccessLevel[] = ["owner_view", "employee_view", "super_admin"]

const LEVEL_LABEL: Record<AccessLevel, string> = {
  owner_view: "owner_view",
  employee_view: "employee_view",
  super_admin: "super_admin",
}

// Blunt confirmation copy per (action, level).
const CONFIRM_COPY: Record<Action, Record<AccessLevel, string>> = {
  grant: {
    owner_view:
      "This user will be able to open any organization as owner and perform owner actions.",
    employee_view: "This user will be able to open any organization as employee.",
    super_admin:
      "This user will be able to manage internal access for other internal users.",
  },
  revoke: {
    owner_view:
      "This user will no longer be able to open organizations as owner. Any active owner sessions will be ended.",
    employee_view:
      "This user will no longer be able to open organizations as employee. Any active employee sessions will be ended.",
    super_admin:
      "You are removing super_admin access. This user will no longer be able to manage internal access.",
  },
}

interface UserRow {
  id: string
  email: string
  name: string | null
  isInternal: boolean
  status: string
  enabledInternalLevels: AccessLevel[]
  createdAt: string
  updatedAt: string
}

interface PendingAction {
  user: UserRow
  level: AccessLevel
  action: Action
}

export default function InternalAccessView({ currentUserId }: { currentUserId: string }) {
  const [search, setSearch] = useState("")
  const [level, setLevel] = useState("")
  const [page, setPage] = useState(1)

  const { rows, pagination, loading, error, reload } = useAdminList<UserRow>(
    "/api/admin/internal-access",
    { search, level },
    page,
  )

  // Local overrides so a grant/revoke reflects immediately without a full reload.
  const [overrides, setOverrides] = useState<Record<string, AccessLevel[]>>({})
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)

  const levelsFor = (u: UserRow): AccessLevel[] => overrides[u.id] ?? u.enabledInternalLevels

  const submit = async () => {
    if (!pending) return
    setSubmitting(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/admin/internal-access/${pending.action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ targetUserId: pending.user.id, accessLevel: pending.level }),
      })
      const json = (await res.json().catch(() => null)) as
        | { enabledInternalLevels?: AccessLevel[]; error?: string }
        | null
      if (!res.ok) {
        setActionError(
          (json && typeof json.error === "string" && json.error) ||
            (res.status === 409
              ? "Cannot revoke the last super_admin in the system."
              : "Action failed."),
        )
        return
      }
      if (json?.enabledInternalLevels) {
        setOverrides((o) => ({ ...o, [pending.user.id]: json.enabledInternalLevels! }))
      }
      setBanner(
        `${pending.action === "grant" ? "Granted" : "Revoked"} ${LEVEL_LABEL[pending.level]} ` +
          `for ${pending.user.email}.`,
      )
      setPending(null)
    } catch {
      setActionError("Network error.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="rounded-lg border border-neutral-200 bg-white">
      <header className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-4 py-3">
        <h2 className="mr-auto text-lg font-semibold">Internal Access</h2>
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
          value={level}
          onChange={(e) => {
            setLevel(e.target.value)
            setPage(1)
          }}
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        >
          <option value="">All levels</option>
          <option value="super_admin">super_admin</option>
          <option value="owner_view">owner_view</option>
          <option value="employee_view">employee_view</option>
        </select>
      </header>

      {banner && (
        <div className="mx-4 mt-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {banner}
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : rows.length === 0 ? (
        <EmptyState message="No internal users found" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Email / Name</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Enabled levels</th>
                <th className="px-4 py-2 font-medium">Created</th>
                <th className="px-4 py-2 font-medium">Updated</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((u) => {
                const levels = levelsFor(u)
                return (
                  <tr key={u.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-2">
                      <div className="font-medium">{u.email}</div>
                      <div className="text-xs text-neutral-500">{u.name || "—"}</div>
                      <div className="font-mono text-[10px] text-neutral-400">
                        {u.id}
                        {u.id === currentUserId && (
                          <span className="ml-1 rounded bg-blue-100 px-1 text-blue-700">you</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs">{u.status}</td>
                    <td className="px-4 py-2">
                      {levels.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {levels.map((l) => (
                            <span
                              key={l}
                              className="rounded bg-amber-100 px-2 py-0.5 font-mono text-[11px] text-amber-800"
                            >
                              {l}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-neutral-600">
                      {formatDateTime(u.createdAt)}
                    </td>
                    <td className="px-4 py-2 text-xs text-neutral-600">
                      {formatDateTime(u.updatedAt)}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {LEVELS.map((l) => {
                          const has = levels.includes(l)
                          const action: Action = has ? "revoke" : "grant"
                          return (
                            <button
                              key={l}
                              type="button"
                              onClick={() => {
                                setActionError(null)
                                setPending({ user: u, level: l, action })
                              }}
                              className={
                                "rounded border px-2 py-0.5 text-[11px] font-medium " +
                                (has
                                  ? "border-red-300 bg-white text-red-700 hover:bg-red-50"
                                  : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50")
                              }
                            >
                              {has ? "Revoke" : "Grant"} {l}
                            </button>
                          )
                        })}
                      </div>
                    </td>
                  </tr>
                )
              })}
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

      {pending && (
        <ConfirmModal
          pending={pending}
          submitting={submitting}
          error={actionError}
          onCancel={() => {
            if (submitting) return
            setPending(null)
            setActionError(null)
          }}
          onConfirm={submit}
        />
      )}
    </section>
  )
}

function ConfirmModal({
  pending,
  submitting,
  error,
  onCancel,
  onConfirm,
}: {
  pending: PendingAction
  submitting: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}) {
  const { user, level, action } = pending
  const destructive = action === "revoke"
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-5 shadow-xl">
        <h3 className="text-base font-semibold">
          {action === "grant" ? "Grant" : "Revoke"} {LEVEL_LABEL[level]}
        </h3>
        <p className="mt-1 text-sm text-neutral-600">
          {action === "grant" ? "Granting to" : "Revoking from"}{" "}
          <span className="font-medium">{user.email}</span>
        </p>

        <div
          className={
            "mt-3 rounded border px-3 py-2 text-sm " +
            (destructive
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-amber-200 bg-amber-50 text-amber-900")
          }
        >
          {CONFIRM_COPY[action][level]}
        </div>

        {error && (
          <div className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className={
              "rounded px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 " +
              (destructive ? "bg-red-600 hover:bg-red-700" : "bg-neutral-900 hover:bg-neutral-800")
            }
          >
            {submitting
              ? "Working…"
              : action === "grant"
                ? `Grant ${level}`
                : `Revoke ${level}`}
          </button>
        </div>
      </div>
    </div>
  )
}
