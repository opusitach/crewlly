"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { AlertCircle, Building2, Calendar, Check, Clock, DollarSign, Plus, User } from "lucide-react"
import WorkerMoneyView from "@/components/worker-money-view"
import WorkerShiftPlanner from "@/components/worker-shift-planner"
import AppHeader from "@/components/shared/app-header"
import AccountHub from "@/components/account/account-hub"
import WorkerProfile from "@/components/account/worker-profile"
import WorkerSettings from "@/components/account/worker-settings"
import NotificationsPage from "@/components/account/notifications-page"
import { BottomSheet } from "@/components/ui/bottom-sheet"
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
  totalAccruedCents: 0,
  totalMinutesWorked: 0,
  shiftsCount: 0,
  currency: null,
}

const DASHBOARD_STAT_VALUE_CLASS = "text-[clamp(1.25rem,5vw,1.7rem)] font-semibold tracking-tight leading-none tabular-nums"

export default function WorkerDashboard({ onBack }: { onBack?: () => void }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")
  const resolvedTab: "shift" | "planner" | "money" | "profile" =
    tabParam === "planner" || tabParam === "money" || tabParam === "profile" ? tabParam : "shift"
  const [activeTab, setActiveTab] = useState<"shift" | "planner" | "money">(
    resolvedTab === "planner" || resolvedTab === "money" ? resolvedTab : "shift",
  )
  const [nextShift, setNextShift] = useState<NextShiftData | null>(null)
  const [isNextShiftLoading, setIsNextShiftLoading] = useState(false)
  const [monthSummary, setMonthSummary] = useState<WorkerMonthSummary>(EMPTY_MONTH_SUMMARY)
  const [isMonthSummaryLoading, setIsMonthSummaryLoading] = useState(false)
  const [dashboardEvents, setDashboardEvents] = useState<DashboardNotification[]>([])
  const [isEventsLoading, setIsEventsLoading] = useState(false)
  const [accountView, setAccountView] = useState<"none" | "hub" | "profile" | "settings" | "notifications">(
    resolvedTab === "profile" ? "profile" : "none",
  )
  const [unreadNotifications, setUnreadNotifications] = useState<number | null>(null)
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
    if (resolvedTab === "profile") {
      setActiveTab("shift")
      setAccountView("profile")
      return
    }
    setActiveTab(resolvedTab)
    setAccountView((current) => (current === "profile" ? "none" : current))
  }, [resolvedTab])

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
        throw new Error(json?.error || "Не удалось загрузить смену")
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
  }, [])

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

      setMonthSummary({
        totalGrossCents,
        totalSalaryCents,
        totalTipsCents,
        totalAccruedCents: Number.isInteger(rawSummary.totalAccruedCents)
          ? Number(rawSummary.totalAccruedCents)
          : totalSalaryCents + totalTipsCents,
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
        throw new Error(json?.error || "Не удалось отменить смену")
      }
      toast({ title: "Смена отменена" })
      setIsCancelDialogOpen(false)
      setCancelReason("")
      await loadNextShift()
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error?.message || "Не удалось отменить смену",
        variant: "destructive",
      })
    } finally {
      setIsCancelSubmitting(false)
    }
  }, [loadNextShift, nextShift?.id, toast])

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

  const formatTimeRange = (startAt: string, endAt: string) => {
    const start = new Date(startAt)
    const end = new Date(endAt)
    const pad = (value: number) => value.toString().padStart(2, "0")
    return `${pad(start.getHours())}:${pad(start.getMinutes())} - ${pad(end.getHours())}:${pad(end.getMinutes())}`
  }

  const formatShiftDuration = (startAt: string, endAt: string) => {
    const start = new Date(startAt)
    const end = new Date(endAt)
    const totalMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    if (minutes === 0) {
      return `${hours} часов`
    }
    return `${hours} часов ${minutes} минут`
  }

  const formatMoney = (valueCents: number, currency: string | null | undefined) => {
    const safeCurrency = currency || organization?.currency || "CZK"
    try {
      return new Intl.NumberFormat("ru-RU", {
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
    const rendered = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(".", ",")
    return `${rendered} ч`
  }

  const formatShiftCount = (count: number) => {
    const safeCount = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0
    const mod10 = safeCount % 10
    const mod100 = safeCount % 100
    if (mod10 === 1 && mod100 !== 11) return `${safeCount} смена`
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${safeCount} смены`
    return `${safeCount} смен`
  }

  const formatEventTimestamp = (value: string) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const formatShiftDateLine = (startAt: string) => {
    const date = new Date(startAt)
    if (Number.isNaN(date.getTime())) return "Дата не указана"

    const weekdayRaw = date.toLocaleDateString("ru-RU", { weekday: "short" }).replace(".", "")
    const weekday = weekdayRaw.length > 0 ? `${weekdayRaw.charAt(0).toUpperCase()}${weekdayRaw.slice(1)}` : ""
    const dayMonth = date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })
    return weekday ? `${weekday}, ${dayMonth}` : dayMonth
  }

  const getShiftDateBadge = (startAt: string) => {
    const date = new Date(startAt)
    if (Number.isNaN(date.getTime())) {
      return {
        day: "--",
        month: "—",
        weekday: "—",
      }
    }

    const weekdayRaw = date.toLocaleDateString("ru-RU", { weekday: "short" }).replace(".", "")
    return {
      day: date.toLocaleDateString("ru-RU", { day: "2-digit" }),
      month: date.toLocaleDateString("ru-RU", { month: "short" }).replace(".", ""),
      weekday: weekdayRaw.length > 0 ? `${weekdayRaw.charAt(0).toUpperCase()}${weekdayRaw.slice(1)}` : "—",
    }
  }

  const getShiftStatusMeta = (status?: string) => {
    switch (status) {
      case "in_progress":
        return {
          label: "В работе",
          className: "border-sky-300/70 bg-sky-100/80 text-sky-700",
        }
      case "scheduled":
        return {
          label: "Запланирована",
          className: "border-amber-300/70 bg-amber-100/80 text-amber-700",
        }
      case "completed":
        return {
          label: "Завершена",
          className: "border-emerald-300/70 bg-emerald-100/80 text-emerald-700",
        }
      case "canceled":
        return {
          label: "Отменена",
          className: "border-zinc-300/70 bg-zinc-100/80 text-zinc-700",
        }
      case "conflict":
        return {
          label: "Конфликт",
          className: "border-rose-300/70 bg-rose-100/80 text-rose-700",
        }
      default:
        return {
          label: "Ближайшая",
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

  const updateRouteForTab = (nextTab: "shift" | "planner" | "money" | "profile") => {
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
  }

  const handleAccountNavigation = (screen: "profile" | "settings" | "language" | "help" | "team") => {
    closeVenueSelector()
    setAccountView("none")
    if (screen === "profile") {
      setTimeout(() => {
        setAccountView("profile")
        updateRouteForTab("profile")
      }, 100)
    } else if (screen === "settings") {
      setTimeout(() => {
        setAccountView("settings")
        updateRouteForTab("shift")
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
      setJoinVenueError("Введите корректный код приглашения")
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
        const message = typeof json?.error === "string" ? json.error : "Не удалось присоединиться"
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
          : "заведению"
      toast({
        title: status === "ALREADY_MEMBER" ? "Заведение уже подключено" : "Вы присоединились к заведению",
        description: organizationName,
      })

      closeVenueSelector()
    } catch (error: any) {
      const message = error?.message || "Не удалось присоединиться к заведению"
      setJoinVenueError(message)
      toast({ title: "Ошибка", description: message, variant: "destructive" })
    } finally {
      setIsJoinVenueSubmitting(false)
    }
  }, [joinInviteCode, hydrate, loadNextShift, loadMonthSummary, activeTab, accountView, toast, closeVenueSelector])

  const selectedVenue = useMemo(
    () => venues.find((venue) => venue.id === selectedVenueId) ?? null,
    [venues, selectedVenueId],
  )
  const selectedVenueName = selectedVenue?.name ?? organization?.name ?? "Заведение"
  const navActiveTab: "shift" | "planner" | "money" | "profile" = accountView === "profile" ? "profile" : activeTab
  const showAppHeader = accountView !== "hub"
  const appHeaderTitle =
    accountView === "profile"
      ? "Профиль"
      : accountView === "settings"
        ? "Настройки"
        : accountView === "notifications"
          ? "Уведомления"
          : activeTab === "planner"
            ? "Смены"
            : activeTab === "money"
              ? "Деньги"
              : "Моя смена"
  const nextShiftStatusMeta = nextShift ? getShiftStatusMeta(nextShift.status) : null
  const nextShiftDateLine = nextShift ? formatShiftDateLine(nextShift.startAt) : ""
  const nextShiftDateBadge = nextShift ? getShiftDateBadge(nextShift.startAt) : null
  const nextShiftSalaryText =
    nextShift == null
      ? "—"
      : nextShift.salaryMessage
        ? nextShift.salaryMessage
        : nextShift.salaryCents != null
          ? formatMoney(nextShift.salaryCents, nextShift.currency)
          : "—"
  const currentMonthLabel = new Date().toLocaleDateString("ru-RU", { month: "long" })
  const monthHoursText = formatMonthHours(monthSummary.totalMinutesWorked)
  const monthShiftsText = formatShiftCount(monthSummary.shiftsCount)
  const monthSalaryText = formatMoney(monthSummary.totalSalaryCents, monthSummary.currency ?? organization?.currency)
  const monthTipsText = formatMoney(monthSummary.totalTipsCents, monthSummary.currency ?? organization?.currency)
  const visibleDashboardEvents = dashboardEvents.slice(0, 3)
  const hasMoreDashboardEvents = dashboardEvents.length > 3

  const handleTabChange = (tab: "shift" | "planner" | "money" | "profile") => {
    if (tab === "profile") {
      setAccountView("profile")
      setActiveTab("shift")
      updateRouteForTab("profile")
      return
    }
    setAccountView("none")
    setActiveTab(tab)
    updateRouteForTab(tab)
  }

  const openAccountHub = () => {
    if (resolvedTab === "profile") {
      updateRouteForTab("shift")
    }
    setAccountView("hub")
  }

  const openNotifications = () => {
    if (resolvedTab === "profile") {
      updateRouteForTab("shift")
    }
    setAccountView("notifications")
  }

  const renderContent = () => {
    if (accountView === "profile") {
      return (
        <WorkerProfile
          onBack={() => {
            setAccountView("none")
            updateRouteForTab("shift")
          }}
          onLogout={handleLogout}
          hideHeader
        />
      )
    }

    if (accountView === "settings") {
      return <WorkerSettings onBack={() => setAccountView("none")} hideHeader />
    }

    if (accountView === "notifications") {
      return (
        <NotificationsPage
          hideHeader
          onBack={() => {
            setAccountView("none")
            setUnreadNotifications(0)
          }}
        />
      )
    }

    if (activeTab === "money") {
      return <WorkerMoneyView onBack={() => handleTabChange("shift")} hideHeader />
    }

    if (activeTab === "planner") {
      return <WorkerShiftPlanner onBack={() => handleTabChange("shift")} hideHeader />
    }

    return (
      <>
        <div className="px-3 pt-4">
          <h1 className="text-2xl font-bold">{organization?.name ?? "Заведение"}</h1>
        </div>

        {/* Content */}
        <div className="p-3 pt-2 space-y-4">
          {/* Next Shift */}
          <div className="space-y-2">
            <h2 className="text-base font-semibold">Ближайшая смена</h2>
            <Card className="group relative overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-primary/5 p-3 shadow-sm">
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/90 via-primary/70 to-transparent" />
              <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-primary/10 blur-2xl" />

              {isNextShiftLoading && (
                <div className="relative flex min-h-[128px] items-center justify-center text-sm text-muted-foreground">
                  Загрузка смены...
                </div>
              )}
              {!isNextShiftLoading && !nextShift && (
                <div className="relative flex min-h-[128px] flex-col items-center justify-center gap-1 text-center">
                  <Calendar className="h-5 w-5 text-muted-foreground/70" strokeWidth={1.6} />
                  <p className="text-sm font-medium">У вас пока нет смен</p>
                  <p className="text-xs text-muted-foreground">Как только менеджер назначит смену, она появится здесь</p>
                </div>
              )}
              {!isNextShiftLoading && nextShift && (
                <div className="relative space-y-3">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-semibold">Ближайшая смена</h3>
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
                      {formatTimeRange(nextShift.startAt, nextShift.endAt)}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/70 px-2 py-1 text-[11px] text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" strokeWidth={1.6} />
                      {formatShiftDuration(nextShift.startAt, nextShift.endAt)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-md border border-border/60 bg-background/70 px-2.5 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Должность</p>
                      <p className="mt-1 truncate text-sm font-semibold">{nextShift.positionName ?? "Без должности"}</p>
                    </div>
                    <div className="rounded-md border border-border/60 bg-background/70 px-2.5 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Зарплата</p>
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
                          Правила
                        </Button>
                        <Button
                          className="h-9 text-sm"
                          variant="destructive"
                          onClick={() => router.push(`/shift-procedures/${nextShift.id}?when=CLOSE`)}
                        >
                          Закрыть смену
                        </Button>
                      </>
                    ) : nextShift.status === "scheduled" ? (
                      <>
                        <Button
                          className="h-9 text-sm"
                          onClick={() => router.push(`/shift-procedures/${nextShift.id}?when=OPEN`)}
                        >
                          Открыть смену
                        </Button>
                        <Button
                          className="h-9 border-destructive/40 text-destructive hover:bg-destructive/10"
                          variant="outline"
                          onClick={() => setIsCancelDialogOpen(true)}
                        >
                          Отменить смену
                        </Button>
                      </>
                    ) : nextShift.status === "completed" ? (
                      <div className="col-span-2 rounded-md border border-border/60 bg-background/70 px-2.5 py-2 text-center text-xs text-muted-foreground">
                        Смена завершена
                      </div>
                    ) : nextShift.status === "canceled" ? (
                      <div className="col-span-2 rounded-md border border-border/60 bg-background/70 px-2.5 py-2 text-center text-xs text-muted-foreground">
                        Смена отменена
                      </div>
                    ) : nextShift.status === "conflict" ? (
                      <div className="col-span-2 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-center text-xs text-destructive">
                        Смена в конфликте. Обратитесь к менеджеру.
                      </div>
                    ) : (
                      <Button
                        className="col-span-2 h-9 text-sm"
                        onClick={() => router.push(`/shift-procedures/${nextShift.id}?when=OPEN`)}
                      >
                        Перейти к правилам
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
                    За {currentMonthLabel}
                  </p>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300">
                    <Clock className="h-4 w-4" strokeWidth={1.8} />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className={DASHBOARD_STAT_VALUE_CLASS}>{isMonthSummaryLoading ? "—" : monthHoursText}</p>
                  <p className="text-xs font-medium text-muted-foreground">{isMonthSummaryLoading ? "Загрузка..." : monthShiftsText}</p>
                </div>
              </div>
            </Card>

            <Card className="group relative min-h-[122px] overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-emerald-50/40 p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:to-emerald-500/10">
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-emerald-500/80 via-emerald-400/70 to-transparent" />
              <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-emerald-500/10 blur-2xl" />
              <div className="relative flex h-full flex-col justify-between gap-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    За {currentMonthLabel}
                  </p>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                    <DollarSign className="h-4 w-4" strokeWidth={1.8} />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className={DASHBOARD_STAT_VALUE_CLASS}>{isMonthSummaryLoading ? "—" : monthSalaryText}</p>
                  <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                    {isMonthSummaryLoading ? "Загрузка..." : `+ ${monthTipsText} чаевых`}
                  </p>
                </div>
              </div>
            </Card>
          </div>

          <div className="space-y-3 pt-2.5">
            <h2 className="text-[17px] leading-none font-semibold">События</h2>
            {isEventsLoading ? (
              <Card className="p-4 text-sm text-muted-foreground text-center">Загрузка событий...</Card>
            ) : dashboardEvents.length === 0 ? (
              <Card className="p-4">
                <p className="text-sm text-muted-foreground text-center">Тут пока нет событий</p>
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
                            <p className="text-sm font-medium truncate">{event.title}</p>
                            {event.status === "unread" && (
                              <AlertCircle className="h-3.5 w-3.5 text-primary flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{event.message}</p>
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
                    Больше
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-20 max-w-md mx-auto">
      {showAppHeader && (
        <AppHeader
          title={appHeaderTitle}
          onBack={onBack}
          showVenueSelector={accountView === "none"}
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
        userName={user?.name ?? "Аккаунт"}
        onNavigate={handleAccountNavigation}
      />

      <BottomSheet isOpen={isVenueSelectorOpen} onClose={closeVenueSelector}>
        <div className="space-y-3">
          <div>
            <h3 className="text-base font-semibold">Выберите заведение</h3>
            <p className="text-xs text-muted-foreground">Переключайтесь между заведениями в один тап</p>
          </div>

          {venues.length === 0 ? (
            <Card className="p-3">
              <p className="text-sm text-muted-foreground">У вас пока нет доступных заведений</p>
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
                          {venue.locations?.[0]?.name ?? "Без локации"}
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
            Присоединиться
          </Button>

          {isJoinVenueOpen && (
            <Card className="space-y-3 p-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">Код приглашения</p>
                <p className="text-xs text-muted-foreground">Введите код, который вам выдал владелец или менеджер</p>
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
                  Отмена
                </Button>
                <Button
                  className="h-9 flex-1"
                  onClick={() => void handleJoinVenue()}
                  disabled={isJoinVenueSubmitting || joinInviteCode.trim().length < 8}
                >
                  {isJoinVenueSubmitting ? "Подключаем..." : "Подключить"}
                </Button>
              </div>
            </Card>
          )}
        </div>
      </BottomSheet>

      {renderContent()}

      {/* Bottom Navigation */}
      {accountView !== "hub" && !isVenueSelectorOpen && (
        <div className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto">
          <div className="glass-card border-t-0 border-x-0 rounded-none">
            <div className="flex items-center justify-around h-14 px-2 pb-safe">
              {/* Shift Tab */}
              <button
                onClick={() => handleTabChange("shift")}
                className={`
                  flex flex-col items-center justify-center gap-0.5 
                  min-w-[44px] min-h-[44px] flex-1 rounded-lg transition-all
                  ${
                    navActiveTab === "shift"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground active:scale-95"
                  }
                `}
              >
                <Clock className="h-6 w-6" strokeWidth={1.5} />
                <span className="text-[10px] font-medium leading-none">Смена</span>
              </button>

              {/* Planner Tab */}
              <button
                onClick={() => handleTabChange("planner")}
                className={`
                  flex flex-col items-center justify-center gap-0.5 
                  min-w-[44px] min-h-[44px] flex-1 rounded-lg transition-all
                  ${
                    navActiveTab === "planner"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground active:scale-95"
                  }
                `}
              >
                <Calendar className="h-6 w-6" strokeWidth={1.5} />
                <span className="text-[10px] font-medium leading-none">Планнер</span>
              </button>

              {/* Money Tab */}
              <button
                onClick={() => handleTabChange("money")}
                className={`
                  flex flex-col items-center justify-center gap-0.5 
                  min-w-[44px] min-h-[44px] flex-1 rounded-lg transition-all
                  ${
                    navActiveTab === "money"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground active:scale-95"
                  }
                `}
              >
                <DollarSign className="h-6 w-6" strokeWidth={1.5} />
                <span className="text-[10px] font-medium leading-none">Деньги</span>
              </button>

              {/* Profile Tab */}
              <button
                onClick={() => handleTabChange("profile")}
                className={`
                  flex flex-col items-center justify-center gap-0.5 
                  min-w-[44px] min-h-[44px] flex-1 rounded-lg transition-all
                  ${
                    navActiveTab === "profile"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground active:scale-95"
                  }
                `}
              >
                <User className="h-6 w-6" strokeWidth={1.5} />
                <span className="text-[10px] font-medium leading-none">Профиль</span>
              </button>
            </div>
          </div>
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
            <DialogTitle>Отмена смены</DialogTitle>
            <DialogDescription>
              Укажите причину отмены. Владелец увидит ее в деталях смены.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              rows={4}
              maxLength={500}
              placeholder="Например: заболел, не могу выйти на смену"
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
              Назад
            </Button>
            <Button
              variant="destructive"
              onClick={() => void cancelShift(cancelReason.trim())}
              disabled={isCancelSubmitting || cancelReason.trim().length < 3}
            >
              {isCancelSubmitting ? "Отменяем..." : "Отменить смену"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
