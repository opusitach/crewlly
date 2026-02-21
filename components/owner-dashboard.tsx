"use client"

import { useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Plus,
  Clock,
  DollarSign,
  TrendingUp,
  AlertCircle,
  Users,
  ShieldCheck,
  Sparkles,
  ChevronRight,
  Building2,
  Check,
} from "lucide-react"
import CashRegisterVerificationView from "@/components/cash-register-verification-view"
import ReportsView from "@/components/reports-view"
import GlobalSettingsView, { type SettingsScreen } from "@/components/global-settings-view"
import { type CashSettingsTab } from "@/components/cash-settings-view"
import AppHeader from "@/components/shared/app-header"
import OwnerBottomNav, { type OwnerTab } from "@/components/shared/owner-bottom-nav"
import AccountHub from "@/components/account/account-hub"
import OwnerProfile from "@/components/account/owner-profile"
import NotificationsPage from "@/components/account/notifications-page"
import TeamMovedHint from "@/components/notifications/team-moved-hint"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { useAuthStore } from "@/lib/store/auth-store"
import { useShiftStore } from "@/lib/store/shift-store"

const ShiftsView = dynamic(() => import("@/components/shifts-view"), { ssr: false })

const OWNER_TABS: OwnerTab[] = ["dashboard", "shifts", "cash", "reports", "settings"]
const dateInputPattern = /^\d{4}-\d{2}-\d{2}$/

type DashboardNotification = {
  id: string
  type: "shift" | "cash" | "receipt" | "system"
  title: string
  message: string
  status: "read" | "unread"
  createdAt: string
}

type AttentionItemKey = "cash" | "employees" | "roles" | "tips"

type AttentionItem = {
  key: AttentionItemKey
  title: string
  description: string
  hint: string
  status: "ok" | "warning"
}

type VerificationSummaryResponse = {
  data?: {
    totalOnReview?: number
  }
}

type CashSummaryFormulaItem = {
  totalValueCents: number
  isRevenueSource?: boolean
}

type CashSummaryResponse = {
  data?: {
    summary?: {
      currency?: string | null
      formulas?: CashSummaryFormulaItem[]
    }
  }
}

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const capitalize = (value: string) => (value.length > 0 ? value.charAt(0).toUpperCase() + value.slice(1) : value)

const getCurrentMonthLabel = () => capitalize(new Date().toLocaleDateString("ru-RU", { month: "long" }))

const DASHBOARD_KPI_VALUE_CLASS =
  "text-[clamp(1.15rem,3.6vw,1.65rem)] font-semibold tracking-tight leading-none tabular-nums whitespace-nowrap"

const isDateInputValue = (value: string | null | undefined): value is string =>
  typeof value === "string" && dateInputPattern.test(value)

