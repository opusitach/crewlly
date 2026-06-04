"use client"

/**
 * Tiny shared UI primitives for the admin tables. Deliberately minimal — no
 * design-system dependency. Priority: fast, clear, reliable.
 */
import { useState } from "react"

import type { ReactNode } from "react"

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || ms < 0) return "—"
  const sec = Math.floor(ms / 1000)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function Section({
  title,
  count,
  children,
}: {
  title: string
  count?: number
  children: ReactNode
}) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {count != null && (
          <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
            {count}
          </span>
        )}
      </header>
      {children}
    </section>
  )
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function CopyButton({ value, label = "Copy id" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        } catch {
          /* clipboard may be unavailable; ignore */
        }
      }}
      className="rounded border border-neutral-300 bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-600 hover:bg-neutral-50"
      title={value}
    >
      {copied ? "Copied!" : label}
    </button>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "active"
      ? "bg-green-100 text-green-800"
      : status === "draft"
        ? "bg-neutral-100 text-neutral-700"
        : "bg-amber-100 text-amber-800"
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      {status}
    </span>
  )
}

export function Pagination({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number
  totalPages: number
  total: number
  onPage: (next: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-neutral-200 px-3 py-2 text-xs text-neutral-600">
      <div>
        {total} result{total === 1 ? "" : "s"} · page {page} / {totalPages}
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="rounded border border-neutral-300 bg-white px-2 py-1 font-medium hover:bg-neutral-50 disabled:opacity-40"
        >
          Prev
        </button>
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          className="rounded border border-neutral-300 bg-white px-2 py-1 font-medium hover:bg-neutral-50 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  )
}

export function MetadataPreview({ value }: { value: unknown }) {
  const [open, setOpen] = useState(false)
  if (value === null || value === undefined) return <span className="text-neutral-400">—</span>
  const json = JSON.stringify(value)
  const short = json.length > 60 ? json.slice(0, 60) + "…" : json
  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      className="max-w-xs truncate text-left font-mono text-[11px] text-neutral-600 hover:text-neutral-900"
      title="Toggle full metadata"
    >
      {open ? (
        <pre className="whitespace-pre-wrap break-all">{JSON.stringify(value, null, 2)}</pre>
      ) : (
        short
      )}
    </button>
  )
}

export function EmptyState({ message }: { message: string }) {
  return <div className="px-3 py-10 text-center text-sm text-neutral-500">{message}</div>
}

export function LoadingState() {
  return <div className="px-3 py-10 text-center text-sm text-neutral-500">Loading…</div>
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="px-3 py-10 text-center text-sm text-red-600">
      {message}
    </div>
  )
}
