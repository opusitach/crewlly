"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ShiftsPageSkeleton } from "@/components/ui/page-skeletons"
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
import OwnerBottomNav, { type OwnerBottomNavTab, type OwnerTab } from "@/components/shared/owner-bottom-nav"
import AccountHub from "@/components/account/account-hub"
import OwnerProfile from "@/components/account/owner-profile"
import NotificationsPage from "@/components/account/notifications-page"
import HelpPage from "@/components/account/help-page"
import LanguagePage from "@/components/account/language-page"
import { useTranslation } from "@/lib/i18n/context"
import type { TranslationKey } from "@/lib/i18n/translations"
import TeamMovedHint from "@/components/notifications/team-moved-hint"
import ManagerNextShiftCard from "@/components/manager-next-shift-card"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import type { NotificationNavigationTarget } from "@/lib/notifications/navigation"
import { translateNotificationMessage, translateNotificationText } from "@/lib/notifications/display"
import { useAuthStore } from "@/lib/store/auth-store"
import { useShiftStore } from "@/lib/store/shift-store"

const ShiftsView = dynamic(() => import("@/components/shifts-view"), {
  ssr: false,
  loading: () => <ShiftsPageSkeleton />,
})

const OWNER_TABS: OwnerTab[] = ["dashboard", "shifts", "cash", "reports", "settings"]
const dateInputPattern = /^\d{4}-\d{2}-\d{2}$/
type OwnerTabContextParams = Partial<Record<"cashTab" | "reportsFrom" | "reportsTo" | "shiftsDate", string | null>>
type OwnerTabResetVersion = Record<OwnerTab, number>

const OWNER_TAB_RESET_VERSION_INITIAL: OwnerTabResetVersion = {
  dashboard: 0,
  shifts: 0,
  cash: 0,
  reports: 0,
  settings: 0,
}

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
  descriptionKey: TranslationKey
  count?: number
  status: "ok" | "warning"
}

type VerificationSummaryResponse = {
  data?: {
    totalOnReview?: number
  }
}

type PendingOwnerShiftsNavigation = {
  workDate?: string
  intervalId?: string | null
  preferCanceledInterval?: boolean
  cancelReason?: string
}

type PendingOwnerCashNavigation = {
  tab: "work_shifts" | "cash_sessions" | "review_queue"
  workDate?: string
  selectedShiftId?: string | null
  selectedCashSessionId?: string | null
  returnToEmployeeEarnings?: {
    intervalId: string
    employeeId: string
    fromDate: string
    toDate: string
  } | null
}

type PendingOwnerReportsNavigation = {
  employeeId: string
  employeeFromDate?: string
  employeeToDate?: string
}

type CashSummaryFormulaItem = {
  totalValueCents: number
  isRevenueSource?: boolean
}

type CashSummaryFieldItem = {
  totalValueCents: number
  isRevenueBasis?: boolean
}