const formatRevenueAmount = (value: number | null, currency: string) => {
  if (value == null) return "—"
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

export default function OwnerDashboard({ onBack }: { onBack?: () => void }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")
  const cashTabParam = searchParams.get("cashTab")
  const reportsFromParam = searchParams.get("reportsFrom")
  const reportsToParam = searchParams.get("reportsTo")
  const shiftsDateParam = searchParams.get("shiftsDate")
  const resolvedTab: OwnerTab = OWNER_TABS.includes(tabParam as OwnerTab) ? (tabParam as OwnerTab) : "dashboard"
  const initialCashTab = cashTabParam === "review_queue" ? "review_queue" : undefined
  const initialReportsFromDate = isDateInputValue(reportsFromParam) ? reportsFromParam : undefined
  const initialReportsToDate = isDateInputValue(reportsToParam) ? reportsToParam : undefined
  const initialShiftsDate = isDateInputValue(shiftsDateParam) ? shiftsDateParam : undefined
  const [activeTab, setActiveTab] = useState<OwnerTab>(() => resolvedTab)
  const [accountView, setAccountView] = useState<"none" | "hub" | "profile" | "notifications">("none")
  const [isVenueSelectorOpen, setIsVenueSelectorOpen] = useState(false)
  const [showTeamHint, setShowTeamHint] = useState(true)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [dashboardEvents, setDashboardEvents] = useState<DashboardNotification[]>([])
  const [isEventsLoading, setIsEventsLoading] = useState(false)
  const [settingsInitialScreen, setSettingsInitialScreen] = useState<SettingsScreen>("home")
  const [settingsInitialCashTab, setSettingsInitialCashTab] = useState<CashSettingsTab>("open")
  const [verificationQueueCount, setVerificationQueueCount] = useState(0)
  const [todayRevenueAmount, setTodayRevenueAmount] = useState<number | null>(null)
  const [monthRevenueAmount, setMonthRevenueAmount] = useState<number | null>(null)
  const [revenueCurrency, setRevenueCurrency] = useState<string>("CZK")
  const [isAttentionLoading, setIsAttentionLoading] = useState(false)
  const [attentionItems, setAttentionItems] = useState<AttentionItem[]>([
    {
      key: "cash",
      title: "Касса",
      description: "Проверяем настройки кассы...",
      hint: "Настройки -> Касса",
      status: "warning",
    },
    {
      key: "employees",
      title: "Сотрудники",
      description: "Проверяем сотрудников...",
      hint: "Настройки -> Команда",
      status: "warning",
    },
    {
      key: "roles",
      title: "Роли и правила",
      description: "Проверяем роли и правила...",
      hint: "Настройки -> Роли и правила",
      status: "warning",
    },
    {
      key: "tips",
      title: "Чаевые",
      description: "Проверяем формулу чаевых...",
      hint: "Настройки -> Касса -> Формулы",
      status: "warning",
    },
  ])
  const {
    user,
    venues,
    selectedVenueId,
    defaultLocationId,
    selectVenue,
    logout,
    hydrate: hydrateAuth,
    isHydrated: isAuthHydrated,
    isAuthenticated,
    isLoading: isAuthLoading,
  } = useAuthStore()
  const { hydrate: hydrateShifts, intervals, workdays } = useShiftStore()

  const selectedVenue = useMemo(
    () => venues.find((venue) => venue.id === selectedVenueId) ?? null,
    [venues, selectedVenueId],
  )
  const selectedVenueName = selectedVenue?.name ?? "Заведение"
  const attentionLocationId = useMemo(() => {
    if (selectedVenue?.locations && selectedVenue.locations.length > 0) {
      const selectedLocation = selectedVenue.locations.find((location) => location.id === defaultLocationId)
      return selectedLocation?.id ?? selectedVenue.locations[0]?.id ?? defaultLocationId ?? null
    }
    return defaultLocationId ?? null
  }, [selectedVenue, defaultLocationId])

  useEffect(() => {
    if (!isAuthHydrated) {
      void hydrateAuth()
    }
  }, [isAuthHydrated, hydrateAuth])

  useEffect(() => {
    setActiveTab(resolvedTab)
  }, [resolvedTab])
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.replace("/login")
    }
  }, [isAuthLoading, isAuthenticated, router])

  useEffect(() => {
    if (activeTab !== "settings") {
      setSettingsInitialScreen("home")
      setSettingsInitialCashTab("open")
    }
  }, [activeTab])

  const updateRouteForTab = (
    nextTab: OwnerTab,
    contextParams?: Partial<Record<"cashTab" | "reportsFrom" | "reportsTo" | "shiftsDate", string | null>>,
  ) => {
    const nextParams = new URLSearchParams(searchParams.toString())
    if (nextTab === "dashboard") {
      nextParams.delete("tab")
    } else {
      nextParams.set("tab", nextTab)
    }

    if (nextTab !== "cash") {
      nextParams.delete("cashTab")
    }
    if (nextTab !== "reports") {
      nextParams.delete("reportsFrom")
      nextParams.delete("reportsTo")
    }
    if (nextTab !== "shifts") {
      nextParams.delete("shiftsDate")
    }

    if (contextParams) {
      for (const [key, value] of Object.entries(contextParams)) {
        if (value == null || value.length === 0) {
          nextParams.delete(key)
        } else {
          nextParams.set(key, value)
        }
      }
    }

    setActiveTab(nextTab)
    const nextQuery = nextParams.toString()
    const nextHref = nextQuery ? `/app?${nextQuery}` : "/app"
    const currentQuery = searchParams.toString()
    const currentHref = currentQuery ? `/app?${currentQuery}` : "/app"

    if (nextHref === currentHref) return

    const shouldPushToHistory = resolvedTab === "dashboard" && nextTab !== "dashboard"
    if (shouldPushToHistory) {
      router.push(nextHref)
      return
    }
    router.replace(nextHref)
  }

  const setTab = (nextTab: OwnerTab) => {
    updateRouteForTab(nextTab)
  }

  useEffect(() => {
    const loadUnreadNotifications = async () => {
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

    if (!isAuthLoading && isAuthenticated) {
      void loadUnreadNotifications()
      const intervalId = window.setInterval(() => {
        void loadUnreadNotifications()
      }, 20000)
      return () => window.clearInterval(intervalId)
    }

    return
  }, [isAuthLoading, isAuthenticated])

  useEffect(() => {
    if (activeTab !== "dashboard" || isAuthLoading || !isAuthenticated) return

    let active = true
    setIsEventsLoading(true)

    const loadDashboardEvents = async () => {
      try {
        const res = await fetch("/api/notifications?types=shift,cash&limit=5", {
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
  }, [activeTab, isAuthLoading, isAuthenticated])

  useEffect(() => {
    if (activeTab !== "dashboard" || isAuthLoading || !isAuthenticated) return

    let active = true

    const loadRevenueWidgets = async () => {
      const now = new Date()
      const todayDate = toDateInputValue(now)
      const monthStart = toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1))
      const monthEnd = todayDate

      const findRevenueFormulaTotal = (response: CashSummaryResponse | null) => {
        const formulas = Array.isArray(response?.data?.summary?.formulas) ? response?.data?.summary?.formulas : []
        const revenueSources = formulas.filter((formula) => formula?.isRevenueSource === true)
        if (revenueSources.length === 0) return null
        return revenueSources.reduce((acc, formula) => {
          const value = Number(formula.totalValueCents)
          return acc + (Number.isFinite(value) ? value : 0)
        }, 0)
      }

      try {
        const [todayRes, monthRes] = await Promise.all([
          fetch(`/api/reports/cash-summary?dateFrom=${todayDate}&dateTo=${todayDate}`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/reports/cash-summary?dateFrom=${monthStart}&dateTo=${monthEnd}`, {
            credentials: "include",
            cache: "no-store",
          }),
        ])

        if (!todayRes.ok || !monthRes.ok) {
          if (!active) return
          setTodayRevenueAmount(null)
          setMonthRevenueAmount(null)
          return
        }

        const [todayJson, monthJson] = await Promise.all([
          todayRes.json().catch(() => null) as Promise<CashSummaryResponse | null>,
          monthRes.json().catch(() => null) as Promise<CashSummaryResponse | null>,
        ])

        if (!active) return

        const currency = monthJson?.data?.summary?.currency ?? todayJson?.data?.summary?.currency ?? "CZK"
        setRevenueCurrency(currency)
        setTodayRevenueAmount(findRevenueFormulaTotal(todayJson))
        setMonthRevenueAmount(findRevenueFormulaTotal(monthJson))
      } catch {
        if (!active) return
        setTodayRevenueAmount(null)
        setMonthRevenueAmount(null)
      }
    }

    void loadRevenueWidgets()
    const intervalId = window.setInterval(() => {
      void loadRevenueWidgets()
    }, 20000)

    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [activeTab, isAuthLoading, isAuthenticated])

  useEffect(() => {
    if (activeTab !== "dashboard" || isAuthLoading || !isAuthenticated) return

    let active = true

    const loadVerificationSummary = async () => {
      try {
        const res = await fetch("/api/verifications/summary", {
          credentials: "include",
          cache: "no-store",
        })
        if (!res.ok) {
          if (active) setVerificationQueueCount(0)
          return
        }
        const json = (await res.json().catch(() => null)) as VerificationSummaryResponse | null
        if (!active) return
        const total = Number(json?.data?.totalOnReview ?? 0)
        setVerificationQueueCount(Number.isFinite(total) ? total : 0)
      } catch {
        if (active) setVerificationQueueCount(0)
      }
    }

    void loadVerificationSummary()
    const intervalId = window.setInterval(() => {
      void loadVerificationSummary()
    }, 20000)

    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [activeTab, isAuthLoading, isAuthenticated])

  useEffect(() => {
    if (activeTab !== "dashboard" || isAuthLoading || !isAuthenticated) return

    let active = true
    setIsAttentionLoading(true)

    const hasConfiguredSalary = (employee: any) => {
      const activePayComponents = Array.isArray(employee?.payComponents) ? employee.payComponents : []
      const hasConfiguredComponent = activePayComponents.some((component: any) => {
        const isActive = component?.isActive !== false
        if (!isActive) return false
        if (component?.componentType === "percent_revenue") {
          return Number(component?.rateBp ?? 0) > 0
        }
        return Number(component?.amountCents ?? 0) > 0
      })
      if (hasConfiguredComponent) return true

      if (employee?.payType === "hourly") {
        return Number(employee?.defaultHourlyRateCents ?? 0) > 0
      }
      if (employee?.payType === "fixed_shift") {
        return Number(employee?.defaultShiftRateCents ?? 0) > 0
      }
      if (employee?.payType === "percent_revenue") {
        return Number(employee?.percentRevenueBp ?? 0) > 0
      }

      return false
    }

    const formatEmployeesLabel = (count: number) => {
      const mod10 = count % 10
      const mod100 = count % 100
      if (mod10 === 1 && mod100 !== 11) return "сотрудник"
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "сотрудника"
      return "сотрудников"
    }

    const loadAttention = async () => {
      try {
        const cashSettingsUrl = attentionLocationId
          ? `/api/cash/settings?locationId=${encodeURIComponent(attentionLocationId)}`
          : "/api/cash/settings"
        const employeesUrl = attentionLocationId
          ? `/api/employees?locationId=${encodeURIComponent(attentionLocationId)}`
          : "/api/employees"

        const [cashResponse, employeesResponse, positionsResponse] = await Promise.all([
          fetch(cashSettingsUrl, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(employeesUrl, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch("/api/positions", { credentials: "include", cache: "no-store" }),
        ])

        const [cashJson, employeesJson, positionsJson] = await Promise.all([
          cashResponse.json().catch(() => null),
          employeesResponse.json().catch(() => null),
          positionsResponse.json().catch(() => null),
        ])

        const cashFields = Array.isArray(cashJson?.data?.fields) ? cashJson.data.fields : []
        const cashFormulas = Array.isArray(cashJson?.data?.formulas) ? cashJson.data.formulas : []
        const hasOpenCashField = cashFields.some((field: any) => field?.isActive && field?.inputStage === "open")
        const hasCloseCashField = cashFields.some((field: any) => field?.isActive && field?.inputStage === "close")
        const cashConfigured = cashResponse.ok && hasOpenCashField && hasCloseCashField
        const tipsFormulaConfigured =
          cashResponse.ok && cashFormulas.some((formula: any) => formula?.isTipsSource === true)

        const employees = Array.isArray(employeesJson?.data) ? employeesJson.data : []
        const employeesWithoutSalary = employees.filter((employee: any) => !hasConfiguredSalary(employee))

        const positions = Array.isArray(positionsJson?.data) ? positionsJson.data : []
        const positionsWithoutRules = positions.filter((position: any) => {
          const defaultOpenRules = Number(position?.defaultOpenRulesCount ?? 0)
          const defaultCloseRules = Number(position?.defaultCloseRulesCount ?? 0)
          return Boolean(position?.needsRulesSetup) || defaultOpenRules < 1 || defaultCloseRules < 1
        })

        const nextAttentionItems: AttentionItem[] = [
          {
            key: "cash",
            title: "Касса",
            status: cashConfigured ? "ok" : "warning",
            description: cashConfigured
              ? "Поля открытия и закрытия настроены."
              : "Добавьте хотя бы одно активное поле для открытия и закрытия смены.",
            hint: "Настройки -> Касса",
          },
          {
            key: "employees",
            title: "Сотрудники",
            status: employeesWithoutSalary.length > 0 ? "warning" : "ok",
            description:
              employeesWithoutSalary.length > 0
                ? `${employeesWithoutSalary.length} ${formatEmployeesLabel(employeesWithoutSalary.length)} без зарплаты.`
                : employees.length > 0
                  ? "У всех сотрудников заполнена зарплата."
                  : "Сотрудников пока нет.",
            hint: "Настройки -> Команда",
          },
          {
            key: "roles",
            title: "Роли и правила",
            status: positions.length === 0 || positionsWithoutRules.length > 0 ? "warning" : "ok",
            description:
              positions.length === 0
                ? "Нет активных ролей. Добавьте роль и настройте правила."
                : positionsWithoutRules.length > 0
                  ? `Для ${positionsWithoutRules.length} ролей не хватает правил открытия или закрытия.`
                  : "Роли и правила настроены.",
            hint: "Настройки -> Роли и правила",
          },
          {
            key: "tips",
            title: "Чаевые",
            status: tipsFormulaConfigured ? "ok" : "warning",
            description: tipsFormulaConfigured
              ? "Формула чаевых настроена."
              : "Добавьте формулу чаевых во вкладке «Формулы» в настройках кассы.",
            hint: "Настройки -> Касса -> Формулы",
          },
        ]

        if (!active) return
        setAttentionItems(nextAttentionItems)
      } catch {
        if (!active) return
        setAttentionItems([
          {
            key: "cash",
            title: "Касса",
            description: "Не удалось проверить настройки. Откройте раздел и проверьте вручную.",
            hint: "Настройки -> Касса",
            status: "warning",
          },
          {
            key: "employees",
            title: "Сотрудники",
            description: "Не удалось проверить зарплаты сотрудников. Откройте раздел и проверьте вручную.",
            hint: "Настройки -> Команда",
            status: "warning",
          },
          {
            key: "roles",
            title: "Роли и правила",
            description: "Не удалось проверить роли и правила. Откройте раздел и проверьте вручную.",
            hint: "Настройки -> Роли и правила",
            status: "warning",
          },
          {
            key: "tips",
            title: "Чаевые",
            description: "Не удалось проверить формулу чаевых. Откройте раздел и проверьте вручную.",
            hint: "Настройки -> Касса -> Формулы",
            status: "warning",
          },
        ])
      } finally {
        if (active) setIsAttentionLoading(false)
      }
    }

    void loadAttention()
    const intervalId = window.setInterval(() => {
      void loadAttention()
    }, 30000)

    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [activeTab, isAuthLoading, isAuthenticated, attentionLocationId])

  // Hydrate shift store after auth is ready
  useEffect(() => {
    if (isAuthHydrated && user?.id && selectedVenueId) {
      void hydrateShifts()
    }
  }, [isAuthHydrated, user?.id, selectedVenueId, hydrateShifts])

  const workdayDateById = useMemo(() => new Map(workdays.map((workday) => [workday.id, workday.workDate])), [workdays])

  const dateWithOpenShift = useMemo(() => {
    const openIntervals = intervals.filter((interval) => interval.status === "in_progress")
    if (openIntervals.length === 0) return null

    const candidates = openIntervals
      .map((interval) => {
        const workdayDate = workdayDateById.get(interval.workdayId)
        if (isDateInputValue(workdayDate)) return workdayDate

        const fallback = new Date(interval.startAt)
        if (Number.isNaN(fallback.getTime())) return null
        return toDateInputValue(fallback)
      })
      .filter((value): value is string => Boolean(value))

    if (candidates.length === 0) return null
    candidates.sort((a, b) => b.localeCompare(a))
    return candidates[0]
  }, [intervals, workdayDateById])

  const activeIntervalsCount = useMemo(
    () => intervals.filter((interval) => interval.status === "in_progress").length,
    [intervals],
  )

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

  const visibleDashboardEvents = dashboardEvents.slice(0, 3)
  const hasMoreDashboardEvents = dashboardEvents.length > 3
  const warningsCount = attentionItems.filter((item) => item.status === "warning").length
  const warningsLabel = warningsCount === 1 ? "1 требует внимания" : `${warningsCount} требуют внимания`
  const currentMonthLabel = getCurrentMonthLabel()

  const openReviewQueue = () => {
    updateRouteForTab("cash", { cashTab: "review_queue" })
  }

  const openTodayRevenueReport = () => {
    const today = toDateInputValue(new Date())
    updateRouteForTab("reports", { reportsFrom: today, reportsTo: today })
  }

  const openCurrentMonthRevenueReport = () => {
    const now = new Date()
    const monthStart = toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1))
    const today = toDateInputValue(now)
    updateRouteForTab("reports", { reportsFrom: monthStart, reportsTo: today })
  }

  const openShiftsPlanner = () => {
    const targetDate = dateWithOpenShift ?? toDateInputValue(new Date())
    updateRouteForTab("shifts", { shiftsDate: targetDate })
  }

  const handleAccountNavigation = (screen: "profile" | "settings" | "language" | "help" | "team") => {
    setIsVenueSelectorOpen(false)
    setAccountView("none")
    if (screen === "profile") {
      setTimeout(() => setAccountView("profile"), 100)
    } else if (screen === "settings") {
      setSettingsInitialScreen("home")
      setSettingsInitialCashTab("open")
      setTab("settings")
    } else if (screen === "team") {
      setShowTeamHint(false)
      router.push("/app/team")
    }
  }

  const openSettingsSection = (
    screen: Extract<SettingsScreen, "cash" | "team" | "roles">,
    cashTab: CashSettingsTab = "open",
  ) => {
    setIsVenueSelectorOpen(false)
    setSettingsInitialScreen(screen)
    setSettingsInitialCashTab(screen === "cash" ? cashTab : "open")
    setTab("settings")
  }

  const handleVenueSelect = async (venueId: string) => {
    if (venueId === selectedVenueId) {
      setIsVenueSelectorOpen(false)
      return
    }

    try {
      await selectVenue(venueId)
      if (activeTab === "dashboard") {
        setIsEventsLoading(true)
      }

      // Immediately refresh notifications and events for the newly selected venue.
      const unreadPromise = fetch("/api/notifications?status=unread", { credentials: "include", cache: "no-store" })
      const eventsPromise =
        activeTab === "dashboard"
          ? fetch("/api/notifications?types=shift,cash&limit=5", { credentials: "include", cache: "no-store" })
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

      void hydrateShifts()
    } catch (error) {
      console.error("Failed to switch venue from selector", error)
    } finally {
      if (activeTab === "dashboard") {
        setIsEventsLoading(false)
      }
      setIsVenueSelectorOpen(false)
    }
  }

  const handleAddVenue = () => {
    setIsVenueSelectorOpen(false)
    setAccountView("none")
    router.push("/app/venues/new")
  }

  const handleLogout = () => {
    void logout()
    setAccountView("none")
    onBack?.()
  }

  const renderAccountOverlay = () => {
    if (accountView === "profile") {
      return <OwnerProfile onBack={() => setAccountView("none")} onLogout={handleLogout} />
    }
    if (accountView === "notifications") {
      return (
        <NotificationsPage
          onBack={() => {
            setAccountView("none")
            setUnreadNotifications(0)
          }}
        />
      )
    }
    return null
  }

  const renderContent = () => {
    if (activeTab === "shifts") return <ShiftsView onBack={() => setTab("dashboard")} initialDate={initialShiftsDate} />
    if (activeTab === "cash")
      return <CashRegisterVerificationView onBack={() => setTab("dashboard")} initialTab={initialCashTab} />
    if (activeTab === "reports")
      return <ReportsView initialFromDate={initialReportsFromDate} initialToDate={initialReportsToDate} />
    if (activeTab === "settings") {
      return (
        <GlobalSettingsView
          onBack={() => setTab("dashboard")}
          initialScreen={settingsInitialScreen}
          initialCashTab={settingsInitialCashTab}
        />
      )
    }
    return (
      <div className="p-3 space-y-3">
        {showTeamHint && <TeamMovedHint />}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-2.5">
          <Card
            className="group relative min-h-[122px] cursor-pointer overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-amber-50/40 p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:to-amber-500/10"
            onClick={openReviewQueue}
          >
            <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-amber-500/80 via-amber-400/70 to-transparent" />
            <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-amber-500/10 blur-2xl" />
            <div className="relative flex h-full flex-col justify-between gap-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">На проверке</p>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                  <Clock className="h-4 w-4" strokeWidth={1.8} />
                </div>
              </div>
              <div className="space-y-1">
                <p className={DASHBOARD_KPI_VALUE_CLASS}>{verificationQueueCount}</p>
                <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Требуют внимания</p>
              </div>
            </div>
          </Card>

          <Card
            className="group relative min-h-[122px] cursor-pointer overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-emerald-50/40 p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:to-emerald-500/10"
            onClick={openTodayRevenueReport}
          >
            <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-emerald-500/80 via-emerald-400/70 to-transparent" />
            <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-emerald-500/10 blur-2xl" />
            <div className="relative flex h-full flex-col justify-between gap-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Сегодня</p>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                  <TrendingUp className="h-4 w-4" strokeWidth={1.8} />
                </div>
              </div>
              <div className="space-y-1">
                <p className={DASHBOARD_KPI_VALUE_CLASS}>
                  {formatRevenueAmount(todayRevenueAmount, revenueCurrency)}
                </p>
                <p className="text-xs font-medium text-muted-foreground">Выручка</p>
              </div>
            </div>
          </Card>

          <Card
            className="group relative min-h-[122px] cursor-pointer overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-sky-50/40 p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:to-sky-500/10"
            onClick={openCurrentMonthRevenueReport}
          >
            <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-sky-500/80 via-sky-400/70 to-transparent" />
            <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-sky-500/10 blur-2xl" />
            <div className="relative flex h-full flex-col justify-between gap-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{currentMonthLabel}</p>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300">
                  <DollarSign className="h-4 w-4" strokeWidth={1.8} />
                </div>
              </div>
              <div className="space-y-1">
                <p className={DASHBOARD_KPI_VALUE_CLASS}>
                  {formatRevenueAmount(monthRevenueAmount, revenueCurrency)}
                </p>
                <p className="text-xs font-medium text-muted-foreground">Выручка за месяц</p>
              </div>
            </div>
          </Card>

          <Card
            className="group relative min-h-[122px] cursor-pointer overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-primary/5 p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            onClick={openShiftsPlanner}
          >
            <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/90 via-primary/70 to-transparent" />
            <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-primary/10 blur-2xl" />
            <div className="relative flex h-full flex-col justify-between gap-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Активно</p>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                  <Users className="h-4 w-4" strokeWidth={1.8} />
                </div>
              </div>
              <div className="space-y-1">
                <p className={DASHBOARD_KPI_VALUE_CLASS}>{activeIntervalsCount}</p>
                <p className="text-xs font-medium text-primary">На сменах</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button className="flex-1 h-9 text-sm" onClick={() => setTab("shifts")}>
            <Plus className="h-4 w-4 mr-1.5" strokeWidth={1.5} />
            <span className="truncate">Создать смену</span>
          </Button>
          <Button variant="secondary" className="flex-1 h-9 text-sm" onClick={() => setTab("cash")}>
            <span className="truncate">Проверить</span>
          </Button>
        </div>

        {/* Activity Feed */}
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
                const isCashEvent = event.type === "cash"
                const Icon = isCashEvent ? DollarSign : Clock
                return (
                  <Card
                    key={event.id}
                    className="p-3 cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setAccountView("notifications")}
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className={`mt-0.5 h-8 w-8 rounded-full flex items-center justify-center ${
                          isCashEvent ? "bg-amber-500/10 text-amber-700" : "bg-primary/10 text-primary"
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

        {/* Attention */}
        <div className="space-y-3 pt-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-[17px] leading-none font-semibold">На что обратить внимание</h2>
            <span
              className={`text-[11px] font-medium ${
                warningsCount > 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-300"
              }`}
            >
              {warningsCount > 0 ? warningsLabel : "Все настроено"}
            </span>
          </div>

          {isAttentionLoading ? (
            <Card className="p-4 text-sm text-muted-foreground text-center">Проверяем настройки...</Card>
          ) : (
            <div className="space-y-2">
              {attentionItems.map((item) => {
                const Icon =
                  item.key === "cash"
                    ? DollarSign
                    : item.key === "employees"
                      ? Users
                      : item.key === "roles"
                        ? ShieldCheck
                        : Sparkles
                const isWarning = item.status === "warning"
                const cardClassName = isWarning
                  ? "border-destructive/35 bg-destructive/[0.04] hover:bg-destructive/[0.07]"
                  : "border-emerald-500/35 bg-emerald-500/[0.05] hover:bg-emerald-500/[0.09]"
                const iconClassName = isWarning
                  ? "border-destructive/25 bg-destructive/10 text-destructive"
                  : "border-emerald-500/25 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"

                return (
                  <button
                    key={item.key}
                    type="button"
                    className="w-full text-left"
                    onClick={() => {
                      if (item.key === "cash") {
                        openSettingsSection("cash", "open")
                        return
                      }
                      if (item.key === "employees") {
                        openSettingsSection("team")
                        return
                      }
                      if (item.key === "roles") {
                        openSettingsSection("roles")
                        return
                      }
                      openSettingsSection("cash", "formula")
                    }}
                  >
                    <Card className={`p-3 transition-colors ${cardClassName}`}>
                      <div className="flex items-start gap-2.5">
                        <div className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full border ${iconClassName}`}>
                          <Icon className="h-4 w-4" strokeWidth={1.7} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold">{item.title}</p>
                            <div
                              className={`mt-1 h-2.5 w-2.5 rounded-full ${
                                isWarning ? "bg-destructive" : "bg-emerald-500"
                              }`}
                            />
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                          <p className={`mt-1 text-[11px] font-medium ${isWarning ? "text-destructive" : "text-emerald-700 dark:text-emerald-300"}`}>
                            {item.hint}
                          </p>
                        </div>
                        <ChevronRight className="mt-1 h-4 w-4 text-muted-foreground" strokeWidth={1.6} />
                      </div>
                    </Card>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background max-w-md mx-auto pb-20">
      {/* Header */}
      <AppHeader
        title="Crewlly"
        titleAlign="left"
        onBack={onBack}
        showVenueSelector
        selectedVenue={selectedVenueName}
        onVenueChange={() => setIsVenueSelectorOpen(true)}
        onAvatarClick={() => setAccountView("hub")}
        onNotificationClick={() => setAccountView("notifications")}
        unreadCount={unreadNotifications}
        userName={user?.name}
      />

      <AccountHub
        isOpen={accountView === "hub"}
        onClose={() => setAccountView("none")}
        userRole="owner"
        userName={user?.name ?? "Аккаунт"}
        onNavigate={handleAccountNavigation}
      />

      <BottomSheet isOpen={isVenueSelectorOpen} onClose={() => setIsVenueSelectorOpen(false)}>
        <div className="space-y-3">
          <div>
            <h3 className="text-base font-semibold">Выберите заведение</h3>
            <p className="text-xs text-muted-foreground">Переключайтесь между заведениями в один тап</p>
          </div>

          {venues.length === 0 ? (
            <Card className="p-3">
              <p className="text-sm text-muted-foreground">У вас пока нет заведений</p>
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
                      isSelected
                        ? "border-primary/40 bg-primary/10"
                        : "border-border bg-card hover:bg-muted/40"
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
                      {isSelected && <Check className="h-4 w-4 text-primary flex-shrink-0" strokeWidth={1.8} />}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          <Button className="w-full h-10" onClick={handleAddVenue}>
            <Plus className="h-4 w-4 mr-2" strokeWidth={1.5} />
            Добавить заведение
          </Button>
        </div>
      </BottomSheet>

      {/* Content */}
      <div className="min-h-[70vh]">{renderAccountOverlay() || renderContent()}</div>

      {accountView !== "hub" && !isVenueSelectorOpen && <OwnerBottomNav activeTab={activeTab} onTabChange={setTab} />}
    </div>
  )
}
