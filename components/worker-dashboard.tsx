"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertCircle, Building2, Calendar, CalendarDays, ChartColumn, Check, Clock, DollarSign, House, Plus, type LucideIcon } from "lucide-react"
import WorkerMoneyView from "@/components/worker-money-view"
import WorkerShiftPlanner from "@/components/worker-shift-planner"
import AppHeader from "@/components/shared/app-header"
import AccountHub from "@/components/account/account-hub"
import WorkerProfile from "@/components/account/worker-profile"
import WorkerSettings from "@/components/account/worker-settings"
import NotificationsPage from "@/components/account/notifications-page"
import HelpPage from "@/components/account/help-page"
import LanguagePage from "@/components/account/language-page"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import type { NotificationNavigationTarget } from "@/lib/notifications/navigation"
import { translateNotificationMessage, translateNotificationText } from "@/lib/notifications/display"
import { useTranslation } from "@/lib/i18n/context"
import { formatShiftDateLine, formatShiftTimeRange, getShiftDateBadge } from "@/lib/utils/shift-display"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { useAuthStore } from "@/lib/store/auth-store"
import { useToast } from "@/hooks/use-toast"

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

type WorkerMonthSummary = {
  totalGrossCents: number
  totalSalaryCents: number
  totalTipsCents: number
  totalBonusCents: number
  totalPenaltyCents: number
  totalAdjustmentsCents: number
  totalAccruedCents: number
  totalMinutesWorked: number
  shiftsCount: number
  currency: string | null
}

type DashboardNotification = {
  id: string
  type: "shift" | "cash" | "receipt" | "system"
  title: string
  message: string
  status: "read" | "unread"
  createdAt: string
}

type WorkerBottomTab = "shift" | "planner" | "money"
type WorkerTabResetVersion = Record<WorkerBottomTab, number>

type PendingWorkerPlannerNavigation = {
  workDate: string
  intervalId?: string | null
  openWeekView?: boolean
}

type PendingWorkerMoneyNavigation = {
  fromDate: string
  toDate: string
}

const WORKER_BOTTOM_NAV_TABS: { key: WorkerBottomTab; Icon: LucideIcon }[] = [
  { key: "shift", Icon: House },
  { key: "planner", Icon: CalendarDays },
  { key: "money", Icon: ChartColumn },
]

const WORKER_TAB_RESET_VERSION_INITIAL: WorkerTabResetVersion = {
  shift: 0,
  planner: 0,
  money: 0,
}

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const EMPTY_MONTH_SUMMARY: WorkerMonthSummary = {
  totalGrossCents: 0,
  totalSalaryCents: 0,
  totalTipsCents: 0,
  totalBonusCents: 0,
  totalPenaltyCents: 0,
  totalAdjustmentsCents: 0,
  totalAccruedCents: 0,
  totalMinutesWorked: 0,
  shiftsCount: 0,
  currency: null,
}

const DASHBOARD_STAT_VALUE_CLASS = "text-[clamp(1.25rem,5vw,1.7rem)] font-semibold tracking-tight leading-none tabular-nums"

function WorkerNextShiftSkeleton({ label }: { label: string }) {
  return (
    <div className="relative min-h-[128px] space-y-3" role="status" aria-label={label}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-40" />
        </div>
        <Skeleton className="h-[62px] w-[62px] rounded-2xl" />
      </div>
      <div className="flex gap-1.5">
        <Skeleton className="h-7 w-24 rounded-md" />
        <Skeleton className="h-7 w-24 rounded-md" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-[58px] rounded-md" />
        <Skeleton className="h-[58px] rounded-md" />
      </div>
    </div>
  )
}

function WorkerEventsSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-2" role="status" aria-label={label}>
      {[1, 2, 3].map((item) => (
        <Card key={item} className="p-3">
          <div className="flex items-start gap-2.5">
            <Skeleton className="mt-0.5 h-8 w-8 flex-shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

export default function WorkerDashboard({ onBack }: { onBack?: () => void }) {
  const { t, language } = useTranslation()
  const locale = language === "en" ? "en-US" : "ru-RU"
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")
  const legacyProfileTabRequested = tabParam === "profile"
  const resolvedTab: WorkerBottomTab = tabParam === "planner" || tabParam === "money" ? tabParam : "shift"
  const [activeTab, setActiveTab] = useState<WorkerBottomTab>(resolvedTab)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [nextShift, setNextShift] = useState<NextShiftData | null>(null)
  const [isNextShiftLoading, setIsNextShiftLoading] = useState(false)
  const [monthSummary, setMonthSummary] = useState<WorkerMonthSummary>(EMPTY_MONTH_SUMMARY)
  const [isMonthSummaryLoading, setIsMonthSummaryLoading] = useState(false)
  const [dashboardEvents, setDashboardEvents] = useState<DashboardNotification[]>([])
  const [isEventsLoading, setIsEventsLoading] = useState(false)
  const [accountView, setAccountView] = useState<"none" | "hub" | "profile" | "settings" | "notifications" | "help" | "language">(
    legacyProfileTabRequested ? "profile" : "none",
  )
  const [tabResetVersion, setTabResetVersion] = useState<WorkerTabResetVersion>(WORKER_TAB_RESET_VERSION_INITIAL)
  const [unreadNotifications, setUnreadNotifications] = useState<number | null>(null)
  const [pendingPlannerNavigation, setPendingPlannerNavigation] = useState<PendingWorkerPlannerNavigation | null>(null)
  const [pendingMoneyNavigation, setPendingMoneyNavigation] = useState<PendingWorkerMoneyNavigation | null>(null)
  const [isVenueSelectorOpen, setIsVenueSelectorOpen] = useState(false)
  const [isJoinVenueOpen, setIsJoinVenueOpen] = useState(false)
  const [joinInviteCode, setJoinInviteCode] = useState("")
  const [joinVenueError, setJoinVenueError] = useState<string | null>(null)
  const [isJoinVenueSubmitting, setIsJoinVenueSubmitting] = useState(false)
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState("")
  const [isCancelSubmitting, setIsCancelSubmitting] = useState(false)
  const { toast } = useToast()
  const {
    user,
    organization,
    venues,
    selectedVenueId,
    selectVenue,
    hydrate,
    isHydrated,
    logout,
    isAuthenticated,
    isLoading: isAuthLoading,
  } = useAuthStore()

  useEffect(() => {
    if (!isHydrated) {
      void hydrate()
    }
  }, [isHydrated, hydrate])

  useEffect(() => {
    setActiveTab(resolvedTab)
    if (legacyProfileTabRequested) {
      setAccountView("profile")
    }
  }, [legacyProfileTabRequested, resolvedTab])

  useEffect(() => {
    if (activeTab !== "planner") return
    const el = scrollContainerRef.current
    if (!el) return
    const id = setTimeout(() => el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }), 80)
    return () => clearTimeout(id)
  }, [activeTab])

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.replace("/login")
    }
  }, [isAuthLoading, isAuthenticated, router])

  const nextShiftInFlightRef = useRef(false)
  const monthSummaryInFlightRef = useRef(false)

  const loadNextShift = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true
    if (nextShiftInFlightRef.current) return
    nextShiftInFlightRef.current = true
    if (!silent) {
      setIsNextShiftLoading(true)
    }
    try {
      const res = await fetch("/api/worker/next-shift", { cache: "no-store", credentials: "include" })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.error || t("dash_load_shift_error"))
      }
      setNextShift(json?.data ?? null)
    } catch {
      setNextShift(null)
    } finally {
      if (!silent) {
        setIsNextShiftLoading(false)
      }
      nextShiftInFlightRef.current = false
    }
  }, [t])

  const loadMonthSummary = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true
    if (monthSummaryInFlightRef.current) return
    monthSummaryInFlightRef.current = true
    if (!silent) {
      setIsMonthSummaryLoading(true)
    }

    try {
      const now = new Date()
      const dateFrom = toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1))
      const dateTo = toDateInputValue(new Date(now.getFullYear(), now.getMonth() + 1, 0))
      const params = new URLSearchParams({ dateFrom, dateTo })

      const res = await fetch(`/api/worker/earnings?${params.toString()}`, {
        cache: "no-store",
        credentials: "include",
      })

      if (!res.ok) {
        setMonthSummary(EMPTY_MONTH_SUMMARY)
        return
      }

      const json = await res.json().catch(() => null)
      const rawSummary = json?.data?.summary ?? {}
      const totalGrossCents = Number.isInteger(rawSummary.totalGrossCents) ? Number(rawSummary.totalGrossCents) : 0
      const totalSalaryCents = Number.isInteger(rawSummary.totalSalaryCents)
        ? Number(rawSummary.totalSalaryCents)
        : totalGrossCents
      const totalTipsCents = Number.isInteger(rawSummary.totalTipsCents) ? Number(rawSummary.totalTipsCents) : 0
      const totalBonusCents = Number.isInteger(rawSummary.totalBonusCents) ? Number(rawSummary.totalBonusCents) : 0
      const totalPenaltyCents = Number.isInteger(rawSummary.totalPenaltyCents) ? Number(rawSummary.totalPenaltyCents) : 0
      const totalAdjustmentsCents = Number.isInteger(rawSummary.totalAdjustmentsCents)
        ? Number(rawSummary.totalAdjustmentsCents)
        : totalBonusCents - totalPenaltyCents

      setMonthSummary({
        totalGrossCents,
        totalSalaryCents,
        totalTipsCents,
        totalBonusCents,
        totalPenaltyCents,
        totalAdjustmentsCents,
        totalAccruedCents: Number.isInteger(rawSummary.totalAccruedCents)
          ? Number(rawSummary.totalAccruedCents)
          : totalSalaryCents + totalTipsCents + totalAdjustmentsCents,
        totalMinutesWorked: Number.isInteger(rawSummary.totalMinutesWorked) ? Number(rawSummary.totalMinutesWorked) : 0,
        shiftsCount: Number.isInteger(rawSummary.shiftsCount) ? Number(rawSummary.shiftsCount) : 0,
        currency:
          typeof rawSummary.currency === "string"
            ? rawSummary.currency
            : organization?.currency ?? EMPTY_MONTH_SUMMARY.currency,
      })
    } catch {
      setMonthSummary(EMPTY_MONTH_SUMMARY)
    } finally {
      if (!silent) {
        setIsMonthSummaryLoading(false)
      }
      monthSummaryInFlightRef.current = false
    }
  }, [organization?.currency])

  useEffect(() => {
    if (!isAuthenticated || isAuthLoading) return
    void loadNextShift()
  }, [isAuthenticated, isAuthLoading, loadNextShift])

  useEffect(() => {
    if (!isAuthenticated || isAuthLoading) return
    void loadMonthSummary()
  }, [isAuthenticated, isAuthLoading, loadMonthSummary])

  useEffect(() => {
    if (!isAuthenticated || isAuthLoading) return
    if (activeTab !== "shift" || accountView !== "none") return

    const refresh = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return
      if (typeof navigator !== "undefined" && !navigator.onLine) return
      void loadNextShift({ silent: true })
      void loadMonthSummary({ silent: true })
    }

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh()
      }
    }

    refresh()
    const intervalId = window.setInterval(refresh, 20000)
    window.addEventListener("focus", refresh)
    window.addEventListener("online", refresh)
    document.addEventListener("visibilitychange", handleVisibility)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener("focus", refresh)
      window.removeEventListener("online", refresh)
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [activeTab, accountView, isAuthenticated, isAuthLoading, loadNextShift, loadMonthSummary])

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
    const loadUnreadNotifications = async () => {
      setUnreadNotifications(null)
      try {
        const res = await fetch("/api/notifications?status=unread", { credentials: "include", cache: "no-store" })
        if (!res.ok) {
          setUnreadNotifications(0)
          return
        }
        const json = await res.json()
        setUnreadNotifications((json?.data ?? []).length)
      } catch {
        setUnreadNotifications(0)
      }
    }

    if (!isAuthenticated || isAuthLoading) return
    void loadUnreadNotifications()
  }, [isAuthenticated, isAuthLoading])

  useEffect(() => {
    if (!isAuthenticated || isAuthLoading) return
    if (activeTab !== "shift" || accountView !== "none") return

    let active = true
    setIsEventsLoading(true)

    const loadDashboardEvents = async () => {
      try {
        const res = await fetch("/api/notifications?types=shift,system&limit=5", {
          credentials: "include",
          cache: "no-store",
        })
        if (!res.ok) {
          if (active) setDashboardEvents([])
          return
        }
        const json = (await res.json().catch(() => null)) as { data?: DashboardNotification[] } | null
        if (!active) return
        setDashboardEvents(Array.isArray(json?.data) ? json.data : [])
      } catch {
        if (active) setDashboardEvents([])
      } finally {
        if (active) setIsEventsLoading(false)
      }
    }

    void loadDashboardEvents()
    const intervalId = window.setInterval(() => {
      void loadDashboardEvents()
    }, 20000)

    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [activeTab, accountView, isAuthenticated, isAuthLoading])

  const formatShiftDuration = (startAt: string, endAt: string) => {
    const start = new Date(startAt)
    const end = new Date(endAt)
    const totalMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    if (minutes === 0) {
      return language === "en" ? `${hours} h` : `${hours} часов`
    }
    return language === "en" ? `${hours} h ${minutes} min` : `${hours} часов ${minutes} минут`
  }

  const formatMoney = (valueCents: number, currency: string | null | undefined) => {
    const safeCurrency = currency || organization?.currency || "CZK"
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

  const formatMonthHours = (totalMinutes: number) => {
    const safeMinutes = Number.isFinite(totalMinutes) ? Math.max(0, totalMinutes) : 0
    const hours = safeMinutes / 60
    const rounded = Math.round(hours * 10) / 10
    const rendered =
      language === "en"
        ? new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(rounded)
        : (Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(".", ","))
    return `${rendered} ${t("dash_hour_short")}`
  }

  const formatShiftCount = (count: number) => {
    const safeCount = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0
    if (language === "en") {
      return t(safeCount === 1 ? "dash_shift_count_one" : "dash_shift_count_many", { count: safeCount })
    }
    const mod10 = safeCount % 10
    const mod100 = safeCount % 100
    if (mod10 === 1 && mod100 !== 11) return t("dash_shift_count_one", { count: safeCount })
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return t("dash_shift_count_few", { count: safeCount })
    return t("dash_shift_count_many", { count: safeCount })
  }

  const formatEventTimestamp = (value: string) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString(locale, {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getShiftStatusMeta = (status?: string) => {
    switch (status) {
      case "in_progress":
        return {
          label: t("dash_shift_status_active"),
          className: "border-sky-300/70 bg-sky-100/80 text-sky-700",
        }
      case "scheduled":
        return {
          label: t("dash_shift_status_planned"),
          className: "border-amber-300/70 bg-amber-100/80 text-amber-700",
        }
      case "completed":
        return {
          label: t("dash_shift_status_done"),
          className: "border-emerald-300/70 bg-emerald-100/80 text-emerald-700",
        }
      case "canceled":
        return {
          label: t("dash_shift_status_cancelled"),
          className: "border-zinc-300/70 bg-zinc-100/80 text-zinc-700",
        }
      case "conflict":
        return {
          label: t("dash_shift_status_conflict"),
          className: "border-rose-300/70 bg-rose-100/80 text-rose-700",
        }
      default:
        return {
          label: t("dash_shift_status_upcoming"),
          className: "border-primary/30 bg-primary/10 text-primary",
        }
    }
  }

  const closeVenueSelector = useCallback(() => {
    setIsVenueSelectorOpen(false)
    setIsJoinVenueOpen(false)
    setJoinInviteCode("")
    setJoinVenueError(null)
  }, [])

  const updateRouteForTab = useCallback((nextTab: WorkerBottomTab) => {
    const nextParams = new URLSearchParams(searchParams.toString())
    if (nextTab === "shift") {
      nextParams.delete("tab")
    } else {
      nextParams.set("tab", nextTab)
    }

    const nextQuery = nextParams.toString()
    const nextHref = nextQuery ? `/app?${nextQuery}` : "/app"
    const currentQuery = searchParams.toString()
    const currentHref = currentQuery ? `/app?${currentQuery}` : "/app"

    if (nextHref === currentHref) return

    const shouldPushToHistory = resolvedTab === "shift" && nextTab !== "shift"
    if (shouldPushToHistory) {
      router.push(nextHref)
      return
    }
    router.replace(nextHref)
  }, [searchParams, resolvedTab, router])

  const closeProfileModal = useCallback(() => {
    setAccountView("none")
    if (legacyProfileTabRequested) {
      updateRouteForTab(activeTab)
    }
  }, [activeTab, legacyProfileTabRequested, updateRouteForTab])

  const handleAccountNavigation = (screen: "profile" | "settings" | "language" | "help" | "team") => {
    closeVenueSelector()
    setAccountView("none")
    if (screen === "profile") {
      setTimeout(() => {
        setAccountView("profile")
      }, 100)
    } else if (screen === "settings") {
      setTimeout(() => {
        setAccountView("settings")
        if (legacyProfileTabRequested) {
          updateRouteForTab(activeTab)
        }
      }, 100)
    } else if (screen === "help") {
      setTimeout(() => {
        setAccountView("help")
        if (legacyProfileTabRequested) {
          updateRouteForTab(activeTab)
        }
      }, 100)
    } else if (screen === "language") {
      setTimeout(() => {
        setAccountView("language")
      }, 100)
    }
  }

  const handleLogout = () => {
    void logout()
    closeVenueSelector()
    setAccountView("none")
    onBack?.()
  }

  const handleVenueSelect = useCallback(
    async (venueId: string) => {
      if (venueId === selectedVenueId) {
        closeVenueSelector()
        return
      }

      try {
        await selectVenue(venueId)
        router.refresh()
        await Promise.all([loadNextShift({ silent: true }), loadMonthSummary({ silent: true })])

        const unreadPromise = fetch("/api/notifications?status=unread", {
          credentials: "include",
          cache: "no-store",
        })
        const eventsPromise =
          activeTab === "shift" && accountView === "none"
            ? fetch("/api/notifications?types=shift,system&limit=5", {
                credentials: "include",
                cache: "no-store",
              })
            : Promise.resolve(null)

        const [unreadRes, eventsRes] = await Promise.all([unreadPromise, eventsPromise])

        if (unreadRes.ok) {
          const unreadJson = await unreadRes.json().catch(() => null)
          setUnreadNotifications((unreadJson?.data ?? []).length)
        } else {
          setUnreadNotifications(0)
        }

        if (eventsRes) {
          if (eventsRes.ok) {
            const eventsJson = (await eventsRes.json().catch(() => null)) as { data?: DashboardNotification[] } | null
            setDashboardEvents(Array.isArray(eventsJson?.data) ? eventsJson.data : [])
          } else {
            setDashboardEvents([])
          }
        }
      } catch (error) {
        console.error("Failed to switch worker venue", error)
      } finally {
        closeVenueSelector()
      }
    },
    [selectedVenueId, closeVenueSelector, selectVenue, loadNextShift, loadMonthSummary, activeTab, accountView],
  )

  const handleJoinVenue = useCallback(async () => {
    const inviteCode = joinInviteCode.trim()
    if (inviteCode.length < 8) {
      setJoinVenueError(t("dash_invalid_code"))
      return
    }

    try {
      setIsJoinVenueSubmitting(true)
      setJoinVenueError(null)

      const res = await fetch("/api/worker/venues/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ inviteCode }),
      })

      const json = await res.json().catch(() => null)
      if (!res.ok) {
        const message = typeof json?.error === "string" ? json.error : t("dash_join_error")
        setJoinVenueError(message)
        return
      }

      await hydrate()
      await Promise.all([loadNextShift({ silent: true }), loadMonthSummary({ silent: true })])

      const [unreadRes, eventsRes] = await Promise.all([
        fetch("/api/notifications?status=unread", { credentials: "include", cache: "no-store" }),
        activeTab === "shift" && accountView === "none"
          ? fetch("/api/notifications?types=shift,system&limit=5", { credentials: "include", cache: "no-store" })
          : Promise.resolve(null),
      ])

      if (unreadRes.ok) {
        const unreadJson = await unreadRes.json().catch(() => null)
        setUnreadNotifications((unreadJson?.data ?? []).length)
      } else {
        setUnreadNotifications(0)
      }

      if (eventsRes) {
        if (eventsRes.ok) {
          const eventsJson = (await eventsRes.json().catch(() => null)) as { data?: DashboardNotification[] } | null
          setDashboardEvents(Array.isArray(eventsJson?.data) ? eventsJson.data : [])
        } else {
          setDashboardEvents([])
        }
      }

      const status = json?.data?.status as string | undefined
      const organizationName =
        typeof json?.data?.organizationName === "string" && json.data.organizationName.length > 0
          ? json.data.organizationName
          : t("common_venue")
      toast({
        title: status === "ALREADY_MEMBER" ? t("dash_already_joined") : t("dash_joined_venue"),
        description: organizationName,
      })

      closeVenueSelector()
    } catch (error: any) {
      const message = error?.message || t("dash_join_venue_error")
      setJoinVenueError(message)
      toast({ title: t("dash_error"), description: message, variant: "destructive" })
    } finally {
      setIsJoinVenueSubmitting(false)
    }
  }, [joinInviteCode, hydrate, loadNextShift, loadMonthSummary, activeTab, accountView, toast, closeVenueSelector, t])

  const selectedVenue = useMemo(
    () => venues.find((venue) => venue.id === selectedVenueId) ?? null,
    [venues, selectedVenueId],
  )
  const selectedVenueName = selectedVenue?.name ?? organization?.name ?? t("common_venue")
  const navActiveTab: WorkerBottomTab | null = accountView === "profile" ? null : activeTab
  const navActiveIndex = WORKER_BOTTOM_NAV_TABS.findIndex(({ key }) => key === navActiveTab)
  const showAppHeader = accountView !== "hub"
  const showHeaderVenueSelector = accountView === "none" || accountView === "notifications"
  const shiftDisplayTimeZone = organization?.timezone
  const appHeaderTitle =
    accountView === "profile"
      ? t("profile_title")
      : accountView === "settings"
        ? t("settings_title")
        : accountView === "help"
          ? t("help_title")
          : "Crewlly"
  const nextShiftStatusMeta = nextShift ? getShiftStatusMeta(nextShift.status) : null
  const nextShiftDateLine = nextShift ? formatShiftDateLine(nextShift.startAt, shiftDisplayTimeZone, locale) : ""
  const nextShiftDateBadge = nextShift ? getShiftDateBadge(nextShift.startAt, shiftDisplayTimeZone, locale) : null
  const nextShiftSalaryText =
    nextShift == null
      ? "—"
      : nextShift.salaryMessage
        ? language === "en" && nextShift.salaryMessage === "Зарплата расчитается после смены"
          ? t("dash_salary_after_shift")
          : nextShift.salaryMessage
        : nextShift.salaryCents != null
          ? formatMoney(nextShift.salaryCents, nextShift.currency)
          : "—"
  const currentMonthLabel = new Date().toLocaleDateString(locale, { month: "long" })
  const monthHoursText = formatMonthHours(monthSummary.totalMinutesWorked)
  const monthShiftsText = formatShiftCount(monthSummary.shiftsCount)
  const monthBaseCompensationCents = monthSummary.totalSalaryCents + monthSummary.totalAdjustmentsCents
  const monthSalaryText = formatMoney(monthBaseCompensationCents, monthSummary.currency ?? organization?.currency)
  const monthTipsText = formatMoney(monthSummary.totalTipsCents, monthSummary.currency ?? organization?.currency)
  const monthAdjustmentText = formatMoney(
    monthSummary.totalAdjustmentsCents,
    monthSummary.currency ?? organization?.currency,
  )
  const monthSalaryCaption =
    monthSummary.totalAdjustmentsCents !== 0
      ? `+ ${monthTipsText} ${t("dash_tips_label")} • ${
          monthSummary.totalAdjustmentsCents > 0 ? "+" : ""
        }${monthAdjustmentText} ${t("dash_adjustments_short")}`
      : `+ ${monthTipsText} ${t("dash_tips_label")}`
  const visibleDashboardEvents = dashboardEvents.slice(0, 3)
  const hasMoreDashboardEvents = dashboardEvents.length > 3

  const bumpTabResetVersion = (tab: WorkerBottomTab) => {
    setTabResetVersion((prev) => ({
      ...prev,
      [tab]: prev[tab] + 1,
    }))
  }

  const scrollTabToTop = () => {
    if (typeof window === "undefined") return
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleTabChange = (tab: WorkerBottomTab) => {
    const isReselect = activeTab === tab
    if (isReselect) {
      bumpTabResetVersion(tab)
      scrollTabToTop()
    }

    setAccountView("none")
    setActiveTab(tab)
    updateRouteForTab(tab)
  }

  const openAccountHub = () => {
    if (legacyProfileTabRequested) {
      updateRouteForTab(activeTab)
    }
    setAccountView("hub")
  }

  const openNotifications = () => {
    if (legacyProfileTabRequested) {
      updateRouteForTab(activeTab)
    }
    setAccountView("notifications")
  }

  const handleNotificationNavigation = (target: NotificationNavigationTarget) => {
    if (target.view === "worker_planner") {
      setAccountView("none")
      setPendingMoneyNavigation(null)
      setPendingPlannerNavigation({
        workDate: target.workDate,
        intervalId: target.intervalId ?? null,
        openWeekView: target.openWeekView ?? true,
      })
      setActiveTab("planner")
      updateRouteForTab("planner")
      return
    }

    if (target.view === "worker_money") {
      setAccountView("none")
      setPendingPlannerNavigation(null)
      setPendingMoneyNavigation({
        fromDate: target.fromDate,
        toDate: target.toDate,
      })
      setActiveTab("money")
      updateRouteForTab("money")
      return
    }

    if (target.view === "worker_profile") {
      setPendingMoneyNavigation(null)
      setPendingPlannerNavigation(null)
      setAccountView("profile")
    }
  }

  const renderContent = () => {
    if (accountView === "profile") {
      return (
        <WorkerProfile
          onBack={closeProfileModal}
          onLogout={handleLogout}
          hideHeader
        />
      )
    }

    if (accountView === "settings") {
      return <WorkerSettings onBack={() => setAccountView("none")} hideHeader />
    }

    if (accountView === "help") {
      return <HelpPage onBack={() => setAccountView("none")} userRole="worker" hideHeader />
    }

    if (accountView === "language") {
      return <LanguagePage onBack={() => setAccountView("none")} />
    }

    if (accountView === "notifications") {
      return (
        <NotificationsPage
          onBack={() => {
            setAccountView("none")
          }}
          onNotificationNavigate={handleNotificationNavigation}
          onUnreadCountChange={setUnreadNotifications}
        />
      )
    }

    if (activeTab === "money") {
      return (
        <WorkerMoneyView
          key={`worker-money-${tabResetVersion.money}`}
          onBack={() => handleTabChange("shift")}
          initialFromDate={pendingMoneyNavigation?.fromDate}
          initialToDate={pendingMoneyNavigation?.toDate}
          onInitialNavigationHandled={() => setPendingMoneyNavigation(null)}
          hideHeader
        />
      )
    }

    if (activeTab === "planner") {
      return (
        <WorkerShiftPlanner
          key={`worker-planner-${tabResetVersion.planner}`}
          onBack={() => handleTabChange("shift")}
          initialDate={pendingPlannerNavigation?.workDate}
          initialSelectedIntervalId={pendingPlannerNavigation?.intervalId ?? null}
          initialOpenWeekView={pendingPlannerNavigation?.openWeekView ?? false}
          onInitialNavigationHandled={() => setPendingPlannerNavigation(null)}
          hideHeader
        />
      )
    }

    return (
      <div key={`worker-shift-${tabResetVersion.shift}`}>
        <div className="px-3 pt-4">
          <h1 className="text-2xl font-bold">{organization?.name ?? t("common_venue")}</h1>
        </div>

        {/* Content */}
        <div className="p-3 pt-2 space-y-4">
          {/* Next Shift */}
          <div className="space-y-2">
            <h2 className="text-base font-semibold">{t("dash_next_shift")}</h2>
            <Card className="group relative overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-primary/5 p-3 shadow-sm">
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/90 via-primary/70 to-transparent" />
              <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-primary/10 blur-2xl" />

              {isNextShiftLoading && (
                <WorkerNextShiftSkeleton label={t("dash_loading_shift")} />
              )}
              {!isNextShiftLoading && !nextShift && (
                <div className="relative flex min-h-[128px] flex-col items-center justify-center gap-1 text-center">
                  <Calendar className="h-5 w-5 text-muted-foreground/70" strokeWidth={1.6} />
                  <p className="text-sm font-medium">{t("dash_no_shifts")}</p>
                  <p className="text-xs text-muted-foreground">{t("dash_no_shifts_hint")}</p>
                </div>
              )}
              {!isNextShiftLoading && nextShift && (
                <div className="relative space-y-3">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-semibold">{t("dash_next_shift")}</h3>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${nextShiftStatusMeta?.className}`}>
                          {nextShiftStatusMeta?.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{nextShiftDateLine}</p>
                    </div>
                    <div className="flex h-[62px] w-[62px] shrink-0 flex-col items-center justify-center rounded-2xl border border-primary/20 bg-background/85 leading-tight">
                      <p className="text-[10px] font-medium text-muted-foreground">{nextShiftDateBadge?.weekday}</p>
                      <p className="mt-0.5 text-[28px] font-semibold tracking-tight leading-none">{nextShiftDateBadge?.day}</p>
                      <p className="mt-0.5 text-[10px] font-medium uppercase text-muted-foreground">{nextShiftDateBadge?.month}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/70 px-2 py-1 text-[11px] text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" strokeWidth={1.6} />
                      {formatShiftTimeRange(nextShift.startAt, nextShift.endAt, shiftDisplayTimeZone, locale)}
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
                        <Button
                          className="h-9 text-sm"
                          onClick={() => router.push(`/shift-procedures/${nextShift.id}?when=OPEN`)}
                        >
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
                        {t("dash_shift_conflict")}
                      </div>
                    ) : (
                      <Button
                        className="col-span-2 h-9 text-sm"
                        onClick={() => router.push(`/shift-procedures/${nextShift.id}?when=OPEN`)}
                      >
                        {t("dash_go_to_rules")}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-2.5">
            <Card className="group relative min-h-[122px] overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-sky-50/40 p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:to-sky-500/10">
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-sky-500/80 via-sky-400/70 to-transparent" />
              <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-sky-500/10 blur-2xl" />
              <div className="relative flex h-full flex-col justify-between gap-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {t("dash_month_prefix", { month: currentMonthLabel })}
                  </p>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300">
                    <Clock className="h-4 w-4" strokeWidth={1.8} />
                  </div>
                </div>
                <div className="space-y-1">
                  {isMonthSummaryLoading ? (
                    <>
                      <Skeleton className="h-7 w-20" />
                      <Skeleton className="h-3 w-24" />
                    </>
                  ) : (
                    <>
                      <p className={DASHBOARD_STAT_VALUE_CLASS}>{monthHoursText}</p>
                      <p className="text-xs font-medium text-muted-foreground">{monthShiftsText}</p>
                    </>
                  )}
                </div>
              </div>
            </Card>

            <Card className="group relative min-h-[122px] overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-emerald-50/40 p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:to-emerald-500/10">
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-emerald-500/80 via-emerald-400/70 to-transparent" />
              <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-emerald-500/10 blur-2xl" />
              <div className="relative flex h-full flex-col justify-between gap-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {t("dash_month_prefix", { month: currentMonthLabel })}
                  </p>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                    <DollarSign className="h-4 w-4" strokeWidth={1.8} />
                  </div>
                </div>
                <div className="space-y-1">
                  {isMonthSummaryLoading ? (
                    <>
                      <Skeleton className="h-7 w-24" />
                      <Skeleton className="h-3 w-28" />
                    </>
                  ) : (
                    <>
                      <p className={DASHBOARD_STAT_VALUE_CLASS}>{monthSalaryText}</p>
                      <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">{monthSalaryCaption}</p>
                    </>
                  )}
                </div>
              </div>
            </Card>
          </div>

          <div className="space-y-3 pt-2.5">
            <h2 className="text-[17px] leading-none font-semibold">{t("dash_events")}</h2>
            {isEventsLoading ? (
              <WorkerEventsSkeleton label={t("dash_loading_events")} />
            ) : dashboardEvents.length === 0 ? (
              <Card className="p-4">
                <p className="text-sm text-muted-foreground text-center">{t("dash_no_events")}</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {visibleDashboardEvents.map((event) => {
                  const isSystemEvent = event.type === "system"
                  const Icon = isSystemEvent ? DollarSign : Clock
                  return (
                    <Card
                      key={event.id}
                      className="p-3 cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => setAccountView("notifications")}
                    >
                      <div className="flex items-start gap-2.5">
                        <div
                          className={`mt-0.5 h-8 w-8 rounded-full flex items-center justify-center ${
                            isSystemEvent ? "bg-amber-500/10 text-amber-700" : "bg-primary/10 text-primary"
                          }`}
                        >
                          <Icon className="h-4 w-4" strokeWidth={1.5} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium truncate">{translateNotificationText(event.title, language)}</p>
                            {event.status === "unread" && (
                              <AlertCircle className="h-3.5 w-3.5 text-primary flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {translateNotificationMessage(event.message, event.title, language)}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-1.5">{formatEventTimestamp(event.createdAt)}</p>
                        </div>
                      </div>
                    </Card>
                  )
                })}

                {hasMoreDashboardEvents && (
                  <Button
                    variant="secondary"
                    className="w-full h-9 text-sm"
                    onClick={() => setAccountView("notifications")}
                  >
                    {t("dash_more")}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-background max-w-md mx-auto">
      {showAppHeader && (
        <AppHeader
          title={appHeaderTitle}
          showLogo={appHeaderTitle === "Crewlly"}
          titleHref={appHeaderTitle === "Crewlly" ? "/" : undefined}
          titleAlign={["profile", "settings", "help"].includes(accountView) ? "center" : "left"}
          onBack={onBack}
          showVenueSelector={showHeaderVenueSelector}
          selectedVenue={selectedVenueName}
          onVenueChange={() => setIsVenueSelectorOpen(true)}
          onAvatarClick={openAccountHub}
          onNotificationClick={openNotifications}
          unreadCount={unreadNotifications}
          userName={user?.name}
        />
      )}

      <AccountHub
        isOpen={accountView === "hub"}
        onClose={() => setAccountView("none")}
        userRole="worker"
        userName={user?.name ?? t("hub_profile")}
        onNavigate={handleAccountNavigation}
      />

      <BottomSheet isOpen={isVenueSelectorOpen} onClose={closeVenueSelector} showCloseButton>
        <div className="space-y-3">
          <div>
            <h3 className="text-base font-semibold">{t("dash_select_venue")}</h3>
            <p className="text-xs text-muted-foreground">{t("dash_switch_venues")}</p>
          </div>

          {venues.length === 0 ? (
            <Card className="p-3">
              <p className="text-sm text-muted-foreground">{t("dash_no_venues")}</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {venues.map((venue) => {
                const isSelected = venue.id === selectedVenueId
                return (
                  <button
                    key={venue.id}
                    type="button"
                    className={`w-full rounded-xl border p-3 text-left transition-colors ${
                      isSelected ? "border-primary/40 bg-primary/10" : "border-border bg-card hover:bg-muted/40"
                    }`}
                    onClick={() => void handleVenueSelect(venue.id)}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Building2 className="h-4 w-4" strokeWidth={1.5} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{venue.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {venue.locations?.[0]?.name ?? t("dash_no_location")}
                        </p>
                      </div>
                      {isSelected && <Check className="h-4 w-4 flex-shrink-0 text-primary" strokeWidth={1.8} />}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          <Button
            className="h-10 w-full"
            variant={isJoinVenueOpen ? "secondary" : "default"}
            onClick={() => {
              setIsJoinVenueOpen((prev) => !prev)
              setJoinVenueError(null)
            }}
          >
            <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
            {t("dash_join")}
          </Button>

          {isJoinVenueOpen && (
            <Card className="space-y-3 p-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">{t("dash_invite_code")}</p>
                <p className="text-xs text-muted-foreground">{t("dash_invite_code_hint")}</p>
              </div>
              <Input
                value={joinInviteCode}
                onChange={(event) => {
                  setJoinInviteCode(event.target.value.toUpperCase())
                  if (joinVenueError) setJoinVenueError(null)
                }}
                placeholder="ABC-12345"
                maxLength={24}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                disabled={isJoinVenueSubmitting}
              />
              {joinVenueError && <p className="text-xs text-destructive">{joinVenueError}</p>}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="h-9 flex-1"
                  onClick={() => {
                    setIsJoinVenueOpen(false)
                    setJoinInviteCode("")
                    setJoinVenueError(null)
                  }}
                  disabled={isJoinVenueSubmitting}
                >
                  {t("dash_cancel")}
                </Button>
                <Button
                  className="h-9 flex-1"
                  onClick={() => void handleJoinVenue()}
                  disabled={isJoinVenueSubmitting || joinInviteCode.trim().length < 8}
                >
                  {isJoinVenueSubmitting ? t("dash_connecting") : t("dash_connect")}
                </Button>
              </div>
            </Card>
          )}
        </div>
      </BottomSheet>

      {/* Scrollable content — inner sticky headers stick within this container */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto scrollbar-hidden"
        style={{
          paddingBottom: activeTab === "planner" ? "0" : "96px",
        }}
      >
        {renderContent()}
      </div>

      {/* Bottom Navigation */}
      {accountView !== "hub" && accountView !== "language" && !isVenueSelectorOpen && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md px-3 pb-safe">
          <nav
            aria-label={t("dash_nav_aria")}
            className="pointer-events-auto rounded-full border border-white/20 dark:border-white/10 glass-card p-2 shadow-elev-3"
          >
            <div className="relative grid grid-cols-3 items-center gap-2">
              {/* Sliding active pill */}
              <div
                aria-hidden="true"
                className={[
                  "pointer-events-none absolute inset-y-0 left-0 rounded-full bg-primary",
                  "shadow-[0_8px_20px_var(--tw-shadow-color)] [--tw-shadow-color:oklch(from_var(--primary)_l_c_h_/_0.35)]",
                  "transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  navActiveIndex === -1 ? "opacity-0" : "opacity-100",
                ].join(" ")}
                style={{
                  width: "calc((100% - 1rem) / 3)",
                  transform:
                    navActiveIndex === -1
                      ? "translateX(0)"
                      : `translateX(calc(${navActiveIndex} * (100% + 0.5rem)))`,
                }}
              />
              {WORKER_BOTTOM_NAV_TABS.map(({ key, Icon }) => {
                const isActive = navActiveTab === key
                const tabLabel = key === "shift" ? t("tab_home") : key === "planner" ? t("tab_planner") : t("tab_money")
                return (
                  <button
                    key={key}
                    type="button"
                    aria-label={tabLabel}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => handleTabChange(key)}
                    className={[
                      "relative z-10 flex h-14 min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-full",
                      "transition-[color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                      isActive
                        ? "text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground active:scale-[0.96]",
                    ].join(" ")}
                  >
                    <Icon
                      className={[
                        "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                        isActive ? "size-6 scale-100" : "size-6 scale-[0.93]",
                      ].join(" ")}
                      strokeWidth={isActive ? 2.1 : 1.8}
                    />
                    <span className="sr-only">{tabLabel}</span>
                  </button>
                )
              })}
            </div>
          </nav>
        </div>
      )}

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
            <div className="text-xs text-muted-foreground text-right">{cancelReason.length}/500</div>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              variant="outline"
              onClick={() => setIsCancelDialogOpen(false)}
              disabled={isCancelSubmitting}
            >
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
