"use client"

/**
 * Floating "Internal mode" badge shown on top of the regular owner/worker UI
 * when the authenticated user has an active InternalAccessSession.
 *
 * - Invisible to regular users (the fetch returns 403 for them and we render null).
 * - Self-contained: no props needed; it talks directly to /api/internal/access-session/{current,end}.
 *
 * Place it once at the app layout level so it surfaces on every /app route.
 */
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Shield, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"

type AccessLevel = "owner_view" | "employee_view"

interface ActiveSession {
  id: string
  organizationId: string
  organization: { id: string; name: string; status: string } | null
  accessLevel: AccessLevel
  startedAt: string
}

const LEVEL_LABELS: Record<AccessLevel, string> = {
  owner_view: "Owner View",
  employee_view: "Employee View",
}

export default function InternalModeBadge() {
  const router = useRouter()
  const [session, setSession] = useState<ActiveSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch("/api/internal/access-session/current", { credentials: "include" })
        if (!res.ok) {
          // 403 for regular users — silently render nothing.
          if (!cancelled) setSession(null)
          return
        }
        const json = await res.json().catch(() => null)
        if (!cancelled) setSession(json?.data ?? null)
      } catch {
        if (!cancelled) setSession(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const exit = async () => {
    setExiting(true)
    try {
      const res = await fetch("/api/internal/access-session/end", {
        method: "POST",
        credentials: "include",
      })
      const json = await res.json().catch(() => null)
      router.push(json?.redirectTo ?? "/internal")
      router.refresh()
    } catch {
      router.push("/internal")
      router.refresh()
    }
  }

  if (loading || !session) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-3 pt-[max(env(safe-area-inset-top),0.5rem)]"
      data-testid="internal-mode-badge"
    >
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-amber-300/70 bg-amber-50/95 px-3 py-1 text-xs font-medium text-amber-900 shadow-sm backdrop-blur-sm dark:border-amber-500/40 dark:bg-amber-950/80 dark:text-amber-200">
        <Shield className="h-3.5 w-3.5" />
        <span>Internal mode: {LEVEL_LABELS[session.accessLevel]}</span>
        {session.organization?.name ? (
          <span className="hidden sm:inline">· {session.organization.name}</span>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className="ml-1 h-6 gap-1 rounded-full px-2 py-0 text-[11px] font-medium text-amber-900 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/60"
          onClick={exit}
          disabled={exiting}
        >
          <LogOut className="h-3 w-3" />
          {exiting ? "Выход…" : "Exit"}
        </Button>
      </div>
    </div>
  )
}
