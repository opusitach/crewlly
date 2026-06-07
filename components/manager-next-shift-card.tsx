"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Calendar, Clock } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { formatShiftDateLine, formatShiftTimeRange, getShiftDateBadge } from "@/lib/utils/shift-display"
import { useTranslation } from "@/lib/i18n/context"

type NextShiftData = {
  id: string
  startAt: string
  endAt: string
  status?: string
  openedAt?: string | null
  closedAt?: string | null
  positionName?: string | null
  salaryCents?: number | null
  salaryMessage?: string | null
  currency?: string | null
}

type ManagerNextShiftCardProps = {
  organizationId?: string | null
  timeZone?: string | null
}

export default function ManagerNextShiftCard({ organizationId, timeZone }: ManagerNextShiftCardProps) {
  const router = useRouter()
  const { toast } = useToast()
  const { t, language } = useTranslation()
  const locale = language === "en" ? "en-US" : "ru-RU"

  const [nextShift, setNextShift] = useState<NextShiftData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState("")
  const [isCancelSubmitting, setIsCancelSubmitting] = useState(false)
  const nextShiftInFlightRef = useRef(false)

  const formatShiftDuration = (startAt: string, endAt: string) => {
    const start = new Date(startAt)
    const end = new Date(endAt)
    const totalMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    if (language === "en") {
      return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`
    }
    return minutes === 0 ? `${hours} часов` : `${hours} часов ${minutes} минут`
  }

  const formatMoney = (valueCents: number, currency: string | null | undefined) => {
    const safeCurrency = currency || "CZK"
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: safeCurrency,
        maximumFractionDigits: 0,
      }).format(valueCents / 100)
    } catch {
      return `${Math.round(valueCents / 100)} ${safeCurrency}`
    }
  }

  const getShiftStatusMeta = (status?: string) => {
    switch (status) {
      case "in_progress":
        return { label: t("dash_shift_status_active"), className: "border-sky-300/70 bg-sky-100/80 text-sky-700" }
      case "scheduled":
        return { label: t("dash_shift_status_planned"), className: "border-amber-300/70 bg-amber-100/80 text-amber-700" }
      case "completed":
        return { label: t("dash_shift_status_done"), className: "border-emerald-300/70 bg-emerald-100/80 text-emerald-700" }
      case "canceled":
        return { label: t("dash_shift_status_cancelled"), className: "border-zinc-300/70 bg-zinc-100/80 text-zinc-700" }
      case "conflict":
        return { label: t("dash_shift_status_conflict"), className: "border-rose-300/70 bg-rose-100/80 text-rose-700" }
      default:
        return { label: t("dash_shift_status_upcoming"), className: "border-primary/30 bg-primary/10 text-primary" }
    }
  }

  const loadNextShift = useCallback(async (options?: { silent?: boolean }) => {
    if (!organizationId || nextShiftInFlightRef.current) return

    const silent = options?.silent === true
    nextShiftInFlightRef.current = true
    if (!silent) {
      setIsLoading(true)
    }

    try {
      const res = await fetch("/api/worker/next-shift", {
        cache: "no-store",
        credentials: "include",
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.error || t("dash_load_shift_error"))
      }
      setNextShift(json?.data ?? null)
    } catch {
      setNextShift(null)
    } finally {
      if (!silent) {
        setIsLoading(false)
      }
      nextShiftInFlightRef.current = false
    }
  }, [organizationId, t])

  useEffect(() => {
    if (!organizationId) {
      setNextShift(null)
      return
    }
    void loadNextShift()
  }, [organizationId, loadNextShift])

  const cancelShift = useCallback(async (reason: string) => {
    if (!nextShift?.id) return

    try {
      setIsCancelSubmitting(true)
      const res = await fetch(`/api/work-intervals/${nextShift.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.error || t("dash_cancel_shift_error"))
      }

      toast({ title: t("dash_shift_cancelled_toast") })
      setIsCancelDialogOpen(false)
      setCancelReason("")
      await loadNextShift()
    } catch (error: any) {
      toast({
        title: t("dash_error"),
        description: error?.message || t("dash_cancel_shift_error"),
        variant: "destructive",
      })
    } finally {
      setIsCancelSubmitting(false)
    }
  }, [loadNextShift, nextShift?.id, toast, t])

  useEffect(() => {
    if (!organizationId) return

    const refresh = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return
      if (typeof navigator !== "undefined" && !navigator.onLine) return
      void loadNextShift({ silent: true })
    }

    refresh()
    const intervalId = window.setInterval(refresh, 20000)
    window.addEventListener("focus", refresh)
    window.addEventListener("online", refresh)

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh()
      }
    }

    document.addEventListener("visibilitychange", handleVisibility)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener("focus", refresh)
      window.removeEventListener("online", refresh)
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [organizationId, loadNextShift])

  const nextShiftStatusMeta = nextShift ? getShiftStatusMeta(nextShift.status) : null
  const nextShiftDateLine = nextShift ? formatShiftDateLine(nextShift.startAt, timeZone, locale) : ""
  const nextShiftDateBadge = nextShift ? getShiftDateBadge(nextShift.startAt, timeZone, locale) : null
  const nextShiftSalaryText = useMemo(() => {
    if (nextShift == null) return "—"
    if (nextShift.salaryMessage) {
      if (language === "en" && nextShift.salaryMessage === "Зарплата расчитается после смены") {
        return t("dash_salary_after_shift")
      }
      return nextShift.salaryMessage
    }
    if (nextShift.salaryCents != null) return formatMoney(nextShift.salaryCents, nextShift.currency)
    return "—"
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextShift, language, locale])

  return (
    <div className="space-y-2">
      <h2 className="text-[17px] leading-none font-semibold">{t("manager_my_shift_title")}</h2>
      <Card className="group relative overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-primary/5 p-3 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/90 via-primary/70 to-transparent" />
        <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-primary/10 blur-2xl" />

        {isLoading && (
          <div className="relative flex min-h-[128px] items-center justify-center text-sm text-muted-foreground">
            {t("dash_loading_shift")}
          </div>
        )}

        {!isLoading && !nextShift && (
          <div className="relative flex min-h-[128px] flex-col items-center justify-center gap-1 text-center">
            <Calendar className="h-5 w-5 text-muted-foreground/70" strokeWidth={1.6} />
            <p className="text-sm font-medium">{t("dash_no_shifts")}</p>
            <p className="text-xs text-muted-foreground">{t("dash_no_shifts_hint")}</p>
          </div>
        )}

        {!isLoading && nextShift && (
          <div className="relative space-y-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-semibold">{t("dash_next_shift")}</h3>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${nextShiftStatusMeta?.className}`}
                  >
                    {nextShiftStatusMeta?.label}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{nextShiftDateLine}</p>
              </div>
              <div className="flex h-[62px] w-[62px] shrink-0 flex-col items-center justify-center rounded-2xl border border-primary/20 bg-background/85 leading-tight">
                <p className="text-[10px] font-medium text-muted-foreground">{nextShiftDateBadge?.weekday}</p>
                <p className="mt-0.5 text-[28px] font-semibold leading-none tracking-tight">{nextShiftDateBadge?.day}</p>
                <p className="mt-0.5 text-[10px] font-medium uppercase text-muted-foreground">{nextShiftDateBadge?.month}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/70 px-2 py-1 text-[11px] text-muted-foreground">
                <Clock className="h-3.5 w-3.5" strokeWidth={1.6} />
                {formatShiftTimeRange(nextShift.startAt, nextShift.endAt, timeZone, locale)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/70 px-2 py-1 text-[11px] text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" strokeWidth={1.6} />
                {formatShiftDuration(nextShift.startAt, nextShift.endAt)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-border/60 bg-background/70 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("dash_position")}</p>
                <p className="mt-1 truncate text-sm font-semibold">{nextShift.positionName ?? t("dash_no_position")}</p>
              </div>
              <div className="rounded-md border border-border/60 bg-background/70 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("dash_salary")}</p>
                <p className="mt-1 truncate text-sm font-semibold">{nextShiftSalaryText}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-0.5">
              {nextShift.status === "in_progress" ? (
                <>
                  <Button
                    className="h-9 text-sm"
                    variant="outline"
                    onClick={() => router.push(`/shift-procedures/${nextShift.id}?when=OPEN`)}
                  >
                    {t("dash_rules")}
                  </Button>
                  <Button
                    className="h-9 text-sm"
                    variant="destructive"
                    onClick={() => router.push(`/shift-procedures/${nextShift.id}?when=CLOSE`)}
                  >
                    {t("dash_close_shift")}
                  </Button>
                </>
              ) : nextShift.status === "scheduled" ? (
                <>
                  <Button className="h-9 text-sm" onClick={() => router.push(`/shift-procedures/${nextShift.id}?when=OPEN`)}>
                    {t("dash_open_shift")}
                  </Button>
                  <Button
                    className="h-9 border-destructive/40 text-destructive hover:bg-destructive/10"
                    variant="outline"
                    onClick={() => setIsCancelDialogOpen(true)}
                  >
                    {t("dash_cancel_shift")}
                  </Button>
                </>
              ) : nextShift.status === "completed" ? (
                <div className="col-span-2 rounded-md border border-border/60 bg-background/70 px-2.5 py-2 text-center text-xs text-muted-foreground">
                  {t("dash_shift_done")}
                </div>
              ) : nextShift.status === "canceled" ? (
                <div className="col-span-2 rounded-md border border-border/60 bg-background/70 px-2.5 py-2 text-center text-xs text-muted-foreground">
                  {t("dash_shift_cancelled")}
                </div>
              ) : nextShift.status === "conflict" ? (
                <div className="col-span-2 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-center text-xs text-destructive">
                  {t("manager_shift_conflict")}
                </div>
              ) : (
                <Button className="col-span-2 h-9 text-sm" onClick={() => router.push(`/shift-procedures/${nextShift.id}?when=OPEN`)}>
                  {t("dash_go_to_rules")}
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>

      <Dialog
        open={isCancelDialogOpen}
        onOpenChange={(open) => {
          setIsCancelDialogOpen(open)
          if (!open && !isCancelSubmitting) {
            setCancelReason("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dash_cancel_shift_title")}</DialogTitle>
            <DialogDescription>
              {t("dash_cancel_shift_desc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              rows={4}
              maxLength={500}
              placeholder={t("dash_cancel_reason_placeholder")}
              disabled={isCancelSubmitting}
            />
            <div className="text-xs text-right text-muted-foreground">{cancelReason.length}/500</div>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button variant="outline" onClick={() => setIsCancelDialogOpen(false)} disabled={isCancelSubmitting}>
              {t("dash_back")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void cancelShift(cancelReason.trim())}
              disabled={isCancelSubmitting || cancelReason.trim().length < 3}
            >
              {isCancelSubmitting ? t("dash_cancelling") : t("dash_cancel_shift")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
