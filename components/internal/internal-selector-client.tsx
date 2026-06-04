"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Shield, Search, Building2, Users, ExternalLink, ArrowLeft, AlertTriangle } from "lucide-react"

type InternalAccessLevel = "owner_view" | "employee_view"
type Entrypoint = "admin_preselect" | "manual_selector"

interface Organization {
  id: string
  name: string
  status: string
  timezone: string
  currency: string
  createdAt: string
  updatedAt: string
  owner: { id: string; fullName: string | null; email: string } | null
  locations: Array<{ id: string; name: string; addressText: string | null }>
  employeesCount: number
  locationsCount: number
}

interface OrgPreview {
  id: string
  name: string
  status: string
  timezone: string
  currency: string
  owner: { id: string; fullName: string | null; email: string } | null
  employeesCount: number
  locationsCount: number
}

interface Preselect {
  organizationId: string
  accessLevel: InternalAccessLevel | null
  rawAccessLevel: string | null
}

interface Props {
  enabledLevels: InternalAccessLevel[]
  currentUser: { id: string; fullName: string | null; email: string }
  preselect?: Preselect | null
}

const LEVEL_LABEL: Record<InternalAccessLevel, string> = {
  owner_view: "Owner View",
  employee_view: "Employee View",
}

export default function InternalSelectorClient({ enabledLevels, currentUser, preselect }: Props) {
  const router = useRouter()
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [openingLevel, setOpeningLevel] = useState<InternalAccessLevel | null>(null)

  const canOwnerView = enabledLevels.includes("owner_view")
  const canEmployeeView = enabledLevels.includes("employee_view")

  // Only load the full list when we're NOT in preselect mode (saves a request).
  useEffect(() => {
    if (preselect) {
      setLoading(false)
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        const res = await fetch("/api/internal/organizations", { credentials: "include" })
        if (!res.ok) {
          setError("Не удалось загрузить организации")
          return
        }
        const json = await res.json()
        if (!cancelled) setOrganizations(Array.isArray(json.data) ? json.data : [])
      } catch {
        if (!cancelled) setError("Ошибка сети")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [preselect])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return organizations
    return organizations.filter((o) => {
      if (o.name.toLowerCase().includes(q)) return true
      if (o.id.toLowerCase().includes(q)) return true
      const ownerHay = `${o.owner?.fullName ?? ""} ${o.owner?.email ?? ""}`.toLowerCase()
      if (ownerHay.includes(q)) return true
      if (o.locations.some((l) => l.name.toLowerCase().includes(q))) return true
      return false
    })
  }, [organizations, search])

  const open = async (
    organizationId: string,
    accessLevel: InternalAccessLevel,
    entrypoint: Entrypoint,
  ) => {
    setOpeningId(organizationId)
    setOpeningLevel(accessLevel)
    setError(null)
    try {
      const res = await fetch("/api/internal/access-session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ organizationId, accessLevel, entrypoint }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(typeof json?.error === "string" ? json.error : "Не удалось открыть организацию")
        return
      }
      router.push(json?.redirectTo ?? "/app")
      router.refresh()
    } catch {
      setError("Ошибка сети")
    } finally {
      setOpeningId(null)
      setOpeningLevel(null)
    }
  }

  const header = (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Internal access</h1>
          <p className="text-sm text-muted-foreground">
            {currentUser.fullName || currentUser.email} · {enabledLevels.join(", ") || "no grants"}
          </p>
        </div>
      </div>
    </header>
  )

  // ── Preselect mode ────────────────────────────────────────────────────────
  if (preselect) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
          {header}
          <PreselectCard
            preselect={preselect}
            enabledLevels={enabledLevels}
            opening={openingId === preselect.organizationId}
            error={error}
            onConfirm={(level) => open(preselect.organizationId, level, "admin_preselect")}
            onBack={() => router.push("/internal")}
          />
        </div>
      </div>
    )
  }

  // ── Normal selector mode ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        {header}

        <Card className="mb-6 p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по названию, владельцу, локации, ID…"
              className="pl-9"
            />
          </div>
        </Card>

        {error && (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <Card className="p-8 text-center text-muted-foreground">Загрузка…</Card>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            {organizations.length === 0 ? "Нет организаций" : "Ничего не найдено"}
          </Card>
        ) : (
          <div className="grid gap-3">
            {filtered.map((org) => (
              <Card key={org.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <h2 className="truncate text-base font-medium">{org.name}</h2>
                      <Badge variant="outline" className="ml-1 text-xs">
                        {org.status}
                      </Badge>
                    </div>
                    <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                      <div className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        <span>{org.employeesCount} сотр. · {org.locationsCount} лок.</span>
                      </div>
                      <div className="truncate">
                        {org.owner ? (
                          <span title={org.owner.email}>
                            Owner: {org.owner.fullName || org.owner.email}
                          </span>
                        ) : (
                          <span>Owner: —</span>
                        )}
                      </div>
                      <div>TZ: {org.timezone} · {org.currency}</div>
                      <div>Updated: {new Date(org.updatedAt).toLocaleString("ru-RU")}</div>
                    </dl>
                    {org.locations.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {org.locations.map((l) => (
                          <Badge key={l.id} variant="secondary" className="text-[10px]">
                            {l.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 font-mono text-[10px] text-muted-foreground">{org.id}</div>
                  </div>

                  <div className="flex flex-col gap-2">
                    {canOwnerView && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => open(org.id, "owner_view", "manual_selector")}
                        disabled={openingId === org.id}
                      >
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        {openingId === org.id && openingLevel === "owner_view"
                          ? "Открываю…"
                          : "Open as owner"}
                      </Button>
                    )}
                    {canEmployeeView && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => open(org.id, "employee_view", "manual_selector")}
                        disabled={openingId === org.id}
                      >
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        {openingId === org.id && openingLevel === "employee_view"
                          ? "Открываю…"
                          : "Open as employee"}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Preselect confirmation card ──────────────────────────────────────────────

function PreselectCard({
  preselect,
  enabledLevels,
  opening,
  error,
  onConfirm,
  onBack,
}: {
  preselect: Preselect
  enabledLevels: InternalAccessLevel[]
  opening: boolean
  error: string | null
  onConfirm: (level: InternalAccessLevel) => void
  onBack: () => void
}) {
  const [preview, setPreview] = useState<OrgPreview | null>(null)
  const [status, setStatus] = useState<"loading" | "ok" | "notfound" | "error">("loading")

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/internal/organizations/${preselect.organizationId}`, {
          credentials: "include",
        })
        if (res.status === 404) {
          if (!cancelled) setStatus("notfound")
          return
        }
        if (!res.ok) {
          if (!cancelled) setStatus("error")
          return
        }
        const json = await res.json()
        if (!cancelled) {
          setPreview(json.data as OrgPreview)
          setStatus("ok")
        }
      } catch {
        if (!cancelled) setStatus("error")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [preselect.organizationId])

  const levelValid = preselect.accessLevel !== null
  const hasGrant = preselect.accessLevel ? enabledLevels.includes(preselect.accessLevel) : false
  const canConfirm = status === "ok" && levelValid && hasGrant

  const backLink = (
    <button
      type="button"
      onClick={onBack}
      className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Back to organization search
    </button>
  )

  if (status === "loading") {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        Загрузка организации…
        <div>{backLink}</div>
      </Card>
    )
  }

  if (status === "notfound") {
    return (
      <Card className="p-6">
        <Notice
          tone="warning"
          title="Организация не найдена"
          body="Ссылка ведёт на организацию, которая не существует или недоступна. Вернитесь к поиску и выберите вручную."
        />
        {backLink}
      </Card>
    )
  }

  if (status === "error" || !preview) {
    return (
      <Card className="p-6">
        <Notice
          tone="warning"
          title="Не удалось загрузить организацию"
          body="Попробуйте ещё раз или вернитесь к поиску."
        />
        {backLink}
      </Card>
    )
  }

  return (
    <Card className="p-6">
      <p className="text-sm text-muted-foreground">You are about to open:</p>

      <div className="mt-3 space-y-2">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-lg font-semibold">{preview.name}</span>
          <Badge variant="outline" className="text-xs">
            {preview.status}
          </Badge>
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {preview.employeesCount} сотр. · {preview.locationsCount} лок.
          </div>
          <div className="truncate">
            {preview.owner ? `Owner: ${preview.owner.fullName || preview.owner.email}` : "Owner: —"}
          </div>
          <div>TZ: {preview.timezone} · {preview.currency}</div>
          <div className="font-mono text-[10px]">{preview.id}</div>
        </dl>
      </div>

      <div className="mt-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
        Mode:{" "}
        <span className="font-medium">
          {levelValid ? LEVEL_LABEL[preselect.accessLevel as InternalAccessLevel] : "—"}
        </span>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {!levelValid && (
        <div className="mt-4">
          <Notice
            tone="warning"
            title="Некорректный режим доступа"
            body={`Запрошенный режим «${preselect.rawAccessLevel ?? "не указан"}» недопустим. Вернитесь к поиску и выберите режим вручную.`}
          />
        </div>
      )}

      {levelValid && !hasGrant && (
        <div className="mt-4">
          <Notice
            tone="forbidden"
            title="Недостаточно прав"
            body={`У вас нет доступа уровня «${LEVEL_LABEL[preselect.accessLevel as InternalAccessLevel]}» для открытия этой организации.`}
          />
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {canConfirm && (
          <Button
            onClick={() => onConfirm(preselect.accessLevel as InternalAccessLevel)}
            disabled={opening}
          >
            <ExternalLink className="mr-1.5 h-4 w-4" />
            {opening
              ? "Открываю…"
              : `Confirm and open as ${preselect.accessLevel === "owner_view" ? "owner" : "employee"}`}
          </Button>
        )}
        {backLink}
      </div>
    </Card>
  )
}

function Notice({
  tone,
  title,
  body,
}: {
  tone: "warning" | "forbidden"
  title: string
  body: string
}) {
  const cls =
    tone === "forbidden"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : "border-amber-300/60 bg-amber-50 text-amber-900"
  return (
    <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${cls}`}>
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <div>
        <div className="font-medium">{title}</div>
        <div className="mt-0.5 opacity-90">{body}</div>
      </div>
    </div>
  )
}