type CashSummaryResponse = {
  data?: {
    summary?: {
      currency?: string | null
      revenueTotalCents?: number | null
      formulas?: CashSummaryFormulaItem[]
      cashFields?: CashSummaryFieldItem[]
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

const getCurrentMonthLabel = (locale: string) => capitalize(new Date().toLocaleDateString(locale, { month: "long" }))

// HIG title-2: 22pt, semibold, tight tracking — readable at any viewport width
const DASHBOARD_KPI_VALUE_CLASS =
  "text-title-2 tabular-nums whitespace-nowrap"

const isDateInputValue = (value: string | null | undefined): value is string =>
  typeof value === "string" && dateInputPattern.test(value)

const formatRevenueAmount = (value: number | null, currency: string, locale: string) => {
  if (value == null) return "—"
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value)
  } catch {
    return `${Math.round(value)} ${currency}`
  }
}

const sumCashSummaryTotals = (items: Array<{ totalValueCents: number }>) =>
  items.reduce((acc, item) => {
    const value = Number(item?.totalValueCents)
    return acc + (Number.isFinite(value) ? value : 0)
  }, 0)

const findRevenueWidgetTotalCents = (response: CashSummaryResponse | null) => {
  const summary = response?.data?.summary
  const explicitRevenueTotal = summary?.revenueTotalCents
  const formulas = Array.isArray(summary?.formulas) ? summary.formulas : []
  const revenueFormulas = formulas.filter((formula) => formula?.isRevenueSource === true)
  if (revenueFormulas.length > 0) {
    const fallbackFromFormulas = sumCashSummaryTotals(revenueFormulas)
    if (
      typeof explicitRevenueTotal === "number" &&
      Number.isFinite(explicitRevenueTotal) &&
      (explicitRevenueTotal !== 0 || fallbackFromFormulas === 0)
    ) {
      return explicitRevenueTotal
    }
    return fallbackFromFormulas
  }

  const cashFields = Array.isArray(summary?.cashFields) ? summary.cashFields : []
  const revenueBasisFields = cashFields.filter((field) => field?.isRevenueBasis === true)
  if (revenueBasisFields.length > 0) {
    const fallbackFromFields = sumCashSummaryTotals(revenueBasisFields)
    if (
      typeof explicitRevenueTotal === "number" &&
      Number.isFinite(explicitRevenueTotal) &&
      (explicitRevenueTotal !== 0 || fallbackFromFields === 0)
    ) {
      return explicitRevenueTotal
    }
    return fallbackFromFields
  }

  if (typeof explicitRevenueTotal === "number" && Number.isFinite(explicitRevenueTotal)) {
    return explicitRevenueTotal
  }

  return null
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
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const { t, language } = useTranslation()
  const locale = language === "en" ? "en-US" : "ru-RU"
  const [accountView, setAccountView] = useState<"none" | "hub" | "profile" | "notifications" | "help" | "language">("none")
  const [isVenueSelectorOpen, setIsVenueSelectorOpen] = useState(false)
  const [showTeamHint, setShowTeamHint] = useState(true)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [dashboardEvents, setDashboardEvents] = useState<DashboardNotification[]>([])
  const [isEventsLoading, setIsEventsLoading] = useState(false)
  const [settingsInitialScreen, setSettingsInitialScreen] = useState<SettingsScreen>("home")
  const [settingsInitialCashTab, setSettingsInitialCashTab] = useState<CashSettingsTab>("open")
  const [tabResetVersion, setTabResetVersion] = useState<OwnerTabResetVersion>(OWNER_TAB_RESET_VERSION_INITIAL)
  const [verificationQueueCount, setVerificationQueueCount] = useState(0)
  const [pendingShiftsNavigation, setPendingShiftsNavigation] = useState<PendingOwnerShiftsNavigation | null>(null)
  const [pendingCashNavigation, setPendingCashNavigation] = useState<PendingOwnerCashNavigation | null>(null)
  const [pendingReportsNavigation, setPendingReportsNavigation] = useState<PendingOwnerReportsNavigation | null>(null)
  const [todayRevenueAmount, setTodayRevenueAmount] = useState<number | null>(null)
  const [monthRevenueAmount, setMonthRevenueAmount] = useState<number | null>(null)
  const [revenueCurrency, setRevenueCurrency] = useState<string>("CZK")
  const [isAttentionLoading, setIsAttentionLoading] = useState(false)
  const [attentionItems, setAttentionItems] = useState<AttentionItem[]>([])
  const {
    user,
    organization,
    accessRole,
    legacyRole,
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
  const membershipRoleKey = accessRole?.key ?? legacyRole ?? user?.primaryMode ?? null
  const dashboardUserRole: "owner" | "manager" =
    membershipRoleKey === "manager" ? "manager" : "owner"
  const canCreateVenue = membershipRoleKey === "owner"

  const selectedVenue = useMemo(
    () => venues.find((venue) => venue.id === selectedVenueId) ?? null,
    [venues, selectedVenueId],
  )
  const selectedVenueName = selectedVenue?.name ?? t("owner_venue_label")
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

  // Reset the shared scroll container to the top whenever the rendered content
  // changes (tab switch or account overlay). The container persists across tabs,
  // so without this the scroll position carries over — e.g. tapping a "Needs
  // attention" item while scrolled down would open the target screen scrolled
  // past its header.
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const id = setTimeout(() => el.scrollTo({ top: 0, behavior: "auto" }), 0)
    return () => clearTimeout(id)
  }, [activeTab, accountView])

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

  const updateRouteForTab = (nextTab: OwnerTab, contextParams?: OwnerTabContextParams) => {
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
    setAccountView("none")
    updateRouteForTab(nextTab)
  }

  const bumpTabResetVersion = (tab: OwnerTab) => {
    setTabResetVersion((prev) => ({
      ...prev,
      [tab]: prev[tab] + 1,
    }))
  }

  const scrollTabToTop = () => {
    if (typeof window === "undefined") return
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const getRootContextParams = (tab: OwnerTab): OwnerTabContextParams | undefined => {
    if (tab === "cash") return { cashTab: null }
    if (tab === "reports") return { reportsFrom: null, reportsTo: null }
    if (tab === "shifts") return { shiftsDate: null }
    return undefined
  }

  const handleBottomTabChange = (nextTab: OwnerBottomNavTab) => {
    const isReselect = nextTab === activeTab
    if (!isReselect) {
      setTab(nextTab)
      return
    }

    setAccountView("none")
    updateRouteForTab(nextTab, getRootContextParams(nextTab))
    bumpTabResetVersion(nextTab)
    scrollTabToTop()
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
      const monthEnd = toDateInputValue(new Date(now.getFullYear(), now.getMonth() + 1, 0))
      const locationQuery = attentionLocationId ? `&locationId=${encodeURIComponent(attentionLocationId)}` : ""

      try {
        const [todayRes, monthRes] = await Promise.all([
          fetch(`/api/reports/cash-summary?dateFrom=${todayDate}&dateTo=${todayDate}${locationQuery}`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/reports/cash-summary?dateFrom=${monthStart}&dateTo=${monthEnd}${locationQuery}`, {
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
        setTodayRevenueAmount(findRevenueWidgetTotalCents(todayJson))
        setMonthRevenueAmount(findRevenueWidgetTotalCents(monthJson))
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
  }, [activeTab, isAuthLoading, isAuthenticated, attentionLocationId])

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
            status: cashConfigured ? "ok" : "warning",
            descriptionKey: cashConfigured ? "owner_cash_ok" : "owner_cash_empty",
          },
          {
            key: "employees",
            status: employeesWithoutSalary.length > 0 ? "warning" : "ok",
            descriptionKey:
              employeesWithoutSalary.length > 0
                ? "owner_employees_without_salary"
                : employees.length > 0
                  ? "owner_all_employees_salary"
                  : "owner_no_employees",
            count: employeesWithoutSalary.length,
          },
          {
            key: "roles",
            status: positions.length === 0 || positionsWithoutRules.length > 0 ? "warning" : "ok",
            descriptionKey:
              positions.length === 0
                ? "owner_no_roles"
                : positionsWithoutRules.length > 0
                  ? "owner_roles_missing"
                  : "owner_roles_ok",
            count: positionsWithoutRules.length,
          },
          {
            key: "tips",
            status: tipsFormulaConfigured ? "ok" : "warning",
            descriptionKey: tipsFormulaConfigured ? "owner_tips_ok" : "owner_tips_empty",
          },
        ]

        if (!active) return
        setAttentionItems(nextAttentionItems)
      } catch {
        if (!active) return
        setAttentionItems([
          {
            key: "cash",
            descriptionKey: "owner_checklist_error_cash",
            status: "warning",
          },
          {
            key: "employees",
            descriptionKey: "owner_checklist_error_employees",
            status: "warning",
          },
          {
            key: "roles",
            descriptionKey: "owner_checklist_error_cash",
            status: "warning",
          },
          {
            key: "tips",
            descriptionKey: "owner_checklist_error_cash",
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
    return date.toLocaleString(locale, {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const visibleDashboardEvents = dashboardEvents.slice(0, 3)
  const hasMoreDashboardEvents = dashboardEvents.length > 3
  const warningsCount = attentionItems.filter((item) => item.status === "warning").length
  const warningsLabel =
    warningsCount === 1 ? t("owner_attention_warning_one") : t("owner_attention_warning_many", { count: warningsCount })
  const currentMonthLabel = getCurrentMonthLabel(locale)

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

  const formatEmployeesLabel = (count: number) => {
    const mod10 = count % 10
    const mod100 = count % 100
    if (mod10 === 1 && mod100 !== 11) return t("owner_employees_label_one")
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return t("owner_employees_label_few")
    return t("owner_employees_label_many")
  }

  const getAttentionTitle = (key: AttentionItemKey) => {
    if (key === "cash") return t("owner_checklist_cash_title")
    if (key === "employees") return t("owner_checklist_employees_title")
    if (key === "roles") return t("owner_checklist_roles_title")
    return t("owner_checklist_tips_title")
  }

  const getAttentionHint = (key: AttentionItemKey) => {
    if (key === "cash") return t("owner_checklist_cash_hint")
    if (key === "employees") return t("owner_checklist_employees_hint")
    if (key === "roles") return t("owner_checklist_roles_hint")
    return t("owner_checklist_tips_hint")
  }

  const getAttentionDescription = (item: AttentionItem) => {
    if (item.descriptionKey === "owner_employees_without_salary") {
      const count = item.count ?? 0
      return t(item.descriptionKey, { count, label: formatEmployeesLabel(count) })
    }
    if (item.descriptionKey === "owner_roles_missing") {
      return t(item.descriptionKey, { count: item.count ?? 0 })
    }
    return t(item.descriptionKey)
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
    } else if (screen === "help") {
      setTimeout(() => setAccountView("help"), 100)
    } else if (screen === "language") {
      setTimeout(() => setAccountView("language"), 100)
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
      router.refresh()
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
    if (!canCreateVenue) {
      setIsVenueSelectorOpen(false)
      return
    }
    setIsVenueSelectorOpen(false)
    setAccountView("none")
    router.push("/app/venues/new")
  }

  const handleLogout = () => {
    void logout()
    setAccountView("none")
    onBack?.()
  }

  const handleNotificationNavigation = (target: NotificationNavigationTarget) => {
    setAccountView("none")

    if (target.view === "owner_shifts") {
      setPendingCashNavigation(null)
      setPendingShiftsNavigation({
        workDate: target.workDate,
        intervalId: target.intervalId ?? null,
        preferCanceledInterval: target.preferCanceledInterval,
        cancelReason: target.cancelReason,
      })
      updateRouteForTab("shifts", { shiftsDate: target.workDate ?? null })
      return
    }

    if (target.view === "owner_cash") {
      setPendingShiftsNavigation(null)
      setPendingCashNavigation({
        tab: target.cashTab,
        workDate: target.workDate,
        selectedShiftId: target.intervalId ?? null,
        selectedCashSessionId: target.cashSessionId ?? null,
      })
      updateRouteForTab("cash", { cashTab: target.cashTab === "review_queue" ? "review_queue" : null })
    }
  }

  const handleEmployeeEarningNavigation = (target: {
    intervalId: string
    workDate: string
    employeeId: string
    fromDate: string
    toDate: string
  }) => {
    setAccountView("none")
    setPendingShiftsNavigation(null)
    setPendingCashNavigation({
      tab: "work_shifts",
      workDate: target.workDate,
      selectedShiftId: target.intervalId,
      selectedCashSessionId: null,
      returnToEmployeeEarnings: {
        intervalId: target.intervalId,
        employeeId: target.employeeId,
        fromDate: target.fromDate,
        toDate: target.toDate,
      },
    })
    updateRouteForTab("cash", { cashTab: null })
  }

  const handleCashShiftBackToEmployeeEarnings = (target: { employeeId: string; fromDate: string; toDate: string }) => {
    setAccountView("none")
    setPendingShiftsNavigation(null)
    setPendingCashNavigation(null)
    setPendingReportsNavigation({
      employeeId: target.employeeId,
      employeeFromDate: target.fromDate,
      employeeToDate: target.toDate,
    })
    updateRouteForTab("reports", { reportsFrom: target.fromDate, reportsTo: target.toDate })
  }

  const renderAccountOverlay = () => {
    if (accountView === "profile") {
      return (
        <OwnerProfile
          onBack={() => setAccountView("none")}
          onLogout={handleLogout}
          userRole={dashboardUserRole}
          canCreateVenue={canCreateVenue}
        />
      )
    }
    if (accountView === "help") {
      return <HelpPage onBack={() => setAccountView("none")} userRole={dashboardUserRole} />
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
    return null
  }

  const renderContent = () => {
    if (activeTab === "shifts")
      return (
        <ShiftsView
          key={`owner-shifts-${tabResetVersion.shifts}`}
          onBack={() => setTab("dashboard")}
          initialDate={pendingShiftsNavigation?.workDate ?? initialShiftsDate}
          initialSelectedIntervalId={pendingShiftsNavigation?.intervalId ?? null}
          initialPreferCanceledInterval={pendingShiftsNavigation?.preferCanceledInterval ?? false}
          initialCancelReason={pendingShiftsNavigation?.cancelReason}
          onInitialNavigationHandled={() => setPendingShiftsNavigation(null)}
          externalHeader
        />
      )
    if (activeTab === "cash")
      return (
        <CashRegisterVerificationView
          key={`owner-cash-${tabResetVersion.cash}`}
          onBack={() => setTab("dashboard")}
          initialTab={pendingCashNavigation?.tab ?? initialCashTab}
          initialDate={pendingCashNavigation?.workDate}
          initialSelectedShiftId={pendingCashNavigation?.selectedShiftId ?? null}
          initialSelectedCashSessionId={pendingCashNavigation?.selectedCashSessionId ?? null}
          initialShiftBackNavigation={pendingCashNavigation?.returnToEmployeeEarnings ?? null}
          onShiftBackNavigateToEmployeeEarnings={handleCashShiftBackToEmployeeEarnings}
          onInitialNavigationHandled={() => setPendingCashNavigation(null)}
        />
      )
    if (activeTab === "reports")
      return (
        <ReportsView
          key={`owner-reports-${tabResetVersion.reports}`}
          initialFromDate={initialReportsFromDate}
          initialToDate={initialReportsToDate}
          initialSelectedEmployeeId={pendingReportsNavigation?.employeeId ?? null}
          initialEmployeeFromDate={pendingReportsNavigation?.employeeFromDate}
          initialEmployeeToDate={pendingReportsNavigation?.employeeToDate}
          onInitialEmployeeNavigationHandled={() => setPendingReportsNavigation(null)}
          onEmployeeEarningSelect={handleEmployeeEarningNavigation}
        />
      )
    if (activeTab === "settings") {
      return (
        <GlobalSettingsView
          key={`owner-settings-${tabResetVersion.settings}`}
          onBack={() => setTab("dashboard")}
          initialScreen={settingsInitialScreen}
          initialCashTab={settingsInitialCashTab}
          cashLocationId={attentionLocationId}
        />
      )
    }
    return (
      <div key={`owner-dashboard-${tabResetVersion.dashboard}`} className="p-3 space-y-3">
        {showTeamHint && <TeamMovedHint />}

        {dashboardUserRole === "manager" && (
          <ManagerNextShiftCard
            organizationId={selectedVenueId ?? organization?.id ?? null}
            timeZone={selectedVenue?.timezone ?? organization?.timezone ?? null}
          />
        )}

        {/* KPI Cards — HIG Inset style: clean card, single accent bar, no blur-glow */}
        <div className="grid grid-cols-2 gap-3">
          {/* Pending review */}
          <button
            type="button"
            onClick={openReviewQueue}
            className="group flex flex-col gap-3 rounded-xl bg-card border border-border p-4 shadow-elev-1 text-left transition-all duration-150 active:scale-[0.97] hover:shadow-elev-2 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-warning-bg text-warning-text">
                <Clock className="h-4.5 w-4.5" strokeWidth={2} />
              </div>
              <span className="text-caption-2 font-semibold uppercase tracking-wider text-muted-foreground">
                {t("owner_kpi_pending_review")}
              </span>
            </div>
            <div className="space-y-0.5">
              <p className={DASHBOARD_KPI_VALUE_CLASS}>{verificationQueueCount}</p>
              <p className="text-footnote text-warning-text font-medium">{t("owner_kpi_needs_attention")}</p>
            </div>
          </button>

          {/* Today revenue */}
          <button
            type="button"
            onClick={openTodayRevenueReport}
            className="group flex flex-col gap-3 rounded-xl bg-card border border-border p-4 shadow-elev-1 text-left transition-all duration-150 active:scale-[0.97] hover:shadow-elev-2 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-success-bg text-success-text">
                <TrendingUp className="h-4.5 w-4.5" strokeWidth={2} />
              </div>
              <span className="text-caption-2 font-semibold uppercase tracking-wider text-muted-foreground">
                {t("owner_kpi_today")}
              </span>
            </div>
            <div className="space-y-0.5">
              <p className={DASHBOARD_KPI_VALUE_CLASS}>
                {formatRevenueAmount(todayRevenueAmount, revenueCurrency, locale)}
              </p>
              <p className="text-footnote text-muted-foreground font-medium">{t("owner_kpi_revenue")}</p>
            </div>
          </button>

          {/* Month revenue */}
          <button
            type="button"
            onClick={openCurrentMonthRevenueReport}
            className="group flex flex-col gap-3 rounded-xl bg-card border border-border p-4 shadow-elev-1 text-left transition-all duration-150 active:scale-[0.97] hover:shadow-elev-2 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-info-bg text-info-text">
                <DollarSign className="h-4.5 w-4.5" strokeWidth={2} />
              </div>
              <span className="text-caption-2 font-semibold uppercase tracking-wider text-muted-foreground">{currentMonthLabel}</span>
            </div>
            <div className="space-y-0.5">
              <p className={DASHBOARD_KPI_VALUE_CLASS}>
                {formatRevenueAmount(monthRevenueAmount, revenueCurrency, locale)}
              </p>
              <p className="text-footnote text-muted-foreground font-medium">{t("owner_kpi_month_revenue")}</p>
            </div>
          </button>

          {/* Active shifts */}
          <button
            type="button"
            onClick={openShiftsPlanner}
            className="group flex flex-col gap-3 rounded-xl bg-card border border-border p-4 shadow-elev-1 text-left transition-all duration-150 active:scale-[0.97] hover:shadow-elev-2 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary-text">
                <Users className="h-4.5 w-4.5" strokeWidth={2} />
              </div>
              <span className="text-caption-2 font-semibold uppercase tracking-wider text-muted-foreground">
                {t("owner_kpi_active")}
              </span>
            </div>
            <div className="space-y-0.5">
              <p className={DASHBOARD_KPI_VALUE_CLASS}>{activeIntervalsCount}</p>
              <p className="text-footnote text-primary-text font-medium">{t("owner_kpi_on_shifts")}</p>
            </div>
          </button>
        </div>

        {/* Action Buttons — HIG 44pt */}
        <div className="flex gap-2.5">
          <Button className="flex-1" onClick={() => setTab("shifts")}>
            <Plus className="h-4 w-4" strokeWidth={2} />
            <span className="truncate">{t("owner_action_create_shift")}</span>
          </Button>
          <Button variant="tinted" className="flex-1" onClick={() => setTab("cash")}>
            <span className="truncate">{t("owner_action_review")}</span>
          </Button>
        </div>
        {/* Activity Feed */}
        <div className="space-y-3 pt-1">
          <h2 className="text-headline">{t("owner_events_title")}</h2>
          {isEventsLoading ? (
            <div className="rounded-xl bg-card border border-border divide-y divide-separator overflow-hidden">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 p-4 animate-pulse">
                  <div className="h-9 w-9 rounded-full bg-fill-3 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-3/5 rounded bg-fill-3" />
                    <div className="h-3 w-4/5 rounded bg-fill-4" />
                  </div>
                </div>
              ))}
            </div>
          ) : dashboardEvents.length === 0 ? (
            <div className="rounded-xl bg-card border border-border p-8 flex flex-col items-center gap-3 text-center">
              <div className="h-12 w-12 rounded-full bg-fill-3 flex items-center justify-center text-muted-foreground">
                <Sparkles className="h-6 w-6" strokeWidth={1.5} />
              </div>
              <div className="space-y-1">
                <p className="text-subheadline font-semibold">{t("owner_events_empty_title")}</p>
                <p className="text-footnote text-muted-foreground">{t("owner_events_empty_desc")}</p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-card border border-border divide-y divide-separator overflow-hidden">
              {visibleDashboardEvents.map((event) => {
                const isCashEvent = event.type === "cash"
                const Icon = isCashEvent ? DollarSign : Clock
                return (
                  <button
                    key={event.id}
                    type="button"
                    className="w-full flex items-start gap-3 p-4 text-left transition-colors hover:bg-fill-4 active:bg-fill-3 focus-visible:outline-none focus-visible:bg-fill-3"
                    onClick={() => setAccountView("notifications")}
                  >
                    <div
                      className={`mt-0.5 h-9 w-9 rounded-full flex-shrink-0 flex items-center justify-center ${
                        isCashEvent ? "bg-warning-bg text-warning-text" : "bg-primary/10 text-primary-text"
                      }`}
                    >
                      <Icon className="h-4 w-4" strokeWidth={1.8} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-callout font-semibold truncate">
                          {translateNotificationText(event.title, language)}
                        </p>
                        {event.status === "unread" && (
                          <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1.5" aria-label={t("notification_unread")} />
                        )}
                      </div>
                      <p className="text-footnote text-muted-foreground line-clamp-2 mt-0.5">
                        {translateNotificationMessage(event.message, event.title, language)}
                      </p>
                      <p className="text-caption-1 text-text-tertiary mt-1.5">{formatEventTimestamp(event.createdAt)}</p>
                    </div>
                  </button>
                )
              })}

              {hasMoreDashboardEvents && (
                <button
                  type="button"
                  className="w-full flex items-center justify-center gap-1 p-4 text-callout font-medium text-primary-text transition-colors hover:bg-fill-4 active:bg-fill-3"
                  onClick={() => setAccountView("notifications")}
                >
                  {t("owner_events_show_all")}
                  <ChevronRight className="h-4 w-4" strokeWidth={2} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Attention — HIG Inset Grouped List */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <h2 className="text-headline">{t("owner_attention_title")}</h2>
            <span
              className={`text-footnote font-semibold ${
                warningsCount > 0 ? "text-destructive-text" : "text-success-text"
              }`}
            >
              {warningsCount > 0 ? warningsLabel : t("owner_attention_all_set")}
            </span>
          </div>

          {isAttentionLoading ? (
            <div className="rounded-xl bg-card border border-border divide-y divide-separator overflow-hidden">
              {[1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 p-4 animate-pulse">
                  <div className="h-9 w-9 rounded-full bg-fill-3 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-2/5 rounded bg-fill-3" />
                    <div className="h-3 w-3/5 rounded bg-fill-4" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl bg-card border border-border divide-y divide-separator overflow-hidden">
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

                return (
                  <button
                    key={item.key}
                    type="button"
                    className="w-full flex items-center gap-3 p-4 text-left transition-colors hover:bg-fill-4 active:bg-fill-3 focus-visible:outline-none focus-visible:bg-fill-3"
                    onClick={() => {
                      if (item.key === "cash") { openSettingsSection("cash", "open"); return }
                      if (item.key === "employees") { openSettingsSection("team"); return }
                      if (item.key === "roles") { openSettingsSection("roles"); return }
                      openSettingsSection("cash", "formula")
                    }}
                  >
                    <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${
                      isWarning ? "bg-destructive-bg text-destructive-text" : "bg-success-bg text-success-text"
                    }`}>
                      <Icon className="h-4.5 w-4.5" strokeWidth={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-callout font-semibold">{getAttentionTitle(item.key)}</p>
                      <p className="text-footnote text-muted-foreground line-clamp-1 mt-0.5">
                        {getAttentionDescription(item)}
                      </p>
                      <p className={`text-caption-1 font-medium mt-0.5 ${isWarning ? "text-destructive-text" : "text-success-text"}`}>
                        {getAttentionHint(item.key)}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" strokeWidth={2} />
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
    <div className="h-[100dvh] flex flex-col bg-background max-w-md mx-auto">
      <AppHeader
        title="Crewlly"
        showLogo
        titleHref="/"
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
        userRole={dashboardUserRole}
        userName={user?.name ?? t("hub_profile")}
        onNavigate={handleAccountNavigation}
      />

      <BottomSheet isOpen={isVenueSelectorOpen} onClose={() => setIsVenueSelectorOpen(false)} showCloseButton>
        <div className="space-y-3">
          <div>
            <h3 className="text-base font-semibold">{t("owner_select_venue_title")}</h3>
            <p className="text-xs text-muted-foreground">{t("owner_select_venue_desc")}</p>
          </div>

          {venues.length === 0 ? (
            <Card className="p-3">
              <p className="text-sm text-muted-foreground">{t("owner_no_venues")}</p>
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
                          {venue.locations?.[0]?.name ?? t("dash_no_location")}
                        </p>
                      </div>
                      {isSelected && <Check className="h-4 w-4 text-primary flex-shrink-0" strokeWidth={1.8} />}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {canCreateVenue && (
            <Button className="w-full h-10" onClick={handleAddVenue}>
              <Plus className="h-4 w-4 mr-2" strokeWidth={1.5} />
              {t("owner_add_venue")}
            </Button>
          )}
        </div>
      </BottomSheet>

      {/* Scrollable content — inner sticky headers stick within this container */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto scrollbar-hidden"
        style={{
          paddingBottom: activeTab === "shifts" ? "0" : "96px",
        }}
      >
        {renderAccountOverlay() || renderContent()}
      </div>

      {accountView !== "hub" && accountView !== "language" && !isVenueSelectorOpen && (
        <OwnerBottomNav activeTab={activeTab} onTabChange={handleBottomTabChange} />
      )}
    </div>
  )
}
