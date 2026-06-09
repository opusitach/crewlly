"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react"
import { flushSync } from "react-dom"
import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  isValid,
  isSameDay,
  isSameMonth,
  startOfMonth,
  subMonths,
  type Locale,
} from "date-fns"
import { enUS, ru } from "date-fns/locale"
import { ArrowLeft, Calculator, ChevronLeft, Plus, RotateCcw, SlidersHorizontal, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Input } from "@/components/ui/input"
import { TimePicker24h } from "@/components/ui/time-picker-24h"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ImagePreview } from "@/components/ui/image-preview"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { type GlassCalendarDay, type GlassCalendarView } from "@/components/ui/glass-calendar"
import { ScheduleCalendar } from "@/components/ui/schedule-calendar"
import { useToast } from "@/hooks/use-toast"
import { useAuthStore } from "@/lib/store/auth-store"
import { useShiftStore } from "@/lib/store/shift-store"
import { TIME_VALUE_PATTERN } from "@/lib/utils/time-utils"
import { cn } from "@/lib/utils"
import { formatDate, getMonthCalendarDays, getWeekDays, parseDate } from "@/lib/utils/date-utils"
import { formatTimeValue } from "@/lib/utils/timezone"
import type { IntervalConflict, WorkInterval } from "@/lib/types/shift"
import { decodeCashProcedureValues } from "@/lib/cash/procedure-values"
import { useTranslation } from "@/lib/i18n/context"
import type { TranslationKey } from "@/lib/i18n/translations"

const WEEK_DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
const INTERVAL_OVERLAP_ERROR_CODE = "INTERVAL_OVERLAP"
const INTERVAL_IN_PAST_ERROR_CODE = "INTERVAL_IN_PAST"
const STATUS_SYNC_INTERVAL_MS = 3000

const capitalizeLabel = (value: string) => (value.length > 0 ? value.charAt(0).toUpperCase() + value.slice(1) : value)

const formatShiftWord = (count: number, t: (key: TranslationKey) => string) => {
  const mod10 = count % 10
  const mod100 = count % 100

  if (mod10 === 1 && mod100 !== 11) return t("shift_one")
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return t("shift_few")
  return t("shift_many")
}

const STATUS_STYLES = {
  scheduled:   "bg-status-scheduled   text-status-scheduled-fg   border-0",
  in_progress: "bg-status-in-progress text-status-in-progress-fg border-0",
  completed:   "bg-status-completed   text-status-completed-fg   border-0",
  canceled:    "bg-status-canceled    text-status-canceled-fg    border-0",
  conflict:    "bg-status-conflict    text-status-conflict-fg    border-0",
}

type IntervalUiStatus = {
  key: "scheduled" | "in_progress" | "completed" | "canceled" | "conflict"
  label: string
  className: string
}

type ProcedureRuleView = {
  id: string
  title: string
  type: "CHECKLIST" | "INPUT" | "PHOTO" | "CASH"
  required: boolean
  cashFields?: Array<{ key: string; label: string; isRequired: boolean; isPhotoRequired?: boolean }>
  checklistItems: { id: string; title: string }[]
  answer: {
    inputValue?: string | null
    photoUrl?: string | null
    photoS3Key?: string | null
    cashPhotos?: Record<string, { photoS3Key: string | null; photoUrl: string | null }>
    photoComment?: string | null
    photoDeletedAt?: string | null
    checklistItems?: { itemId: string; isChecked: boolean }[]
  } | null
}

type ProcedureView = {
  when: "OPEN" | "CLOSE"
  rules: ProcedureRuleView[]
}

type CashFormulaCalculationItem = {
  resultKey: string
  resultLabel: string
  valueCents: number | null
  isTipsSource: boolean
  displayOrder: number
}

type CashFormulaCalculations = {
  items: CashFormulaCalculationItem[]
  hasCashInput: boolean
  currency: string | null
  error: string | null
}

type ProcedureDetails = {
  open?: ProcedureView
  close?: ProcedureView
  formulaCalculations?: CashFormulaCalculations | null
}

function resolveTime(value: string | undefined, timeZone?: string | null) {
  return formatTimeValue(value, timeZone, "--:--")
}

const integerTokenRegex = /^-?\d+$/

const formatIntegerToken = (value: string) => {
  const trimmed = value.trim()
  if (!integerTokenRegex.test(trimmed)) return value
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return value
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(parsed)
}

const formatMoneyCents = (valueCents: number, currency = "CZK") => {
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(valueCents / 100)
  } catch {
    return `${Math.round(valueCents / 100)} ${currency}`
  }
}

const normalizeFormulaCalculations = (raw: unknown): CashFormulaCalculations | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>

  const rawItems = Array.isArray(record.items) ? record.items : []
  const items = rawItems
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null
      const row = item as Record<string, unknown>
      const resultKey = typeof row.resultKey === "string" ? row.resultKey : ""
      if (!resultKey) return null
      const resultLabel = typeof row.resultLabel === "string" && row.resultLabel.trim().length > 0 ? row.resultLabel : resultKey
      const rawValueCents = row.valueCents
      const valueCents =
        typeof rawValueCents === "number" && Number.isFinite(rawValueCents) ? Math.round(rawValueCents) : null
      const rawDisplayOrder = row.displayOrder
      const displayOrder =
        typeof rawDisplayOrder === "number" && Number.isFinite(rawDisplayOrder) ? Math.trunc(rawDisplayOrder) : 0

      return {
        resultKey,
        resultLabel,
        valueCents,
        isTipsSource: row.isTipsSource === true,
        displayOrder,
      } satisfies CashFormulaCalculationItem
    })
    .filter((item): item is CashFormulaCalculationItem => item !== null)
    .sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder
      return a.resultKey.localeCompare(b.resultKey)
    })

  const error = typeof record.error === "string" && record.error.trim().length > 0 ? record.error : null
  return {
    items,
    hasCashInput: record.hasCashInput === true,
    currency: typeof record.currency === "string" ? record.currency : null,
    error,
  }
}

const STATUS_FILTERS: { key: IntervalUiStatus["key"]; labelKey: TranslationKey }[] = [
  { key: "scheduled", labelKey: "dash_shift_status_planned" },
  { key: "in_progress", labelKey: "dash_shift_status_active" },
  { key: "completed", labelKey: "dash_shift_status_done" },
  { key: "canceled", labelKey: "dash_shift_status_cancelled" },
  { key: "conflict", labelKey: "dash_shift_status_conflict" },
]

const CUSTOM_PAY_OPTIONS = [
  { key: "hourly", labelKey: "planner_pay_hourly", placeholder: "180" },
  { key: "fixed_shift", labelKey: "planner_pay_fixed", placeholder: "2500" },
  { key: "percent_revenue", labelKey: "planner_pay_percent", placeholder: "3" },
] as const

type CustomPayKey = (typeof CUSTOM_PAY_OPTIONS)[number]["key"]

const parseNumericInput = (value: string): number | null => {
  const raw = value.trim()
  if (!raw) return null
  const parsed = Number.parseFloat(raw.replace(",", "."))
  return Number.isNaN(parsed) ? null : parsed
}

const toCents = (value: string): number | null => {
  const parsed = parseNumericInput(value)
  if (parsed === null) return null
  return Math.round(parsed * 100)
}

const toBasisPoints = (value: string): number | null => {
  const parsed = parseNumericInput(value)
  if (parsed === null) return null
  return Math.round(parsed * 100)
}

type WorkIntervalFormValues = {
  employeeId: string
  positionId?: string
  startTime: string
  endTime: string
  breakMinutes: number
  notes?: string
  useStandardPay: boolean
  customPayTypes: CustomPayKey[]
  customPayValues: {
    hourly: string
    fixed_shift: string
    percent_revenue: string
  }
}

const DEFAULT_FORM_VALUES: WorkIntervalFormValues = {
  employeeId: "",
  positionId: undefined,
  startTime: "09:00",
  endTime: "18:00",
  breakMinutes: 0,
  notes: "",
  useStandardPay: true,
  customPayTypes: [],
  customPayValues: {
    hourly: "",
    fixed_shift: "",
    percent_revenue: "",
  },
}

const FORM_SECTION_CLASS =
  "rounded-[24px] border border-white/30 bg-gradient-to-br from-white/[0.24] via-white/[0.16] to-white/[0.08] p-4 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.55)] backdrop-blur-md"
const DETAIL_SECTION_CLASS =
  "rounded-[20px] border border-white/24 bg-gradient-to-br from-white/[0.22] via-white/[0.14] to-white/[0.08] p-3.5 shadow-[0_14px_34px_-26px_rgba(15,23,42,0.6)] backdrop-blur-md"
const READONLY_FIELD_CLASS =
  "rounded-[16px] border border-white/70 bg-white/94 px-3 py-2.5 shadow-sm"

type ShiftsViewProps = {
  onBack: () => void
  readOnly?: boolean
  hideFilters?: boolean
  lockedEmployeeId?: string
  initialDate?: string
  initialSelectedIntervalId?: string | null
  initialPreferCanceledInterval?: boolean
  initialCancelReason?: string
  initialOpenWeekView?: boolean
  onInitialNavigationHandled?: () => void
  externalHeader?: boolean
}

const dateInputPattern = /^\d{4}-\d{2}-\d{2}$/

const resolvePlannerDate = (value?: string) => {
  if (value && dateInputPattern.test(value)) {
    const parsed = parseDate(value)
    if (isValid(parsed)) return parsed
  }
  return new Date()
}

const resolveIntervalStartForDate = (dateValue: string, timeValue: string) => {
  const parsedDate = parseDate(dateValue)
  if (!isValid(parsedDate)) return null

  const match = TIME_VALUE_PATTERN.exec(timeValue)
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  parsedDate.setHours(hours, minutes, 0, 0)
  return parsedDate
}

const isIntervalStartInPast = (dateValue: string, timeValue: string, now = new Date()) => {
  const startAt = resolveIntervalStartForDate(dateValue, timeValue)
  if (!startAt) return false
  return startAt.getTime() < now.getTime()
}

const formatShiftDateForToast = (dateValue: string, dateLocale: Locale) => {
  const parsedDate = parseDate(dateValue)
  if (!isValid(parsedDate)) return dateValue
  return format(parsedDate, "d MMMM yyyy", { locale: dateLocale })
}

const normalizeCancelReason = (value?: string | null) => value?.trim().replace(/\s+/gu, " ") ?? ""

export default function ShiftsView({
  onBack,
  readOnly = false,
  hideFilters = false,
  lockedEmployeeId,
  initialDate,
  initialSelectedIntervalId,
  initialPreferCanceledInterval = false,
  initialCancelReason,
  initialOpenWeekView = false,
  onInitialNavigationHandled,
  externalHeader = false,
}: ShiftsViewProps) {
  const { toast } = useToast()
  const { t, language } = useTranslation()
  const dateLocale = language === "en" ? enUS : ru
  const weekdayLabels = language === "en" ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : WEEK_DAYS
  const organizationTimeZone = useAuthStore((state) => state.organization?.timezone)
  const {
    workdays,
    intervals,
    employees,
    positions,
    refreshWorkdays,
    getOrCreateWorkday,
    createInterval,
    updateInterval,
    deleteInterval,
    selectedLocationId,
  } = useShiftStore()

  const [displayDate, setDisplayDate] = useState(() => resolvePlannerDate(initialDate))
  const [selectedDate, setSelectedDate] = useState(() => resolvePlannerDate(initialDate))
  const [panelExpanded, setPanelExpanded] = useState(false)
  const [panelView, setPanelView] = useState<"list" | "details" | "form">("list")
  const [panelReturnView, setPanelReturnView] = useState<"list" | "details">("list")
  const monthViewRef = useRef<HTMLDivElement | null>(null)
  const weekViewRef = useRef<HTMLDivElement | null>(null)
  const panelContainerRef = useRef<HTMLDivElement | null>(null)
  const [monthViewHeight, setMonthViewHeight] = useState<number | null>(null)
  const [weekViewHeight, setWeekViewHeight] = useState<number | null>(null)
  const [calendarTopOffset, setCalendarTopOffset] = useState<number | null>(null)
  const [panelTransitionsEnabled, setPanelTransitionsEnabled] = useState(false)
  const [isBulkMode, setIsBulkMode] = useState(false)
  const [bulkSelectedDates, setBulkSelectedDates] = useState<string[]>([])
  const [bulkCreateDates, setBulkCreateDates] = useState<string[]>([])
  const [isSavingInterval, setIsSavingInterval] = useState(false)
  const saveIntervalInFlightRef = useRef(false)

  const [editingInterval, setEditingInterval] = useState<WorkInterval | null>(null)
  const [selectedInterval, setSelectedInterval] = useState<WorkInterval | null>(null)
  const [procedureDetails, setProcedureDetails] = useState<ProcedureDetails | null>(null)
  const [isProcedureLoading, setIsProcedureLoading] = useState(false)
  const [overlapDialog, setOverlapDialog] = useState<{
    open: boolean
    conflicts: IntervalConflict[]
  }>({
    open: false,
    conflicts: [],
  })
  const [formValues, setFormValues] = useState<WorkIntervalFormValues>(DEFAULT_FORM_VALUES)
  const [formViewKey, setFormViewKey] = useState(0)
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>(
    lockedEmployeeId ? [lockedEmployeeId] : [],
  )
  const [selectedPositionIds, setSelectedPositionIds] = useState<string[]>([])
  const [selectedStatusKeys, setSelectedStatusKeys] = useState<IntervalUiStatus["key"][]>([])
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)
  const filtersHidden = hideFilters
  const autoRefreshInFlightRef = useRef(false)
  const versionSyncInFlightRef = useRef(false)
  const plannerVersionRef = useRef<string | null>(null)
  const safeDisplayDate = useMemo(
    () => (isValid(displayDate) ? displayDate : new Date()),
    [displayDate],
  )
  const safeSelectedDate = useMemo(
    () => (isValid(selectedDate) ? selectedDate : new Date()),
    [selectedDate],
  )

  useEffect(() => {
    if (!initialDate || !dateInputPattern.test(initialDate)) return
    const nextDate = resolvePlannerDate(initialDate)
    setDisplayDate(nextDate)
    setSelectedDate(nextDate)
  }, [initialDate])

  const refreshRange = useMemo(() => {
    const start = startOfMonth(subMonths(safeDisplayDate, 1))
    const end = endOfMonth(addMonths(safeDisplayDate, 1))
    return {
      dateFrom: format(start, "yyyy-MM-dd"),
      dateTo: format(end, "yyyy-MM-dd"),
    }
  }, [safeDisplayDate])

  const refreshVisibleRange = useMemo(
    () => async () => {
      if (autoRefreshInFlightRef.current) return
      autoRefreshInFlightRef.current = true
      try {
        await refreshWorkdays(refreshRange.dateFrom, refreshRange.dateTo)
      } finally {
        autoRefreshInFlightRef.current = false
      }
    },
    [refreshRange.dateFrom, refreshRange.dateTo, refreshWorkdays],
  )

  useEffect(() => {
    void refreshVisibleRange()
  }, [refreshVisibleRange])

  useEffect(() => {
    plannerVersionRef.current = null
  }, [refreshRange.dateFrom, refreshRange.dateTo, selectedLocationId])

  const syncPlannerVersion = useMemo(
    () => async () => {
      if (versionSyncInFlightRef.current) return
      versionSyncInFlightRef.current = true
      try {
        const params = new URLSearchParams({
          dateFrom: refreshRange.dateFrom,
          dateTo: refreshRange.dateTo,
        })
        if (selectedLocationId) {
          params.set("locationId", selectedLocationId)
        }

        const res = await fetch(`/api/workdays/version?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
        })
        if (!res.ok) return

        const json = await res.json().catch(() => null)
        const nextSignature = typeof json?.data?.signature === "string" ? json.data.signature : null
        if (!nextSignature) return

        const previousSignature = plannerVersionRef.current
        if (previousSignature == null) {
          plannerVersionRef.current = nextSignature
          return
        }
        if (previousSignature === nextSignature) return

        await refreshVisibleRange()
        plannerVersionRef.current = nextSignature
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.debug("Failed to sync planner version", error)
        }
      } finally {
        versionSyncInFlightRef.current = false
      }
    },
    [refreshRange.dateFrom, refreshRange.dateTo, refreshVisibleRange, selectedLocationId],
  )

  useEffect(() => {
    const syncIfVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return
      if (typeof navigator !== "undefined" && !navigator.onLine) return
      void syncPlannerVersion()
    }

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        syncIfVisible()
      }
    }

    syncIfVisible()
    const intervalId = window.setInterval(syncIfVisible, STATUS_SYNC_INTERVAL_MS)
    window.addEventListener("focus", syncIfVisible)
    window.addEventListener("online", syncIfVisible)
    document.addEventListener("visibilitychange", handleVisibility)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener("focus", syncIfVisible)
      window.removeEventListener("online", syncIfVisible)
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [syncPlannerVersion])

  useEffect(() => {
    if (panelView === "details" && !selectedInterval) {
      setPanelView("list")
    }
  }, [panelView, selectedInterval])

  useEffect(() => {
    if (!selectedInterval) {
      setProcedureDetails(null)
      return
    }

    let active = true
    const loadProcedures = async () => {
      setIsProcedureLoading(true)
      try {
        const res = await fetch(`/api/work-intervals/${selectedInterval.id}/procedures`, {
          credentials: "include",
          cache: "no-store",
        })
        const json = await res.json().catch(() => null)
        if (!res.ok) {
          throw new Error(json?.error || t("planner_load_procedures_error"))
        }
        if (!active) return
        const procedures = json?.data?.procedures ?? []
        const open = procedures.find((item: ProcedureView) => item.when === "OPEN")
        const close = procedures.find((item: ProcedureView) => item.when === "CLOSE")
        const formulaCalculations = normalizeFormulaCalculations(json?.data?.formulaCalculations)
        setProcedureDetails({ open, close, formulaCalculations })
      } catch {
        if (active) setProcedureDetails(null)
      } finally {
        if (active) setIsProcedureLoading(false)
      }
    }

    void loadProcedures()
    return () => {
      active = false
    }
  }, [selectedInterval?.id])

  useEffect(() => {
    if (!lockedEmployeeId) return
    setSelectedEmployeeIds((prev) =>
      prev.length === 1 && prev[0] === lockedEmployeeId ? prev : [lockedEmployeeId],
    )
  }, [lockedEmployeeId])

  useEffect(() => {
    if (!readOnly) return
    if (isBulkMode) setIsBulkMode(false)
  }, [isBulkMode, readOnly])

  useEffect(() => {
    if (!readOnly) return
    if (panelView === "form") setPanelView("list")
  }, [panelView, readOnly])

  useLayoutEffect(() => {
    let rafId: number | null = null

    const setMeasuredHeight =
      (setter: Dispatch<SetStateAction<number | null>>, next: number | null) => {
        setter((prev) => {
          if (prev == null || next == null) return prev === next ? prev : next
          return Math.abs(prev - next) < 0.5 ? prev : next
        })
      }

    const measure = () => {
      rafId = null
      const monthRect = monthViewRef.current?.getBoundingClientRect() ?? null
      const nextMonth = monthRect?.height ?? null
      const nextWeek = weekViewRef.current?.getBoundingClientRect().height ?? null
      const nextTop = monthRect?.top ?? null
      setMeasuredHeight(setMonthViewHeight, nextMonth)
      setMeasuredHeight(setWeekViewHeight, nextWeek)
      setMeasuredHeight(setCalendarTopOffset, nextTop)
    }

    const scheduleMeasure = () => {
      if (rafId !== null) return
      rafId = window.requestAnimationFrame(measure)
    }

    scheduleMeasure()

    const observer = new ResizeObserver(() => {
      scheduleMeasure()
    })
    if (monthViewRef.current) observer.observe(monthViewRef.current)
    if (weekViewRef.current) observer.observe(weekViewRef.current)

    window.addEventListener("resize", scheduleMeasure)

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId)
      observer.disconnect()
      window.removeEventListener("resize", scheduleMeasure)
    }
  }, [])

  useEffect(() => {
    if (!isBulkMode || panelExpanded) return
    if (monthViewHeight == null || calendarTopOffset == null) return
    const viewportH = window.visualViewport?.height ?? window.innerHeight
    const overlap = calendarTopOffset + monthViewHeight - (viewportH - 185) + 8
    if (overlap <= 0) return
    const timer = window.setTimeout(() => {
      let parent: HTMLElement | null = monthViewRef.current?.parentElement ?? null
      while (parent) {
        const { overflowY } = window.getComputedStyle(parent)
        if (overflowY === "auto" || overflowY === "scroll") {
          parent.scrollBy({ top: overlap, behavior: "smooth" })
          break
        }
        parent = parent.parentElement
      }
    }, 50)
    return () => window.clearTimeout(timer)
  }, [isBulkMode, panelExpanded, monthViewHeight, calendarTopOffset])

  useEffect(() => {
    if (panelTransitionsEnabled) return
    if (monthViewHeight == null) return
    const timer = window.setTimeout(() => {
      setPanelTransitionsEnabled(true)
    }, 180)
    return () => window.clearTimeout(timer)
  }, [panelTransitionsEnabled, monthViewHeight])

  const workdayById = useMemo(
    () => new Map(workdays.map((wd) => [wd.id, wd])),
    [workdays],
  )

  const workdayByDate = useMemo(
    () => new Map(workdays.map((wd) => [wd.workDate, wd])),
    [workdays],
  )

  useEffect(() => {
    if (initialSelectedIntervalId) {
      const interval = intervals.find((item) => item.id === initialSelectedIntervalId)
      if (!interval) return

      const workday = workdayById.get(interval.workdayId)
      if (workday?.workDate && dateInputPattern.test(workday.workDate)) {
        const targetDate = resolvePlannerDate(workday.workDate)
        setDisplayDate(targetDate)
        setSelectedDate(targetDate)
      }

      setSelectedInterval(interval)
      setPanelExpanded(true)
      setPanelView("details")
      onInitialNavigationHandled?.()
      return
    }

    if (initialPreferCanceledInterval && initialDate && dateInputPattern.test(initialDate)) {
      const canceledIntervals = intervals.filter((interval) => {
        if (interval.status !== "canceled") return false
        const workday = workdayById.get(interval.workdayId)
        return workday?.workDate === initialDate
      })
      const normalizedCancelReason = normalizeCancelReason(initialCancelReason)
      const matchedCanceledInterval =
        normalizedCancelReason.length > 0
          ? canceledIntervals.find(
              (interval) => normalizeCancelReason(interval.cancelReason) === normalizedCancelReason,
            ) ?? null
          : null
      const targetInterval =
        matchedCanceledInterval ?? (canceledIntervals.length === 1 ? canceledIntervals[0] : null)

      if (targetInterval) {
        const targetDate = resolvePlannerDate(initialDate)
        setDisplayDate(targetDate)
        setSelectedDate(targetDate)
        setSelectedInterval(targetInterval)
        setPanelExpanded(true)
        setPanelView("details")
        onInitialNavigationHandled?.()
        return
      }
    }

    if (initialOpenWeekView) {
      setPanelExpanded(true)
      setPanelView("list")
      onInitialNavigationHandled?.()
      return
    }

    if (initialDate && dateInputPattern.test(initialDate)) {
      onInitialNavigationHandled?.()
    }
  }, [
    initialCancelReason,
    initialDate,
    initialOpenWeekView,
    initialPreferCanceledInterval,
    initialSelectedIntervalId,
    intervals,
    onInitialNavigationHandled,
    workdayById,
  ])

  const getIntervalStatus = (interval: WorkInterval): IntervalUiStatus => {
    if (interval.status === "conflict") {
      return { key: "conflict", label: t("dash_shift_status_conflict"), className: STATUS_STYLES.conflict as string }
    }
    if (interval.status === "canceled") {
      return { key: "canceled", label: t("dash_shift_status_cancelled"), className: STATUS_STYLES.canceled as string }
    }
    if (interval.status === "completed") {
      return { key: "completed", label: t("dash_shift_status_done"), className: STATUS_STYLES.completed as string }
    }
    if (interval.status === "in_progress") {
      return { key: "in_progress", label: t("dash_shift_status_active"), className: STATUS_STYLES.in_progress as string }
    }
    return { key: "scheduled", label: t("dash_shift_status_planned"), className: STATUS_STYLES.scheduled as string }
  }

  const filteredIntervals = useMemo(() => {
    if (
      selectedEmployeeIds.length === 0 &&
      selectedPositionIds.length === 0 &&
      selectedStatusKeys.length === 0
    ) {
      return intervals
    }

    return intervals.filter((interval) => {
      if (selectedEmployeeIds.length > 0 && !selectedEmployeeIds.includes(interval.employeeId)) {
        return false
      }
      if (selectedPositionIds.length > 0) {
        if (!interval.positionId) return false
        if (!selectedPositionIds.includes(interval.positionId)) return false
      }
      if (selectedStatusKeys.length > 0) {
        const statusKey = getIntervalStatus(interval).key
        if (!selectedStatusKeys.includes(statusKey)) return false
      }
      return true
    })
  }, [getIntervalStatus, intervals, selectedEmployeeIds, selectedPositionIds, selectedStatusKeys])

  useEffect(() => {
    if (!selectedInterval) return
    const stillVisible = filteredIntervals.some((interval) => interval.id === selectedInterval.id)
    if (!stillVisible) {
      setSelectedInterval(null)
      return
    }

    const latestInterval = intervals.find((interval) => interval.id === selectedInterval.id)
    if (!latestInterval) {
      setSelectedInterval(null)
      return
    }

    if (latestInterval !== selectedInterval) {
      setSelectedInterval(latestInterval)
    }
  }, [filteredIntervals, intervals, selectedInterval])

  const intervalsByDate = useMemo(() => {
    const map = new Map<string, WorkInterval[]>()
    filteredIntervals.forEach((interval) => {
      const workday = workdayById.get(interval.workdayId)
      if (!workday) return
      const existing = map.get(workday.workDate) || []
      map.set(workday.workDate, [...existing, interval])
    })
    return map
  }, [filteredIntervals, workdayById])

  const conflictDates = useMemo(() => {
    const dateSet = new Set<string>()
    intervals.forEach((interval) => {
      if (interval.status !== "conflict") return
      const workday = workdayById.get(interval.workdayId)
      if (!workday) return
      dateSet.add(workday.workDate)
    })
    return dateSet
  }, [intervals, workdayById])

  const selectedDateStr = format(safeSelectedDate, "yyyy-MM-dd")
  const selectedIntervals = intervalsByDate.get(selectedDateStr) || []

  const handleMonthChange = (date: Date) => {
    const targetDay = safeSelectedDate.getDate()
    const maxDay = endOfMonth(date).getDate()
    const nextSelected = new Date(date)
    nextSelected.setDate(Math.min(targetDay, maxDay))
    setDisplayDate(date)
    setSelectedDate(nextSelected)
  }

  const handleSelectDate = (date: Date) => {
    setSelectedDate(date)
    if (!isSameMonth(date, safeDisplayDate)) {
      setDisplayDate(date)
    }
  }

  const handleWeekShift = (offsetDays: number) => {
    const nextDate = addDays(safeSelectedDate, offsetDays)
    handleSelectDate(nextDate)
  }

  const handleCollapseToMonth = () => {
    setPanelExpanded(false)
    setPanelView("list")
  }

  const handleResetFilters = () => {
    setSelectedEmployeeIds(lockedEmployeeId ? [lockedEmployeeId] : [])
    setSelectedPositionIds([])
    setSelectedStatusKeys([])
  }

  const handleToday = () => {
    const today = new Date()
    setDisplayDate(today)
    setSelectedDate(today)
  }

  const prepareFormPanel = (options: {
    targetDate?: Date
    bulkDates?: string[]
    editingInterval: WorkInterval | null
    formValues: WorkIntervalFormValues
    returnView: "list" | "details"
  }) => {
    // Commit the next form state before the slide animation starts so the old form never flashes into view.
    flushSync(() => {
      if (options.targetDate) {
        setSelectedDate(options.targetDate)
        if (!isSameMonth(options.targetDate, safeDisplayDate)) {
          setDisplayDate(options.targetDate)
        }
      }
      setBulkCreateDates(options.bulkDates ?? [])
      setEditingInterval(options.editingInterval)
      setFormValues(options.formValues)
      setPanelReturnView(options.returnView)
      setPanelExpanded(true)
      setFormViewKey((prev) => prev + 1)
    })
  }

  const handleOpenCreate = (targetDate?: Date, options?: { bulkDates?: string[] }) => {
    if (readOnly) return
    prepareFormPanel({
      targetDate,
      bulkDates: options?.bulkDates,
      editingInterval: null,
      formValues: { ...DEFAULT_FORM_VALUES, positionId: undefined },
      returnView: "list",
    })
    setPanelView("form")
  }

  const handleToggleBulkMode = () => {
    if (readOnly) return
    setIsBulkMode((prev) => !prev)
    setBulkSelectedDates([])
    setBulkCreateDates([])
  }

  const handleToggleBulkDate = (dateStr: string) => {
    if (readOnly) return
    setBulkSelectedDates((prev) =>
      prev.includes(dateStr) ? prev.filter((value) => value !== dateStr) : [...prev, dateStr],
    )
  }

  const handleBulkCreate = () => {
    if (readOnly) return
    if (bulkSelectedDates.length === 0) {
      setIsBulkMode(false)
      setBulkSelectedDates([])
      return
    }
    const dates = [...bulkSelectedDates]
    setIsBulkMode(false)
    setBulkSelectedDates([])
    handleOpenCreate(undefined, { bulkDates: dates })
  }

  const handleOpenWeekView = (targetDate: Date) => {
    setSelectedDate(targetDate)
    if (!isSameMonth(targetDate, safeDisplayDate)) {
      setDisplayDate(targetDate)
    }
    setPanelExpanded(true)
    setPanelView("list")
  }

  const buildCustomPayPayload = (values: WorkIntervalFormValues) => {
    if (values.useStandardPay) {
      return {
        useCustomPay: false,
        payComponents: [],
      }
    }

    const components: Array<{
      componentType: "hourly" | "fixed_shift" | "percent_revenue"
      amountCents: number | null
      rateBp: number | null
      isActive: boolean
    }> = []

    for (const option of CUSTOM_PAY_OPTIONS) {
      if (!values.customPayTypes.includes(option.key)) continue
      const rawValue = values.customPayValues[option.key].trim()
      if (!rawValue) continue
      if (option.key === "percent_revenue") {
        const rateBp = toBasisPoints(rawValue)
        if (rateBp == null) continue
        components.push({ componentType: option.key, rateBp, amountCents: null, isActive: true })
        continue
      }
      const amountCents = toCents(rawValue)
      if (amountCents == null) continue
      components.push({ componentType: option.key, amountCents, rateBp: null, isActive: true })
    }

    return {
      useCustomPay: true,
      payComponents: components,
    }
  }

  const getOverlapErrorDescription = (conflicts?: IntervalConflict[] | null) => {
    if (!conflicts || conflicts.length === 0) {
      return t("planner_overlap_default")
    }
    const previews = conflicts.slice(0, 3).map((conflict) => {
      const employeeName = conflict.employeeName ? ` • ${conflict.employeeName}` : ""
      return `${conflict.workDate} ${conflict.startTime}—${conflict.endTime}${employeeName}`
    })
    const tail = conflicts.length > 3 ? t("planner_overlap_more", { count: conflicts.length - 3 }) : ""
    return t("planner_overlap_with", { items: previews.join("; "), tail })
  }

  const showIntervalErrorToast = (fallbackMessage: string) => {
    const state = useShiftStore.getState()
    if (state.lastIntervalErrorCode === INTERVAL_OVERLAP_ERROR_CODE) {
      setOverlapDialog({
        open: true,
        conflicts: state.lastIntervalConflicts ?? [],
      })
      return
    }
    if (state.lastIntervalErrorCode === INTERVAL_IN_PAST_ERROR_CODE) {
      const selectedDateLabel = formatShiftDateForToast(selectedDateStr, dateLocale)
      const selectedTimeLabel = formValues.startTime || "--:--"
      toast({
        title: t("planner_past_shift_title"),
        description: t("planner_past_shift_owner_desc", { date: selectedDateLabel, time: selectedTimeLabel }),
        variant: "destructive",
      })
      return
    }
    toast({
      title: t("common_error"),
      description: state.lastIntervalError || fallbackMessage,
      variant: "destructive",
    })
  }

  const showPastShiftToast = (options?: { date?: string; time?: string; skippedCount?: number }) => {
    const dateLabel = options?.date ? formatShiftDateForToast(options.date, dateLocale) : null
    const timeLabel = options?.time || "--:--"

    if (typeof options?.skippedCount === "number") {
      toast({
        title: t("planner_past_shift_title"),
        description:
          options.skippedCount === 1
            ? t("planner_past_shift_one_skipped")
            : t("planner_past_shift_many_skipped", { count: options.skippedCount }),
        variant: "destructive",
      })
      return
    }

    toast({
      title: t("planner_past_shift_title"),
      description: dateLabel
        ? t("planner_past_shift_date_desc", { date: dateLabel, time: timeLabel })
        : t("planner_past_shift_generic_desc"),
      variant: "destructive",
    })
  }

  const overlapConflictLines = useMemo(
    () =>
      overlapDialog.conflicts.map((conflict) => {
        const dateLabel = format(parseDate(conflict.workDate), "d MMMM yyyy", { locale: dateLocale })
        return `${dateLabel}, ${conflict.startTime} — ${conflict.endTime}`
      }),
    [dateLocale, overlapDialog.conflicts],
  )

  const canEditIntervalByStatus = (status: IntervalUiStatus["key"]) =>
    status === "scheduled" || status === "conflict"

  const handleSaveInterval = async () => {
    if (readOnly) return
    if (saveIntervalInFlightRef.current) return
    const isBulkSave = bulkCreateDates.length > 0 && !editingInterval
    if (!formValues.positionId) {
      toast({
        title: t("planner_position_required_title"),
        description: t("planner_select_role_for_shift"),
        variant: "destructive",
      })
      return
    }
    if (!editingInterval && !isBulkSave && isIntervalStartInPast(selectedDateStr, formValues.startTime)) {
      showPastShiftToast({ date: selectedDateStr, time: formValues.startTime })
      return
    }
    saveIntervalInFlightRef.current = true
    setIsSavingInterval(true)
    try {
      const customPayPayload = buildCustomPayPayload(formValues)
      let shouldShowSuccessToast = true
      if (editingInterval) {
        const status = getIntervalStatus(editingInterval)
        if (!canEditIntervalByStatus(status.key)) {
          toast({
            title: t("planner_edit_unavailable_title"),
            description: t("planner_edit_unavailable_desc"),
          })
          return
        }
        const updated = await updateInterval(editingInterval.id, {
          employeeId: formValues.employeeId,
          positionId: formValues.positionId,
          startAt: formValues.startTime,
          endAt: formValues.endTime,
          breakMinutes: formValues.breakMinutes,
          notes: formValues.notes,
          ...customPayPayload,
        })
        if (!updated) {
          showIntervalErrorToast(t("planner_update_shift_error"))
          return
        }
      } else if (isBulkSave) {
        const uniqueDates = Array.from(new Set(bulkCreateDates)).sort()
        const now = new Date()
        const validDates = uniqueDates.filter((dateStr) => !isIntervalStartInPast(dateStr, formValues.startTime, now))
        const skippedPastDatesCount = uniqueDates.length - validDates.length
        if (validDates.length === 0) {
          showPastShiftToast({ skippedCount: skippedPastDatesCount })
          return
        }
        if (skippedPastDatesCount > 0) {
          showPastShiftToast({ skippedCount: skippedPastDatesCount })
        }
        let createdCount = 0
        let failedCount = 0
        for (const dateStr of validDates) {
          const targetWorkday = await getOrCreateWorkday(dateStr)
          if (!targetWorkday) {
            failedCount += 1
            continue
          }
          const created = await createInterval({
            workdayId: targetWorkday.id,
            employeeId: formValues.employeeId,
            positionId: formValues.positionId,
            startAt: formValues.startTime,
            endAt: formValues.endTime,
            breakMinutes: formValues.breakMinutes,
            notes: formValues.notes,
            ...customPayPayload,
            allowConflictStatus: true,
          })
          if (created) {
            createdCount += 1
          } else {
            failedCount += 1
          }
        }
        setBulkCreateDates([])
        if (createdCount === 0) {
          const message = useShiftStore.getState().lastIntervalError || t("planner_create_shifts_error")
          toast({ title: t("common_error"), description: message, variant: "destructive" })
          return
        }
        if (failedCount > 0) {
          toast({
            title: t("planner_shifts_partially_saved"),
            description: t("planner_bulk_save_summary", { created: createdCount, failed: failedCount }),
            variant: "destructive",
          })
          shouldShowSuccessToast = false
        }
      } else {
        const workday = await getOrCreateWorkday(selectedDateStr)
        if (!workday) {
          toast({ title: t("common_error"), description: t("planner_create_workday_error"), variant: "destructive" })
          return
        }
        const created = await createInterval({
          workdayId: workday.id,
          employeeId: formValues.employeeId,
          positionId: formValues.positionId,
          startAt: formValues.startTime,
          endAt: formValues.endTime,
          breakMinutes: formValues.breakMinutes,
          notes: formValues.notes,
          ...customPayPayload,
        })
        if (!created) {
          showIntervalErrorToast(t("planner_create_shift_error"))
          return
        }
      }

      setEditingInterval(null)
      setPanelView("list")
      setPanelExpanded(true)
      if (shouldShowSuccessToast) {
        toast({ title: isBulkSave ? t("planner_shifts_saved") : t("planner_shift_saved") })
      }
    } catch (error: any) {
      toast({
        title: t("common_error"),
        description: error?.message || t("planner_save_shift_error"),
        variant: "destructive",
      })
    } finally {
      saveIntervalInFlightRef.current = false
      setIsSavingInterval(false)
    }
  }

  const handleOpenDetail = (interval: WorkInterval) => {
    setSelectedInterval(interval)
    setPanelExpanded(true)
    setPanelView("details")
  }

  const handleEditInterval = () => {
    if (readOnly) return
    if (!selectedInterval) return
    const status = getIntervalStatus(selectedInterval)
    if (!canEditIntervalByStatus(status.key)) {
      toast({
        title: t("planner_edit_unavailable_title"),
        description: t("planner_edit_unavailable_desc"),
      })
      return
    }
    const componentMap = new Map(
      (selectedInterval.payComponents ?? []).map((component) => [component.componentType, component]),
    )
    const mergedCustomPayTypes = Array.from(componentMap.keys()) as CustomPayKey[]
    const customPayValues = {
      hourly:
        componentMap.get("hourly")?.amountCents != null
          ? String((componentMap.get("hourly")?.amountCents ?? 0) / 100)
          : "",
      fixed_shift:
        componentMap.get("fixed_shift")?.amountCents != null
          ? String((componentMap.get("fixed_shift")?.amountCents ?? 0) / 100)
          : "",
      percent_revenue:
        componentMap.get("percent_revenue")?.rateBp != null
          ? String((componentMap.get("percent_revenue")?.rateBp ?? 0) / 100)
          : "",
    }
    prepareFormPanel({
      editingInterval: selectedInterval,
      formValues: {
        employeeId: selectedInterval.employeeId,
        positionId: selectedInterval.positionId,
        startTime: resolveTime(selectedInterval.startTime || selectedInterval.startAt, organizationTimeZone),
        endTime: resolveTime(selectedInterval.endTime || selectedInterval.endAt, organizationTimeZone),
        breakMinutes: selectedInterval.breakMinutes ?? 0,
        notes: selectedInterval.notes ?? "",
        useStandardPay: !selectedInterval.useCustomPay,
        customPayTypes: mergedCustomPayTypes,
        customPayValues,
      },
      returnView: "details",
    })
    setPanelView("form")
  }

  const handleDeleteInterval = async () => {
    if (readOnly) return
    if (!selectedInterval) return
    await deleteInterval(selectedInterval.id)
    setPanelView("list")
    setSelectedInterval(null)
    toast({ title: t("planner_shift_deleted") })
  }

  const handlePanelToggle = () => {
    if (panelExpanded) {
      setPanelExpanded(false)
      setPanelView("list")
      return
    }
    setPanelExpanded(true)
    setPanelView("list")
  }

  const handlePanelExpand = (e: React.MouseEvent) => {
    if (panelExpanded) return
    if ((e.target as HTMLElement).closest("button")) return
    setPanelExpanded(true)
    setPanelView("list")
  }

  const calendarDays = useMemo(() => getMonthCalendarDays(safeDisplayDate), [safeDisplayDate])
  const weekDays = useMemo(() => getWeekDays(safeSelectedDate), [safeSelectedDate])
  const today = useMemo(() => new Date(), [])
  const calendarViewMode: GlassCalendarView = panelExpanded ? "week" : "month"

  const handleCalendarViewChange = (nextView: GlassCalendarView) => {
    if (nextView === "week") {
      setPanelExpanded(true)
      setPanelView("list")
      return
    }

    setPanelExpanded(false)
    setPanelView("list")
    if (isBulkMode) {
      setIsBulkMode(false)
      setBulkSelectedDates([])
      setBulkCreateDates([])
    }
  }

  const handleCalendarDateSelect = (date: Date) => {
    const dateStr = formatDate(date)

    if (!panelExpanded && isBulkMode) {
      handleSelectDate(date)
      handleToggleBulkDate(dateStr)
      return
    }

    handleSelectDate(date)
  }

  const monthCalendarItems = useMemo<GlassCalendarDay[]>(
    () =>
      calendarDays.map((day, index) => {
        const dateStr = formatDate(day)
        const isCurrentMonth = isSameMonth(day, safeDisplayDate)
        const dayCount = intervalsByDate.get(dateStr)?.length ?? 0
        const hasConflict = conflictDates.has(dateStr)
        const isBulkSelected = isBulkMode && bulkSelectedDates.includes(dateStr)
        const col = index % 7
        const prevDay = index > 0 ? calendarDays[index - 1] : null
        const nextDay = index < calendarDays.length - 1 ? calendarDays[index + 1] : null
        const continuesRangeFromPrev =
          isBulkSelected &&
          col > 0 &&
          prevDay != null &&
          isSameMonth(prevDay, safeDisplayDate) &&
          bulkSelectedDates.includes(formatDate(prevDay))
        const continuesRangeToNext =
          isBulkSelected &&
          col < 6 &&
          nextDay != null &&
          isSameMonth(nextDay, safeDisplayDate) &&
          bulkSelectedDates.includes(formatDate(nextDay))

        return {
          date: day,
          isToday: isSameDay(day, today),
          isSelected: !isBulkMode && isSameDay(day, safeSelectedDate),
          isCurrentMonth,
          hasEvent: dayCount > 0,
          hasConflict,
          eventCount: dayCount,
          isRangeHighlight: isBulkSelected,
          continuesRangeFromPrev,
          continuesRangeToNext,
          onDoubleClick: !isBulkMode ? () => handleOpenWeekView(day) : undefined,
        }
      }),
    [bulkSelectedDates, calendarDays, conflictDates, intervalsByDate, isBulkMode, safeDisplayDate, safeSelectedDate, today],
  )

  const weekCalendarItems = useMemo<GlassCalendarDay[]>(
    () =>
      weekDays.map((day) => {
        const dateStr = formatDate(day)
        const dayCount = intervalsByDate.get(dateStr)?.length ?? 0

        return {
          date: day,
          isToday: isSameDay(day, today),
          isSelected: isSameDay(day, safeSelectedDate),
          isCurrentMonth: isSameMonth(day, safeDisplayDate),
          hasEvent: dayCount > 0,
          hasConflict: conflictDates.has(dateStr),
          eventCount: dayCount,
          helperText: dayCount > 0 ? `${dayCount} ${formatShiftWord(dayCount, t)}` : t("planner_no_shifts"),
        }
      }),
    [conflictDates, intervalsByDate, safeDisplayDate, safeSelectedDate, t, today, weekDays],
  )

  const calendarTitle = capitalizeLabel(
    format(calendarViewMode === "week" ? safeSelectedDate : safeDisplayDate, "LLLL", { locale: dateLocale }),
  )
  const calendarSubtitle =
    calendarViewMode === "week"
      ? `${capitalizeLabel(format(weekDays[0] ?? safeSelectedDate, "d MMM", { locale: dateLocale }))} - ${capitalizeLabel(
          format(weekDays[weekDays.length - 1] ?? safeSelectedDate, "d MMM yyyy", { locale: dateLocale }),
        )}`
      : format(safeDisplayDate, "yyyy")
  const selectedDateSummary = capitalizeLabel(format(safeSelectedDate, "d MMMM", { locale: dateLocale }))
  const selectedIntervalsSummary =
    selectedIntervals.length > 0 ? `${selectedIntervals.length} ${formatShiftWord(selectedIntervals.length, t)}` : t("planner_no_shifts_short")
  const selectedConflictSummary = conflictDates.has(selectedDateStr) ? t("planner_has_conflict") : null

  const activeFilterCount =
    selectedEmployeeIds.length + selectedPositionIds.length + selectedStatusKeys.length

  const filterButton = !filtersHidden ? (
    <button
      type="button"
      onClick={() => setIsFilterSheetOpen(true)}
      className={cn(
        "relative flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-secondary/80 px-3 py-1.5 text-xs font-semibold shadow-xs transition-colors",
        activeFilterCount > 0
          ? "border-orange-300/60 bg-orange-500/10 text-orange-600"
          : "text-muted-foreground hover:text-foreground",
      )}
      aria-label={t("planner_filters")}
    >
      <SlidersHorizontal className="size-3.5" />
      {t("planner_filters")}
      {activeFilterCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
          {activeFilterCount}
        </span>
      )}
    </button>
  ) : undefined

  const calendarToolbar =
    calendarViewMode === "month" && (!readOnly || filterButton) ? (
      <div className="flex items-center justify-between gap-2">
        {!readOnly ? (
          <Button
            variant={isBulkMode ? "secondary" : "outline"}
            size="sm"
            className={cn(
              "rounded-full border-border/80 bg-background/90 text-foreground shadow-xs hover:bg-accent",
              isBulkMode && "border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
            )}
            onClick={handleToggleBulkMode}
          >
            {t("planner_bulk")}
          </Button>
        ) : null}
        {filterButton}
      </div>
    ) : undefined

  const calendarHeaderEnd = calendarViewMode === "month" ? undefined : filterButton

  const calendarFooter = isBulkMode ? (
    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
      <span className="truncate">{selectedDateSummary}</span>
      <Button
        size="sm"
        className="h-7 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90"
        onClick={handleBulkCreate}
      >
        {t("common_create")}
      </Button>
      <span className="shrink-0">
        {selectedIntervalsSummary}
        {selectedConflictSummary ? ` • ${selectedConflictSummary}` : ""}
      </span>
    </div>
  ) : (
    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
      <span className="truncate">{selectedDateSummary}</span>
      <span className="shrink-0">
        {selectedIntervalsSummary}
        {selectedConflictSummary ? ` • ${selectedConflictSummary}` : ""}
      </span>
    </div>
  )

  const showCollapseIcon = panelView === "list" && panelExpanded

  const selectedWorkday = selectedInterval
    ? workdayById.get(selectedInterval.workdayId)
    : workdayByDate.get(selectedDateStr)
  const selectedWorkdayDate = selectedWorkday ? parseDate(selectedWorkday.workDate) : safeSelectedDate
  const selectedStatus = selectedInterval ? getIntervalStatus(selectedInterval) : null
  const detailStartTime = selectedInterval
    ? resolveTime(selectedInterval.startTime || selectedInterval.startAt, organizationTimeZone)
    : "--:--"
  const detailEndTime = selectedInterval
    ? resolveTime(selectedInterval.endTime || selectedInterval.endAt, organizationTimeZone)
    : "--:--"
  const detailEmployeeName =
    selectedInterval?.employee?.fullName || selectedInterval?.employee?.name || t("common_employee_fallback")
  const detailPositionName =
    selectedInterval?.position?.name || selectedInterval?.employee?.primaryPosition?.name
  const detailAssignmentText = `${detailEmployeeName} — ${detailPositionName || t("planner_no_position")}`
  const detailCancelReason = selectedInterval?.cancelReason?.trim() || ""
  const detailNotesText = selectedInterval?.notes?.trim() || ""
  const detailGrossPayCents = selectedInterval?.calculatedGrossPayCents ?? null
  const detailMinutesWorked = selectedInterval?.calculatedMinutesWorked ?? null
  const detailSalaryText =
    detailGrossPayCents != null
      ? formatMoneyCents(detailGrossPayCents)
      : selectedStatus?.key === "completed"
        ? "—"
        : t("planner_detail_salary_after_close_short")
  const detailDateText = format(selectedWorkdayDate, "d MMMM yyyy", { locale: ru })
  const detailScheduleText = selectedInterval ? `${detailStartTime} — ${detailEndTime}` : "—"
  const detailOpenedTimeText = selectedInterval?.openedAt ? resolveTime(selectedInterval.openedAt, organizationTimeZone) : "—"
  const detailClosedTimeText = selectedInterval?.closedAt ? resolveTime(selectedInterval.closedAt, organizationTimeZone) : "—"
  const detailPlannedMinutes =
    selectedInterval != null
      ? Math.max(
          0,
          Math.round((new Date(selectedInterval.endAt).getTime() - new Date(selectedInterval.startAt).getTime()) / 60000)
            - (selectedInterval.breakMinutes ?? 0),
        )
      : null
  const detailPlannedDurationText =
    detailPlannedMinutes != null
      ? `${Math.floor(detailPlannedMinutes / 60)} ${t("hours_short")} ${detailPlannedMinutes % 60} ${t("minutes_suffix")}`
      : "—"
  const detailWorkedText =
    detailMinutesWorked != null
      ? `${Math.floor(detailMinutesWorked / 60)} ${t("hours_short")} ${detailMinutesWorked % 60} ${t("minutes_suffix")}`
      : t("planner_detail_no_data")
  const detailOpenedHintText = selectedInterval?.openedAt ? t("planner_detail_actual_start") : t("planner_detail_opened_not_recorded")
  const detailClosedHintText = selectedInterval?.closedAt ? t("planner_detail_actual_end") : t("planner_detail_closed_not_recorded")
  const detailSalaryHintText = detailGrossPayCents != null ? t("planner_detail_salary_saved") : t("planner_detail_salary_after_close")
  const detailProcedureSummary = isProcedureLoading
    ? t("planner_loading_procedure_rules")
    : `${t("planner_procedure_open_count", { count: String(procedureDetails?.open?.rules.length ?? 0) })} • ${t("planner_procedure_close_count", { count: String(procedureDetails?.close?.rules.length ?? 0) })}`
  const detailCalculationsSummary = isProcedureLoading
    ? t("planner_loading_calculations")
    : procedureDetails?.formulaCalculations?.error
      ? t("planner_calculations_error")
      : (procedureDetails?.formulaCalculations?.items.length ?? 0) > 0
        ? t("planner_calculations_count", { count: String(procedureDetails?.formulaCalculations?.items.length ?? 0) })
        : t("planner_calculations_no_data")

  const employeeOptions = useMemo(
    () =>
      employees.map((emp) => ({
        id: emp.id,
        name: emp.fullName || emp.name || t("common_employee_fallback"),
        primaryPositionId: emp.primaryPosition?.id,
        positions: Array.from(
          new Map(
            (emp.positions ?? []).map((pos) => [pos.id, { id: pos.id, name: pos.name }]),
          ).values(),
        ),
      })),
    [employees],
  )

  const selectedEmployeeOption = useMemo(
    () => employeeOptions.find((employee) => employee.id === formValues.employeeId) ?? null,
    [employeeOptions, formValues.employeeId],
  )

  const positionOptions = useMemo(
    () => selectedEmployeeOption?.positions ?? [],
    [selectedEmployeeOption],
  )

  useEffect(() => {
    setFormValues((prev) => {
      if (!prev.employeeId) {
        if (!prev.positionId) return prev
        return { ...prev, positionId: undefined }
      }

      const selectedEmployee = employeeOptions.find((employee) => employee.id === prev.employeeId)
      if (!selectedEmployee) {
        if (!prev.positionId) return prev
        return { ...prev, positionId: undefined }
      }

      const availablePositions = selectedEmployee.positions
      if (availablePositions.length === 0) {
        if (!prev.positionId) return prev
        return { ...prev, positionId: undefined }
      }

      const availablePositionIds = new Set(availablePositions.map((position) => position.id))
      if (prev.positionId && availablePositionIds.has(prev.positionId)) {
        return prev
      }

      const fallbackPositionId =
        selectedEmployee.primaryPositionId && availablePositionIds.has(selectedEmployee.primaryPositionId)
          ? selectedEmployee.primaryPositionId
          : availablePositions[0]?.id

      return {
        ...prev,
        positionId: fallbackPositionId,
      }
    })
  }, [employeeOptions])

  const isFormValid = Boolean(
    formValues.employeeId && formValues.startTime && formValues.endTime && formValues.positionId,
  )
  const selectedCustomPayOptions = useMemo(
    () => CUSTOM_PAY_OPTIONS.filter((option) => formValues.customPayTypes.includes(option.key)),
    [formValues.customPayTypes],
  )
  const panelTranslate =
    panelView === "list" ? "translateX(0%)" : panelView === "details" ? "translateX(-33.333%)" : "translateX(-66.666%)"
  const panelTranslateY = 0
  const calendarHeight = panelExpanded ? weekViewHeight : monthViewHeight
  const collapsedHeight = 185
  const expandedHeight =
    calendarTopOffset != null && weekViewHeight != null
      ? `calc(100dvh - ${Math.round(calendarTopOffset)}px - ${Math.round(weekViewHeight)}px - 8px)`
      : "calc(100dvh - 128px)"

  const renderProcedureSection = (title: string, procedure?: ProcedureView) => (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-widest text-white/70">{title}</div>
      {!procedure || procedure.rules.length === 0 ? (
        <div className="text-xs text-white/80">{t("planner_no_rules")}</div>
      ) : (
        <div className="space-y-2">
          {procedure.rules.map((rule) => {
            const checklistState = new Map(
              rule.answer?.checklistItems?.map((item) => [item.itemId, item.isChecked]) ?? [],
            )
            return (
              <div key={rule.id} className="rounded-lg border border-border/60 p-2 text-xs bg-white/90">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium">
                    {rule.title}
                    {rule.required && <span className="text-destructive"> *</span>}
                  </div>
                  <span className="text-[10px] text-muted-foreground">{rule.type}</span>
                </div>
                {rule.type === "INPUT" && (
                  <div className="mt-1 text-muted-foreground">{rule.answer?.inputValue || "—"}</div>
                )}
                {rule.type === "PHOTO" && (
                  <div className="mt-2">
                    {rule.answer?.photoDeletedAt ? (
                      <div className="text-muted-foreground">{t("planner_cash_photo_deleted")}</div>
                    ) : rule.answer?.photoUrl ? (
                      <ImagePreview
                        src={rule.answer.photoUrl}
                        alt={t("shift_rule_photo")}
                        triggerClassName="w-full rounded-md"
                        imageClassName="w-full h-24 object-cover rounded-md"
                      />
                    ) : rule.answer?.photoS3Key ? (
                      <div className="text-muted-foreground">{t("planner_cash_photo_uploaded")}</div>
                    ) : (
                      <div className="text-muted-foreground">{t("planner_cash_photo_missing")}</div>
                    )}
                    {rule.answer?.photoComment && (
                      <div className="mt-1 text-muted-foreground">{rule.answer.photoComment}</div>
                    )}
                  </div>
                )}
                {rule.type === "CHECKLIST" && (
                  <div className="mt-2 space-y-1">
                    {rule.checklistItems.map((item) => (
                      <div key={item.id} className="flex items-center gap-2">
                        <span className={checklistState.get(item.id) ? "text-emerald-600" : "text-muted-foreground"}>
                          {checklistState.get(item.id) ? "✓" : "○"}
                        </span>
                        <span className={checklistState.get(item.id) ? "text-emerald-700" : "text-muted-foreground"}>
                          {item.title}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {rule.type === "CASH" && (
                  <div className="mt-2 space-y-1 text-muted-foreground">
                    {(rule.cashFields ?? []).length > 0 ? (
                      (() => {
                        const cashFields = rule.cashFields ?? []
                        const fieldKeys = cashFields.map((field) => field.key)
                        const decoded = decodeCashProcedureValues(rule.answer?.inputValue ?? "", fieldKeys)

                        return cashFields.map((field) => {
                          const token = (decoded[field.key] ?? "").trim()
                          const photoUrl = rule.answer?.cashPhotos?.[field.key]?.photoUrl ?? null
                          return (
                            <div key={field.key} className="space-y-2 rounded-md border border-border/60 p-2">
                              <div className="flex items-center justify-between gap-2">
                                <span>
                                  {field.label}
                                  {field.isRequired && <span className="text-destructive"> *</span>}
                                </span>
                                <span className={token ? "font-medium text-foreground" : "text-muted-foreground"}>
                                  {token ? formatIntegerToken(token) : "—"}
                                </span>
                              </div>
                              {photoUrl ? (
                                <ImagePreview
                                  src={photoUrl}
                                  alt={t("planner_cash_photo_field_alt", { label: field.label })}
                                  triggerClassName="w-full rounded-md"
                                  imageClassName="h-20 w-full rounded-md object-cover"
                                />
                              ) : null}
                            </div>
                          )
                        })
                      })()
                    ) : (
                      <div>{rule.answer?.inputValue?.trim() || t("planner_cash_fields_not_configured")}</div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  const renderFormulaCalculationsWidget = (formulaCalculations?: CashFormulaCalculations | null) => {
    if (isProcedureLoading) {
      return <div className="text-xs text-white/80">{t("planner_loading_calculations")}</div>
    }

    if (!formulaCalculations || formulaCalculations.items.length === 0) {
      return <div className="text-xs text-white/80">{t("planner_cash_formulas_empty")}</div>
    }

    if (formulaCalculations.error) {
      return <div className="text-xs text-destructive">{formulaCalculations.error}</div>
    }

    if (!formulaCalculations.hasCashInput) {
      return <div className="text-xs text-white/80">{t("planner_cash_no_data_for_formulas")}</div>
    }

    return (
      <div className="space-y-2">
        {formulaCalculations.items.map((item) => (
          <div key={item.resultKey} className="rounded-md border border-border/60 bg-white/90 px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {item.resultLabel}
                  {item.isTipsSource && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">{t("planner_cash_tips_badge")}</span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">{item.resultKey}</div>
              </div>
              <div className="font-semibold whitespace-nowrap">
                {item.valueCents == null ? "—" : formatMoneyCents(item.valueCents, formulaCalculations.currency ?? "CZK")}
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  const renderReadonlyField = ({
    label,
    value,
    hint,
    className,
    valueClassName,
  }: {
    label: string
    value: string
    hint?: string
    className?: string
    valueClassName?: string
  }) => (
    <div className={cn(READONLY_FIELD_CLASS, className)}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className={cn("mt-1 text-base font-semibold text-slate-900", valueClassName)}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  )

  const renderDetailAccordionItem = ({
    value,
    eyebrow,
    title,
    summary,
    children,
  }: {
    value: string
    eyebrow: string
    title: string
    summary: string
    children: ReactNode
  }) => (
    <AccordionItem value={value} className={cn(DETAIL_SECTION_CLASS, "border-b-0 px-3.5 py-0")}>
      <AccordionTrigger className="py-3 text-white hover:no-underline [&>svg]:text-white/60">
        <div className="min-w-0 text-left">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/65">{eyebrow}</div>
          <div className="mt-1 text-sm font-semibold text-white">{title}</div>
          <div className="mt-1 truncate text-xs text-white/70">{summary}</div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pt-0 pb-3">{children}</AccordionContent>
    </AccordionItem>
  )

  return (
    <div
      className="flex flex-col bg-background max-w-md mx-auto touch-pan-y"
      style={{ minHeight: "100%", paddingBottom: `${collapsedHeight + 8}px` }}
    >
      {!externalHeader && (
        <div className="sticky top-0 z-20 bg-background">
          <div className="flex flex-col gap-3 px-4 py-3">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full">
                <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
              </Button>
              <h1 className="text-xl font-semibold">{t("owner_tab_shifts")}</h1>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col">
        <div className="overflow-hidden">
          <div
            className={cn(
              "relative will-change-[height]",
              panelTransitionsEnabled
                ? "transition-[height] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                : "transition-none",
            )}
            style={calendarHeight ? { height: `${calendarHeight}px` } : undefined}
          >
            <div
              className={cn(
                panelExpanded
                  ? "absolute left-0 right-0 top-0 opacity-0 pointer-events-none"
                  : "relative opacity-100",
              )}
              aria-hidden={panelExpanded}
            >
              <div ref={monthViewRef} className="p-4 pb-0">
                <ScheduleCalendar
                  view="month"
                  showFilters={false}
                  title={calendarTitle}
                  subtitle={calendarSubtitle}
                  weekdayLabels={weekdayLabels}
                  days={monthCalendarItems}
                  selectedDate={safeSelectedDate}
                  onDateSelect={handleCalendarDateSelect}
                  onViewChange={handleCalendarViewChange}
                  onPrev={() => handleMonthChange(subMonths(safeDisplayDate, 1))}
                  onNext={() => handleMonthChange(addMonths(safeDisplayDate, 1))}
                  onToday={handleToday}
                  toolbar={calendarToolbar}
                  footer={calendarFooter}
                  headerEnd={calendarHeaderEnd}
                  className={cn(isBulkMode && "ring-2 ring-primary/15")}
                />
              </div>
            </div>
            <div
              className={cn(
                panelExpanded
                  ? "relative opacity-100"
                  : "absolute left-0 right-0 top-0 opacity-0 pointer-events-none",
              )}
              aria-hidden={!panelExpanded}
            >
              <div ref={weekViewRef} className="p-4 pb-0">
                <ScheduleCalendar
                  view="week"
                  showFilters={false}
                  title={calendarTitle}
                  subtitle={calendarSubtitle}
                  weekdayLabels={weekdayLabels}
                  days={weekCalendarItems}
                  selectedDate={safeSelectedDate}
                  onDateSelect={handleCalendarDateSelect}
                  onViewChange={handleCalendarViewChange}
                  onPrev={() => handleWeekShift(-7)}
                  onNext={() => handleWeekShift(7)}
                  onToday={handleToday}
                  toolbar={calendarToolbar}
                  footer={calendarFooter}
                  headerEnd={calendarHeaderEnd}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Filter bottom sheet — owner view */}
        {!filtersHidden && isFilterSheetOpen ? (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/40 animate-in fade-in duration-200"
              onClick={() => setIsFilterSheetOpen(false)}
            />
            <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-3xl bg-card shadow-xl animate-in slide-in-from-bottom duration-300 max-h-[85vh]">
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between border-b border-border px-5 pb-4">
                <h3 className="text-lg font-semibold">{t("planner_filters")}</h3>
                <div className="flex items-center gap-3">
                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="text-sm font-medium text-orange-500"
                    >
                      {t("common_reset")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsFilterSheetOpen(false)}
                    className="rounded-full p-2 -mr-2 text-muted-foreground transition-colors hover:bg-muted"
                    aria-label={t("common_close")}
                  >
                    <X className="size-5" />
                  </button>
                </div>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                {/* Employees */}
                {employees.length > 0 && (
                  <div>
                    <p className="mb-3 text-sm font-medium">{t("planner_employees")}</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedEmployeeIds(lockedEmployeeId ? [lockedEmployeeId] : [])}
                        className={cn(
                          "rounded-xl px-4 py-2.5 text-sm font-medium transition-all",
                          selectedEmployeeIds.length === 0
                            ? "bg-orange-500 text-white"
                            : "bg-muted text-muted-foreground hover:bg-muted/80",
                        )}
                      >
                        {t("common_all")}
                      </button>
                      {employees.map((employee) => {
                        const isActive = selectedEmployeeIds.includes(employee.id)
                        return (
                          <button
                            key={employee.id}
                            type="button"
                            onClick={() =>
                              setSelectedEmployeeIds((prev) =>
                                isActive
                                  ? prev.filter((id) => id !== employee.id)
                                  : [...prev, employee.id],
                              )
                            }
                            className={cn(
                              "rounded-xl px-4 py-2.5 text-sm font-medium transition-all",
                              isActive
                                ? "bg-orange-500 text-white"
                                : "bg-muted text-muted-foreground hover:bg-muted/80",
                            )}
                          >
                            {employee.fullName || employee.name || t("role_worker")}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Positions */}
                {positions.length > 0 && (
                  <div>
                    <p className="mb-3 text-sm font-medium">{t("planner_position")}</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedPositionIds([])}
                        className={cn(
                          "rounded-xl px-4 py-2.5 text-sm font-medium transition-all",
                          selectedPositionIds.length === 0
                            ? "bg-orange-500 text-white"
                            : "bg-muted text-muted-foreground hover:bg-muted/80",
                        )}
                      >
                        {t("common_all")}
                      </button>
                      {positions.map((position) => {
                        const isActive = selectedPositionIds.includes(position.id)
                        return (
                          <button
                            key={position.id}
                            type="button"
                            onClick={() =>
                              setSelectedPositionIds((prev) =>
                                isActive
                                  ? prev.filter((id) => id !== position.id)
                                  : [...prev, position.id],
                              )
                            }
                            className={cn(
                              "rounded-xl px-4 py-2.5 text-sm font-medium transition-all",
                              isActive
                                ? "bg-orange-500 text-white"
                                : "bg-muted text-muted-foreground hover:bg-muted/80",
                            )}
                          >
                            {position.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Statuses */}
                <div>
                  <p className="mb-3 text-sm font-medium">{t("planner_status")}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedStatusKeys([])}
                      className={cn(
                        "rounded-xl px-4 py-2.5 text-sm font-medium transition-all",
                        selectedStatusKeys.length === 0
                          ? "bg-orange-500 text-white"
                          : "bg-muted text-muted-foreground hover:bg-muted/80",
                      )}
                    >
                      {t("common_all")}
                    </button>
                    {STATUS_FILTERS.map((status) => {
                      const isActive = selectedStatusKeys.includes(status.key)
                      return (
                        <button
                          key={status.key}
                          type="button"
                          onClick={() =>
                            setSelectedStatusKeys((prev) =>
                              isActive
                                ? prev.filter((k) => k !== status.key)
                                : [...prev, status.key],
                            )
                          }
                          className={cn(
                            "rounded-xl px-4 py-2.5 text-sm font-medium transition-all",
                            isActive
                              ? "bg-orange-500 text-white"
                              : "bg-muted text-muted-foreground hover:bg-muted/80",
                          )}
                        >
                          {t(status.labelKey)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Apply button */}
              <div
                className="border-t border-border bg-card px-5 pt-5"
                style={{ paddingBottom: "calc(1.25rem + 4.5rem + env(safe-area-inset-bottom))" }}
              >
                <button
                  type="button"
                  onClick={() => setIsFilterSheetOpen(false)}
                  className="w-full rounded-2xl bg-orange-500 py-3.5 font-semibold text-white transition-all hover:bg-orange-600 active:scale-[0.98]"
                >
                  {t("common_apply")}
                </button>
              </div>
            </div>
          </>
        ) : null}

          <div
            ref={panelContainerRef}
            className="fixed z-40 inset-x-0 bottom-0 mx-auto w-full max-w-md px-3"
          >
            <div
              className={cn(
                "w-full max-w-md transform-gpu will-change-transform",
                panelTransitionsEnabled
                  ? "transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                  : "transition-none",
              )}
              style={{ transform: `translateY(${panelTranslateY}px)` }}
            >
                <div
                  className={cn(
                    "border border-orange-300/60 bg-[#E29049] will-change-[height,transform]",
                    panelView !== "form" && "rounded-t-3xl",
                    panelTransitionsEnabled
                      ? "transition-[height,transform,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                      : "transition-none",
                    "overflow-hidden",
                    !panelExpanded && "cursor-pointer",
                  )}
                style={{ height: panelExpanded ? (panelView === "form" ? "100dvh" : expandedHeight) : `${collapsedHeight}px` }}
                onClick={handlePanelExpand}
              >
                <button
                  type="button"
                  className="flex w-full justify-center pt-3 pb-2 cursor-pointer select-none"
                  onClick={handlePanelToggle}
                  aria-label={panelExpanded ? t("planner_hide_shift_list") : t("planner_show_shift_list")}
                >
                  <div className="h-1.5 w-14 rounded-full bg-white/60" />
                </button>

                <div className="px-5 pb-6 h-full flex flex-col">
              {panelView === "list" ? (
                <div className="relative flex items-start justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-white/80">{t("planner_total_shifts")}</div>
                    <div className="text-2xl font-semibold text-white">
                      {isBulkMode ? bulkSelectedDates.length : selectedIntervals.length}
                    </div>
                    <div className="text-sm text-white/80 mt-1">
                      {format(safeSelectedDate, "d MMMM", { locale: dateLocale })}
                    </div>
                  </div>
                  {!readOnly && !showCollapseIcon && !isBulkMode && (
                    <Button
                      type="button"
                      size="icon"
                      className="absolute left-1/2 top-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white text-orange-600 shadow-sm hover:bg-white/90"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleOpenCreate(safeSelectedDate)
                      }}
                      aria-label={t("planner_create_shift_on", { date: format(safeSelectedDate, "d MMMM", { locale: dateLocale }) })}
                    >
                      <Plus className="h-6 w-6" />
                    </Button>
                  )}
                  {showCollapseIcon ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full bg-white/20 text-white hover:bg-white/30"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleCollapseToMonth()
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  ) : (
                    <div className="w-9" />
                  )}
                </div>
              ) : panelView === "details" ? (
                <div className="flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full bg-white/20 text-white hover:bg-white/30"
                    onClick={() => setPanelView("list")}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div className="text-sm font-semibold text-white">{t("planner_shift_details")}</div>
                  <div className="w-9" />
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full bg-white/20 text-white hover:bg-white/30"
                    onClick={() => setPanelView(panelReturnView)}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div className="text-sm font-semibold text-white">
                    {editingInterval ? t("planner_editing") : t("planner_new_shift")}
                  </div>
                  <div className="w-9" />
                </div>
              )}

              <div
                className={cn(
                  "mt-4 flex-1 min-h-0 overflow-hidden will-change-[opacity,transform]",
                  panelTransitionsEnabled
                    ? "transition-[opacity,transform] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)]"
                    : "transition-none",
                  panelExpanded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none",
                )}
                aria-hidden={!panelExpanded}
              >
                <div
                  className="flex h-full w-[300%] transform-gpu will-change-transform transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={{ transform: panelTranslate }}
                >
                    <div className="w-1/3 pr-2 h-full min-h-0">
                      <div className="h-full min-h-0 space-y-2 overflow-y-auto pr-1" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 88px)" }}>
                        {selectedIntervals.length === 0 ? (
                          <div className="flex flex-col items-center text-center text-white/80 py-6">
                            {!readOnly && (
                              <Button
                                size="icon"
                                className="mb-3 rounded-full bg-white text-orange-600 hover:bg-white/90"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  handleOpenCreate()
                                }}
                              >
                                <Plus className="h-5 w-5" />
                              </Button>
                            )}
                            <div className="text-sm font-semibold">{t("planner_no_shifts_selected_day")}</div>
                            {!readOnly && (
                              <div className="text-xs text-white/70 mt-1">{t("planner_tap_plus_create")}</div>
                            )}
                          </div>
                        ) : (
                          <>
                            {selectedIntervals.map((interval) => {
                              const status = getIntervalStatus(interval)
                              const employeeName = interval.employee?.fullName || interval.employee?.name || t("role_worker")
                              const positionName = interval.position?.name || interval.employee?.primaryPosition?.name
                              const startTime = resolveTime(interval.startTime || interval.startAt, organizationTimeZone)
                              const endTime = resolveTime(interval.endTime || interval.endAt, organizationTimeZone)
                              const firstConflict = interval.conflicts?.[0]
                              const conflictPreview = firstConflict
                                ? `${firstConflict.startTime}—${firstConflict.endTime} (${firstConflict.employeeName || t("role_worker")})`
                                : null

                              return (
                                <div key={interval.id} className="flex items-center gap-2">
                                  <Card
                                    className={cn(
                                      "flex-1 min-w-0 p-3 bg-white/95 cursor-pointer hover:shadow-md transition-shadow",
                                      status.key === "conflict" && "ring-1 ring-red-400",
                                    )}
                                    onClick={() => handleOpenDetail(interval)}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        <div className="text-sm font-semibold">
                                          {startTime} — {endTime}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                          {employeeName}
                                          {positionName ? ` • ${positionName}` : ""}
                                        </div>
                                        {status.key === "conflict" && conflictPreview && (
                                          <div className="text-[11px] text-red-600 mt-1">
                                            {t("planner_conflicts_with")}: {conflictPreview}
                                          </div>
                                        )}
                                      </div>
                                      <Badge className={cn("text-[10px]", status.className)}>{status.label}</Badge>
                                    </div>
                                  </Card>
                                </div>
                              )
                            })}
                            {!readOnly && (
                              <Button
                                className="mt-4 w-full bg-white text-orange-700 hover:bg-white/90"
                                onClick={() => handleOpenCreate()}
                              >
                                + {t("planner_add_shift")}
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="w-1/3 px-2 h-full min-h-0">
                      {selectedInterval && (
                        <div className="h-full min-h-0 space-y-4 overflow-y-auto scrollbar-hidden pr-1" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 88px)" }}>
                          <div className="space-y-3 px-1">
                            <div className={DETAIL_SECTION_CLASS}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/65">
                                    Назначение
                                  </div>
                                  <div className="mt-1 truncate text-sm font-semibold text-white" title={detailAssignmentText}>
                                    {detailEmployeeName}
                                    <span className="font-medium text-white/72"> — {detailPositionName || t("planner_no_position")}</span>
                                  </div>
                                </div>
                                {selectedStatus ? (
                                  <Badge className={cn("rounded-full px-3 py-1 text-[11px] shadow-none", selectedStatus.className)}>
                                    {selectedStatus.label}
                                  </Badge>
                                ) : null}
                              </div>
                            </div>

                            {selectedStatus?.key === "canceled" && (
                              <div className="rounded-[20px] border border-rose-200/80 bg-rose-50/95 px-3.5 py-3 shadow-sm shadow-rose-950/10">
                                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-500">
                                  {t("planner_cancel_reason_label")}
                                </div>
                                <div className="mt-2 text-sm leading-6 text-rose-950">
                                  {detailCancelReason || t("planner_cancel_reason_empty")}
                                </div>
                              </div>
                            )}

                            <div className={DETAIL_SECTION_CLASS}>
                              <div className="mb-3">
                                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/65">{t("planner_detail_summary_eyebrow")}</div>
                                <div className="mt-1 text-sm font-semibold text-white">{t("planner_detail_summary_title")}</div>
                              </div>
                              <div className="overflow-hidden rounded-[18px] border border-white/70 bg-white/95 shadow-sm">
                                <div className="flex items-start justify-between gap-3 px-4 py-3.5">
                                  <div className="min-w-0">
                                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                      {t("planner_workday")}
                                    </div>
                                    <div className="mt-1 text-base font-semibold text-slate-900">{detailDateText}</div>
                                    <div className="mt-1 text-sm text-slate-600">{detailScheduleText}</div>
                                  </div>
                                  <div className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-right shadow-sm">
                                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-600">
                                      {t("planner_detail_plan")}
                                    </div>
                                    <div className="mt-0.5 text-sm font-semibold text-amber-950">{detailPlannedDurationText}</div>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-px border-y border-slate-200/80 bg-slate-200/80">
                                  <div className="bg-white px-4 py-3">
                                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                      {t("planner_detail_actual")}
                                    </div>
                                    <div className="mt-1 text-sm font-semibold text-slate-900">{detailWorkedText}</div>
                                    <div className="mt-1 text-xs text-slate-500">
                                      {detailMinutesWorked != null ? t("planner_detail_actual_time") : t("planner_detail_no_actual_data")}
                                    </div>
                                  </div>
                                  <div className="bg-white px-4 py-3">
                                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                      {t("planner_detail_accrued")}
                                    </div>
                                    <div className="mt-1 text-sm font-semibold text-slate-900">{detailSalaryText}</div>
                                    <div className="mt-1 text-xs text-slate-500">{detailSalaryHintText}</div>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-px bg-slate-200/80">
                                  <div className="bg-slate-50/90 px-4 py-2.5">
                                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                      {t("planner_detail_opened")}
                                    </div>
                                    <div className="mt-1 text-sm font-semibold text-slate-900">{detailOpenedTimeText}</div>
                                    <div className="mt-1 text-xs text-slate-500">{detailOpenedHintText}</div>
                                  </div>
                                  <div className="bg-slate-50/90 px-4 py-2.5">
                                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                      {t("planner_detail_closed")}
                                    </div>
                                    <div className="mt-1 text-sm font-semibold text-slate-900">{detailClosedTimeText}</div>
                                    <div className="mt-1 text-xs text-slate-500">{detailClosedHintText}</div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {selectedStatus?.key === "conflict" && (
                              <div className={cn(DETAIL_SECTION_CLASS, "border-rose-200/80 bg-gradient-to-br from-rose-50/95 via-white/95 to-rose-100/80")}>
                                <div className="mb-3 flex items-start justify-between gap-3">
                                  <div>
                                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-500">{t("planner_has_conflict")}</div>
                                    <div className="mt-1 text-sm font-semibold text-slate-900">{t("planner_conflict_detail_title")}</div>
                                  </div>
                                  <Badge className="rounded-full border-0 bg-rose-500 px-3 py-1 text-[11px] text-white shadow-none">
                                    {t("planner_conflict_check")}
                                  </Badge>
                                </div>
                                {(selectedInterval.conflicts ?? []).length === 0 ? (
                                  <div className={READONLY_FIELD_CLASS}>
                                    <div className="text-sm leading-6 text-slate-700">
                                      {t("planner_conflict_no_detail")}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-3">
                                    {(selectedInterval.conflicts ?? []).map((conflict) => (
                                      <div
                                        key={conflict.id}
                                        className="rounded-[1.1rem] border border-rose-200 bg-rose-50/95 px-4 py-3 shadow-sm"
                                      >
                                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-500">
                                          {conflict.workDate}
                                        </div>
                                        <div className="mt-1 text-sm font-semibold text-slate-900">
                                          {conflict.startTime} — {conflict.endTime}
                                        </div>
                                        {conflict.positionName ? (
                                          <div className="mt-1 text-xs text-slate-600">{conflict.positionName}</div>
                                        ) : null}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            <Accordion key={`detail-sections-${selectedInterval.id}`} type="multiple" className="space-y-3">
                              {renderDetailAccordionItem({
                                value: "notes",
                                eyebrow: t("planner_notes_eyebrow"),
                                title: t("planner_shift_comment"),
                                summary: detailNotesText || t("planner_shift_no_comment"),
                                children: (
                                  <div className={cn(READONLY_FIELD_CLASS, "min-h-[88px]")}>
                                    <div className="text-sm leading-6 text-slate-700">
                                      {detailNotesText || t("planner_shift_no_comment")}
                                    </div>
                                  </div>
                                ),
                              })}

                              {renderDetailAccordionItem({
                                value: "procedures",
                                eyebrow: t("planner_procedures_eyebrow"),
                                title: t("planner_procedures_title"),
                                summary: detailProcedureSummary,
                                children: isProcedureLoading ? (
                                  <div className={READONLY_FIELD_CLASS}>
                                    <div className="text-xs text-slate-500">{t("planner_loading_procedure_rules")}</div>
                                  </div>
                                ) : (
                                  <div className="space-y-4">
                                    {renderProcedureSection(t("planner_open_rules"), procedureDetails?.open)}
                                    {renderProcedureSection(t("planner_close_rules"), procedureDetails?.close)}
                                  </div>
                                ),
                              })}

                              {renderDetailAccordionItem({
                                value: "calculations",
                                eyebrow: t("planner_calculations_eyebrow"),
                                title: t("planner_calculations_title"),
                                summary: detailCalculationsSummary,
                                children: (
                                  <div className="space-y-3">
                                    <div className="flex items-center gap-2 text-xs text-white/70">
                                      <Calculator className="h-3.5 w-3.5" />
                                      <span>{t("planner_calculations_hint")}</span>
                                    </div>
                                    {renderFormulaCalculationsWidget(procedureDetails?.formulaCalculations)}
                                  </div>
                                ),
                              })}
                            </Accordion>
                          </div>

                          {selectedStatus && canEditIntervalByStatus(selectedStatus.key) && !readOnly ? (
                            <div className="space-y-2 px-1">
                              <Button className="w-full bg-white text-orange-700 hover:bg-white/90" onClick={handleEditInterval}>
                                {t("planner_edit_shift")}
                              </Button>
                              <Button variant="destructive" className="w-full" onClick={handleDeleteInterval}>
                                {t("planner_delete_shift")}
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                    <div key={formViewKey} className="w-1/3 pl-2 h-full min-h-0 flex flex-col">
                      <div className="flex-1 min-h-0 space-y-3 overflow-y-auto pr-1" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 88px)" }}>
                        <div className="space-y-4 px-1">
                          <div className={FORM_SECTION_CLASS}>
                            <div className="mb-4">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">{t("planner_assignment")}</div>
                              <div className="mt-1 text-sm font-semibold text-white">{t("planner_assignment_desc")}</div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="min-w-0 space-y-2">
                                <label className="text-xs font-semibold text-white/90">{t("planner_employee")}</label>
                                <Select
                                  value={formValues.employeeId}
                                  onValueChange={(value) => {
                                    const employee = employeeOptions.find((emp) => emp.id === value)
                                    setFormValues((prev) => ({
                                      ...prev,
                                      employeeId: value,
                                      positionId: (() => {
                                        const availablePositions = employee?.positions ?? []
                                        const availablePositionIds = new Set(
                                          availablePositions.map((position) => position.id),
                                        )
                                        if (
                                          prev.employeeId === value &&
                                          prev.positionId &&
                                          availablePositionIds.has(prev.positionId)
                                        ) {
                                          return prev.positionId
                                        }
                                        if (employee?.primaryPositionId && availablePositionIds.has(employee.primaryPositionId)) {
                                          return employee.primaryPositionId
                                        }
                                        return availablePositions[0]?.id
                                      })(),
                                    }))
                                  }}
                                >
                                  <SelectTrigger className="w-full min-w-0 border-white/70 bg-white/92 text-slate-900 shadow-sm">
                                    <SelectValue placeholder={t("planner_select_employee")} className="truncate" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {employeeOptions.map((emp) => (
                                      <SelectItem key={emp.id} value={emp.id}>
                                        {emp.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="min-w-0 space-y-2">
                                <label className="text-xs font-semibold text-white/90">{t("planner_position")}</label>
                                <Select
                                  value={formValues.positionId ?? ""}
                                  onValueChange={(value) =>
                                    setFormValues((prev) => ({
                                      ...prev,
                                      positionId: value || undefined,
                                    }))
                                  }
                                  disabled={!formValues.employeeId || positionOptions.length === 0}
                                >
                                  <SelectTrigger className="w-full min-w-0 border-white/70 bg-white/92 text-slate-900 shadow-sm">
                                    <SelectValue placeholder={t("planner_select_position")} className="truncate" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {positionOptions.map((pos) => (
                                      <SelectItem key={pos.id} value={pos.id}>
                                        {pos.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {!formValues.positionId && formValues.employeeId && (
                                  <div className="text-[10px] text-white/80">
                                    {positionOptions.length === 0 ? t("planner_employee_no_positions") : t("planner_need_position")}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className={FORM_SECTION_CLASS}>
                            <div className="mb-4">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">{t("planner_time")}</div>
                              <div className="mt-1 text-sm font-semibold text-white">{t("planner_time_desc")}</div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <label className="text-xs font-semibold text-white/90">{t("planner_start")}</label>
                                <TimePicker24h
                                  value={formValues.startTime}
                                  label={t("planner_shift_start")}
                                  className="h-12"
                                  onChange={(value) => setFormValues((prev) => ({ ...prev, startTime: value }))}
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-xs font-semibold text-white/90">{t("planner_end")}</label>
                                <TimePicker24h
                                  value={formValues.endTime}
                                  label={t("planner_shift_end")}
                                  className="h-12"
                                  onChange={(value) => setFormValues((prev) => ({ ...prev, endTime: value }))}
                                />
                              </div>
                            </div>
                          </div>

                          <div className={FORM_SECTION_CLASS}>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">{t("planner_pay")}</div>
                                <div className="mt-1 text-sm font-semibold text-white">{t("planner_pay_desc")}</div>
                              </div>
                              <Switch
                                checked={formValues.useStandardPay}
                                onCheckedChange={(checked) =>
                                  setFormValues((prev) => ({ ...prev, useStandardPay: checked }))
                                }
                              />
                            </div>
                            {!formValues.useStandardPay && (
                              <div className="mt-4 space-y-3">
                                <ToggleGroup
                                  type="multiple"
                                  value={formValues.customPayTypes}
                                  onValueChange={(value) =>
                                    setFormValues((prev) => ({
                                      ...prev,
                                      customPayTypes: value as CustomPayKey[],
                                    }))
                                  }
                                  className="grid grid-cols-3 gap-2"
                                  variant="outline"
                                  size="sm"
                                >
                                  {CUSTOM_PAY_OPTIONS.map((option) => (
                                    <ToggleGroupItem
                                      key={option.key}
                                      value={option.key}
                                      className="rounded-full bg-white/90 text-slate-900 first:rounded-full last:rounded-full data-[state=on]:bg-white data-[state=on]:text-orange-700"
                                    >
                                      {t(option.labelKey)}
                                    </ToggleGroupItem>
                                  ))}
                                </ToggleGroup>
                                {selectedCustomPayOptions.length > 0 && (
                                  <div className="space-y-2">
                                    {selectedCustomPayOptions.map((option) => (
                                      <div key={option.key} className="space-y-1">
                                        <label className="text-xs font-semibold text-white/90">{t(option.labelKey)}</label>
                                        <Input
                                          type="number"
                                          inputMode="decimal"
                                          step="0.01"
                                          className="border-white/70 bg-white/92 text-slate-900"
                                          placeholder={option.placeholder}
                                          value={formValues.customPayValues[option.key]}
                                          onChange={(event) => {
                                            const value = event.target.value
                                            setFormValues((prev) => ({
                                              ...prev,
                                              customPayValues: {
                                                ...prev.customPayValues,
                                                [option.key]: value,
                                              },
                                            }))
                                          }}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          <div className={FORM_SECTION_CLASS}>
                            <div className="mb-4">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">{t("planner_notes")}</div>
                              <div className="mt-1 text-sm font-semibold text-white">{t("planner_notes_desc")}</div>
                            </div>
                            <Textarea
                              rows={3}
                              className="border-white/70 bg-white/92 text-slate-900"
                              value={formValues.notes || ""}
                              onChange={(event) =>
                                setFormValues((prev) => ({ ...prev, notes: event.target.value }))
                              }
                              placeholder={t("planner_shift_comment")}
                            />
                          </div>
                        </div>

                        <div className="space-y-2 px-4">
                          <Button
                            className="w-full bg-white text-orange-700 hover:bg-white/90"
                            disabled={!isFormValid || isSavingInterval}
                            onClick={handleSaveInterval}
                          >
                            {isSavingInterval ? t("profile_saving") : t("common_save")}
                          </Button>
                          <Button
                            variant="ghost"
                            className="w-full text-white hover:bg-white/20"
                            disabled={isSavingInterval}
                            onClick={() => setPanelView(panelReturnView)}
                          >
                            {t("common_cancel")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      <AlertDialog
        open={overlapDialog.open}
        onOpenChange={(open) =>
          setOverlapDialog((prev) => ({
            open,
            conflicts: open ? prev.conflicts : [],
          }))
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("planner_overlap_title")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <div>{t("planner_overlap_desc")}</div>
                {overlapConflictLines.length > 0 ? (
                  <div className="space-y-1">
                    {overlapConflictLines.map((line) => (
                      <div key={line}>{line}</div>
                    ))}
                  </div>
                ) : (
                  <div>{getOverlapErrorDescription(null)}</div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() =>
                setOverlapDialog({
                  open: false,
                  conflicts: [],
                })
              }
            >
              {t("common_ok")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
