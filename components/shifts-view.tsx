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
} from "date-fns"
import { ru } from "date-fns/locale"
import { ArrowLeft, Calculator, ChevronLeft, ChevronRight, Plus, RotateCcw, X } from "lucide-react"
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
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MonthPicker } from "@/components/shifts/month-picker"
import { useToast } from "@/hooks/use-toast"
import { useShiftStore } from "@/lib/store/shift-store"
import { TIME_VALUE_PATTERN } from "@/lib/utils/time-utils"
import { cn } from "@/lib/utils"
import { formatDate, getMonthCalendarDays, getWeekDays, parseDate } from "@/lib/utils/date-utils"
import type { IntervalConflict, WorkInterval } from "@/lib/types/shift"
import { decodeCashProcedureValues } from "@/lib/cash/procedure-values"

const WEEK_DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
const INTERVAL_OVERLAP_ERROR_CODE = "INTERVAL_OVERLAP"
const INTERVAL_IN_PAST_ERROR_CODE = "INTERVAL_IN_PAST"
const STATUS_SYNC_INTERVAL_MS = 3000

const STATUS_STYLES = {
  scheduled: "bg-[#5BDACD] text-white border-0",
  in_progress: "bg-[#55A1F3] text-white border-0",
  completed: "bg-[#56E06F] text-white border-0",
  canceled: "bg-[#9CA3AF] text-white border-0",
  conflict: "bg-[#EF4444] text-white border-0",
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

function resolveTime(value?: string) {
  if (!value) return "--:--"
  if (value.includes("T")) return value.split("T")[1]?.slice(0, 5) || "--:--"
  return value.slice(0, 5)
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

const STATUS_FILTERS: { key: IntervalUiStatus["key"]; label: string }[] = [
  { key: "scheduled", label: "Запланирована" },
  { key: "in_progress", label: "Идет" },
  { key: "completed", label: "Завершена" },
  { key: "canceled", label: "Отменена" },
  { key: "conflict", label: "Конфликт" },
]

const CUSTOM_PAY_OPTIONS = [
  { key: "hourly", label: "Почасовая", placeholder: "180" },
  { key: "fixed_shift", label: "Фикс", placeholder: "2500" },
  { key: "percent_revenue", label: "Процент", placeholder: "3" },
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

const formatShiftDateForToast = (dateValue: string) => {
  const parsedDate = parseDate(dateValue)
  if (!isValid(parsedDate)) return dateValue
  return format(parsedDate, "d MMMM yyyy", { locale: ru })
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
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [monthViewHeight, setMonthViewHeight] = useState<number | null>(null)
  const [weekViewHeight, setWeekViewHeight] = useState<number | null>(null)
  const [contentHeight, setContentHeight] = useState<number | null>(null)
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
  const [activeFilter, setActiveFilter] = useState<"employee" | "position" | "status" | null>(null)
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

  const handleFilterOpenChange =
    (filterKey: "employee" | "position" | "status") => (open: boolean) => {
      setActiveFilter((current) => {
        if (open) return filterKey
        return current === filterKey ? null : current
      })
    }

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
          throw new Error(json?.error || "Не удалось загрузить процедуры")
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
      const nextMonth = monthViewRef.current?.getBoundingClientRect().height ?? null
      const nextWeek = weekViewRef.current?.getBoundingClientRect().height ?? null
      const nextContent = contentRef.current?.getBoundingClientRect().height ?? null
      setMeasuredHeight(setMonthViewHeight, nextMonth)
      setMeasuredHeight(setWeekViewHeight, nextWeek)
      setMeasuredHeight(setContentHeight, nextContent)
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
    if (contentRef.current) observer.observe(contentRef.current)

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId)
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    if (panelTransitionsEnabled) return
    if (monthViewHeight == null || contentHeight == null) return
    const timer = window.setTimeout(() => {
      setPanelTransitionsEnabled(true)
    }, 180)
    return () => window.clearTimeout(timer)
  }, [panelTransitionsEnabled, monthViewHeight, contentHeight])

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
      return { key: "conflict", label: "Конфликт", className: STATUS_STYLES.conflict as string }
    }
    if (interval.status === "canceled") {
      return { key: "canceled", label: "Отменена", className: STATUS_STYLES.canceled as string }
    }
    if (interval.status === "completed") {
      return { key: "completed", label: "Завершена", className: STATUS_STYLES.completed as string }
    }
    if (interval.status === "in_progress") {
      return { key: "in_progress", label: "Идет", className: STATUS_STYLES.in_progress as string }
    }
    return { key: "scheduled", label: "Запланирована", className: STATUS_STYLES.scheduled as string }
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
    setActiveFilter(null)
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
      return "У сотрудника уже есть смена в это время."
    }
    const previews = conflicts.slice(0, 3).map((conflict) => {
      const employeeName = conflict.employeeName ? ` • ${conflict.employeeName}` : ""
      return `${conflict.workDate} ${conflict.startTime}—${conflict.endTime}${employeeName}`
    })
    const tail = conflicts.length > 3 ? ` и еще ${conflicts.length - 3}` : ""
    return `Пересечение с: ${previews.join("; ")}${tail}.`
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
      const selectedDateLabel = formatShiftDateForToast(selectedDateStr)
      const selectedTimeLabel = formValues.startTime || "--:--"
      toast({
        title: "Смена в прошлом недоступна",
        description: `Для владельца доступно только текущее и будущее время. Выбрано: ${selectedDateLabel}, ${selectedTimeLabel}.`,
        variant: "destructive",
      })
      return
    }
    toast({
      title: "Ошибка",
      description: state.lastIntervalError || fallbackMessage,
      variant: "destructive",
    })
  }

  const showPastShiftToast = (options?: { date?: string; time?: string; skippedCount?: number }) => {
    const dateLabel = options?.date ? formatShiftDateForToast(options.date) : null
    const timeLabel = options?.time || "--:--"

    if (typeof options?.skippedCount === "number") {
      toast({
        title: "Смена в прошлом недоступна",
        description:
          options.skippedCount === 1
            ? "Одна дата пропущена: нельзя назначать смены задним числом. Оставьте только текущее или будущее время."
            : `Пропущено дат в прошлом: ${options.skippedCount}. Назначайте смены только на текущее или будущее время.`,
        variant: "destructive",
      })
      return
    }

    toast({
      title: "Смена в прошлом недоступна",
      description: dateLabel
        ? `Нельзя назначить смену на ${dateLabel}, ${timeLabel}. Выберите текущее или будущее время.`
        : "Нельзя назначить смену задним числом. Выберите текущее или будущее время.",
      variant: "destructive",
    })
  }

  const overlapConflictLines = useMemo(
    () =>
      overlapDialog.conflicts.map((conflict) => {
        const dateLabel = format(parseDate(conflict.workDate), "d MMMM yyyy", { locale: ru })
        return `${dateLabel}, ${conflict.startTime} — ${conflict.endTime}`
      }),
    [overlapDialog.conflicts],
  )

  const canEditIntervalByStatus = (status: IntervalUiStatus["key"]) =>
    status === "scheduled" || status === "conflict"

  const handleSaveInterval = async () => {
    if (readOnly) return
    if (saveIntervalInFlightRef.current) return
    const isBulkSave = bulkCreateDates.length > 0 && !editingInterval
    if (!formValues.positionId) {
      toast({
        title: "Нужна позиция",
        description: "Выберите роль для смены",
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
            title: "Редактирование недоступно",
            description: "Смены можно редактировать только в статусах Запланирована или Конфликт",
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
          showIntervalErrorToast("Не удалось обновить смену")
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
          const message = useShiftStore.getState().lastIntervalError || "Не удалось создать смены"
          toast({ title: "Ошибка", description: message, variant: "destructive" })
          return
        }
        if (failedCount > 0) {
          toast({
            title: "Смены сохранены частично",
            description: `Создано: ${createdCount}, ошибок: ${failedCount}`,
            variant: "destructive",
          })
          shouldShowSuccessToast = false
        }
      } else {
        const workday = await getOrCreateWorkday(selectedDateStr)
        if (!workday) {
          toast({ title: "Ошибка", description: "Не удалось создать рабочий день", variant: "destructive" })
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
          showIntervalErrorToast("Не удалось создать смену")
          return
        }
      }

      setEditingInterval(null)
      setPanelView("list")
      setPanelExpanded(true)
      if (shouldShowSuccessToast) {
        toast({ title: isBulkSave ? "Смены сохранены" : "Смена сохранена" })
      }
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error?.message || "Не удалось сохранить смену",
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
        title: "Редактирование недоступно",
        description: "Смены можно редактировать только в статусах Запланирована или Конфликт",
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
        startTime: resolveTime(selectedInterval.startTime || selectedInterval.startAt),
        endTime: resolveTime(selectedInterval.endTime || selectedInterval.endAt),
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
    toast({ title: "Смена удалена" })
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
  const today = new Date()

  const showCollapseIcon = panelView === "list" && panelExpanded

  const selectedWorkday = selectedInterval
    ? workdayById.get(selectedInterval.workdayId)
    : workdayByDate.get(selectedDateStr)
  const selectedWorkdayDate = selectedWorkday ? parseDate(selectedWorkday.workDate) : safeSelectedDate
  const selectedStatus = selectedInterval ? getIntervalStatus(selectedInterval) : null
  const detailStartTime = selectedInterval ? resolveTime(selectedInterval.startTime || selectedInterval.startAt) : "--:--"
  const detailEndTime = selectedInterval ? resolveTime(selectedInterval.endTime || selectedInterval.endAt) : "--:--"
  const detailEmployeeName =
    selectedInterval?.employee?.fullName || selectedInterval?.employee?.name || "Сотрудник"
  const detailPositionName =
    selectedInterval?.position?.name || selectedInterval?.employee?.primaryPosition?.name
  const detailAssignmentText = `${detailEmployeeName} — ${detailPositionName || "Без позиции"}`
  const detailCancelReason = selectedInterval?.cancelReason?.trim() || ""
  const detailNotesText = selectedInterval?.notes?.trim() || ""
  const detailGrossPayCents = selectedInterval?.calculatedGrossPayCents ?? null
  const detailMinutesWorked = selectedInterval?.calculatedMinutesWorked ?? null
  const detailSalaryText =
    detailGrossPayCents != null
      ? formatMoneyCents(detailGrossPayCents)
      : selectedStatus?.key === "completed"
        ? "—"
        : "После закрытия"
  const detailDateText = format(selectedWorkdayDate, "d MMMM yyyy", { locale: ru })
  const detailScheduleText = selectedInterval ? `${detailStartTime} — ${detailEndTime}` : "—"
  const detailOpenedTimeText = selectedInterval?.openedAt ? resolveTime(selectedInterval.openedAt) : "—"
  const detailClosedTimeText = selectedInterval?.closedAt ? resolveTime(selectedInterval.closedAt) : "—"
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
      ? `${Math.floor(detailPlannedMinutes / 60)} ч ${detailPlannedMinutes % 60} мин`
      : "—"
  const detailWorkedText =
    detailMinutesWorked != null ? `${Math.floor(detailMinutesWorked / 60)} ч ${detailMinutesWorked % 60} мин` : "Нет данных"
  const detailOpenedHintText = selectedInterval?.openedAt ? "Фактический старт" : "Открытие не зафиксировано"
  const detailClosedHintText = selectedInterval?.closedAt ? "Фактическое завершение" : "Закрытие не зафиксировано"
  const detailSalaryHintText = detailGrossPayCents != null ? "Расчет сохранен" : "Появится после закрытия"
  const detailProcedureSummary = isProcedureLoading
    ? "Загрузка правил..."
    : `Открытие: ${procedureDetails?.open?.rules.length ?? 0} • Закрытие: ${procedureDetails?.close?.rules.length ?? 0}`
  const detailCalculationsSummary = isProcedureLoading
    ? "Загрузка расчетов..."
    : procedureDetails?.formulaCalculations?.error
      ? "Есть ошибка расчета"
      : (procedureDetails?.formulaCalculations?.items.length ?? 0) > 0
        ? `Формул: ${procedureDetails?.formulaCalculations?.items.length ?? 0}`
        : "Данных пока нет"

  const employeeOptions = useMemo(
    () =>
      employees.map((emp) => ({
        id: emp.id,
        name: emp.fullName || emp.name || "Сотрудник",
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
  const panelOffset = 8
  const panelTranslateY = panelOffset
  const calendarHeight = panelExpanded ? weekViewHeight : monthViewHeight
  const baseCollapsedHeight = 140
  const baseExpandedHeight = "60vh"
  const availableHeight =
    contentHeight && calendarHeight ? Math.max(0, contentHeight - calendarHeight - panelOffset) : null
  const collapsedHeight = availableHeight ?? baseCollapsedHeight
  const expandedHeight = availableHeight ? `${availableHeight}px` : baseExpandedHeight

  const renderProcedureSection = (title: string, procedure?: ProcedureView) => (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-widest text-white/70">{title}</div>
      {!procedure || procedure.rules.length === 0 ? (
        <div className="text-xs text-white/80">Нет правил</div>
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
                      <div className="text-muted-foreground">Фото удалено по политике хранения</div>
                    ) : rule.answer?.photoUrl ? (
                      <ImagePreview
                        src={rule.answer.photoUrl}
                        alt="Фото"
                        triggerClassName="w-full rounded-md"
                        imageClassName="w-full h-24 object-cover rounded-md"
                      />
                    ) : rule.answer?.photoS3Key ? (
                      <div className="text-muted-foreground">Фото загружено</div>
                    ) : (
                      <div className="text-muted-foreground">Фото не добавлено</div>
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
                                  alt={`Фото поля ${field.label}`}
                                  triggerClassName="w-full rounded-md"
                                  imageClassName="h-20 w-full rounded-md object-cover"
                                />
                              ) : null}
                            </div>
                          )
                        })
                      })()
                    ) : (
                      <div>{rule.answer?.inputValue?.trim() || "Поля кассы не настроены"}</div>
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
      return <div className="text-xs text-white/80">Загрузка расчетов...</div>
    }

    if (!formulaCalculations || formulaCalculations.items.length === 0) {
      return <div className="text-xs text-white/80">Формулы кассы не настроены.</div>
    }

    if (formulaCalculations.error) {
      return <div className="text-xs text-destructive">{formulaCalculations.error}</div>
    }

    if (!formulaCalculations.hasCashInput) {
      return <div className="text-xs text-white/80">Нет заполненных данных кассы для расчета формул.</div>
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
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">Чаевые</span>
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

  const renderWeekDay = (day: Date) => {
    const dateStr = formatDate(day)
    const isSelected = isSameDay(day, safeSelectedDate)
    const isToday = isSameDay(day, today)
    const dayCount = intervalsByDate.get(dateStr)?.length ?? 0
    const hasConflict = conflictDates.has(dateStr)

    return (
      <div key={dateStr} className="flex min-w-0 flex-col items-center gap-1">
        <button
          onClick={() => handleSelectDate(day)}
          onDoubleClick={() => handleOpenWeekView(day)}
          className={cn(
            "w-full min-w-0 rounded-xl border bg-card px-1 py-2 text-center sm:px-2 sm:py-3",
            "transition-all hover:bg-accent/40",
            isSelected && "ring-2 ring-primary bg-primary/10",
          )}
        >
          <div className={cn("text-[9px] uppercase sm:text-[10px]", isToday && "text-primary")}>
            {format(day, "EEE", { locale: ru }).toUpperCase()}
          </div>
          <div className={cn("text-base font-semibold sm:text-lg", isToday && "text-primary")}>{format(day, "d")}</div>
          {dayCount > 0 && (
            <div
              className={cn(
                "mx-auto mt-1 h-2 w-2 rounded-full",
                hasConflict ? "bg-[#EF4444]" : "bg-[#F28A2E]",
              )}
            />
          )}
        </button>
        <div className="w-full min-w-0 text-center text-[10px] leading-tight text-muted-foreground">
          {dayCount > 0 ? `${dayCount} смен` : "Нет смен"}
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex flex-col h-screen bg-background max-w-md mx-auto overflow-hidden">
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm">
        <div className="flex flex-col gap-3 px-4 py-3">
          {externalHeader ? (
            <div className="flex items-center justify-end">
              <Button variant="outline" size="sm" className="rounded-full bg-transparent text-xs" onClick={handleToday}>
                Сегодня
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full">
                  <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
                </Button>
                <h1 className="text-xl font-semibold">Смены</h1>
              </div>
              <Button variant="outline" size="sm" className="rounded-full bg-transparent text-xs" onClick={handleToday}>
                Сегодня
              </Button>
            </div>
          )}
          {!filtersHidden && (
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
              <DropdownMenu
                open={activeFilter === "employee"}
                onOpenChange={handleFilterOpenChange("employee")}
              >
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full min-w-0 justify-start rounded-full bg-transparent px-2 text-[11px] sm:w-auto sm:px-3 sm:text-xs"
                  >
                    <span className="truncate sm:hidden">
                      Сотр.: {selectedEmployeeIds.length > 0 ? selectedEmployeeIds.length : "Все"}
                    </span>
                    <span className="hidden sm:inline">
                      Сотрудники: {selectedEmployeeIds.length > 0 ? selectedEmployeeIds.length : "Все"}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {employees.length === 0 ? (
                    <DropdownMenuItem disabled>Нет сотрудников</DropdownMenuItem>
                  ) : (
                    employees.map((employee) => (
                      <DropdownMenuCheckboxItem
                        key={employee.id}
                        checked={selectedEmployeeIds.includes(employee.id)}
                        onCheckedChange={(checked) => {
                          setSelectedEmployeeIds((prev) =>
                            checked
                              ? [...prev, employee.id]
                              : prev.filter((id) => id !== employee.id),
                          )
                        }}
                        onSelect={(event) => event.preventDefault()}
                      >
                        {employee.fullName || employee.name || "Сотрудник"}
                      </DropdownMenuCheckboxItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu
                open={activeFilter === "position"}
                onOpenChange={handleFilterOpenChange("position")}
              >
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full min-w-0 justify-start rounded-full bg-transparent px-2 text-[11px] sm:w-auto sm:px-3 sm:text-xs"
                  >
                    <span className="truncate sm:hidden">
                      Должн.: {selectedPositionIds.length > 0 ? selectedPositionIds.length : "Все"}
                    </span>
                    <span className="hidden sm:inline">
                      Должности: {selectedPositionIds.length > 0 ? selectedPositionIds.length : "Все"}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {positions.length === 0 ? (
                    <DropdownMenuItem disabled>Нет должностей</DropdownMenuItem>
                  ) : (
                    positions.map((position) => (
                      <DropdownMenuCheckboxItem
                        key={position.id}
                        checked={selectedPositionIds.includes(position.id)}
                        onCheckedChange={(checked) => {
                          setSelectedPositionIds((prev) =>
                            checked
                              ? [...prev, position.id]
                              : prev.filter((id) => id !== position.id),
                          )
                        }}
                        onSelect={(event) => event.preventDefault()}
                      >
                        {position.name}
                      </DropdownMenuCheckboxItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu
                open={activeFilter === "status"}
                onOpenChange={handleFilterOpenChange("status")}
              >
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full min-w-0 justify-start rounded-full bg-transparent px-2 text-[11px] sm:w-auto sm:px-3 sm:text-xs"
                  >
                    <span className="truncate">
                      Статус: {selectedStatusKeys.length > 0 ? selectedStatusKeys.length : "Все"}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {STATUS_FILTERS.map((status) => (
                    <DropdownMenuCheckboxItem
                      key={status.key}
                      checked={selectedStatusKeys.includes(status.key)}
                      onCheckedChange={(checked) => {
                        setSelectedStatusKeys((prev) =>
                          checked ? [...prev, status.key] : prev.filter((key) => key !== status.key),
                        )
                      }}
                      onSelect={(event) => event.preventDefault()}
                    >
                      {status.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="ghost"
                size="icon"
                className="size-7 rounded-full self-center sm:size-8"
                onClick={handleResetFilters}
                aria-label="Сбросить фильтры"
              >
                <RotateCcw className="size-3.5 sm:size-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      <div ref={contentRef} className="flex-1 flex flex-col overflow-hidden">
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
                <div
                  className={cn(
                    "bg-white rounded-[28px] border",
                    isBulkMode ? "border-[#F28A2E]" : "border-slate-200",
                  )}
                >
                  <div className="flex items-center justify-between px-5 pt-5 pb-3">
                    <div className="flex items-center gap-2">
                      <MonthPicker currentDate={safeDisplayDate} onChange={handleMonthChange} showIcon={false} />
                      {!readOnly && (
                        <>
                          <Button
                            variant={isBulkMode ? "default" : "outline"}
                            size="sm"
                            className={cn("rounded-full text-xs", !isBulkMode && "bg-transparent")}
                            onClick={handleToggleBulkMode}
                          >
                            Массово
                          </Button>
                          {isBulkMode && (
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 rounded-full bg-white text-orange-600 hover:bg-white/90"
                              onClick={handleBulkCreate}
                              aria-label="Создать смены"
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full h-8 w-8"
                        onClick={() => handleMonthChange(subMonths(safeDisplayDate, 1))}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full h-8 w-8"
                        onClick={() => handleMonthChange(addMonths(safeDisplayDate, 1))}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-y-3 px-5 pb-5 text-center">
                    {WEEK_DAYS.map((day) => (
                      <div key={day} className="text-[11px] font-medium text-slate-400">
                        {day}
                      </div>
                    ))}
                    {calendarDays.map((day, index) => {
                      const dateStr = formatDate(day)
                      const isCurrentMonth = isSameMonth(day, safeDisplayDate)
                      const isSelected = !isBulkMode && isSameDay(day, safeSelectedDate)
                      const isToday = isSameDay(day, today)
                      const hasMatch = (intervalsByDate.get(dateStr) || []).length > 0
                      const hasConflict = conflictDates.has(dateStr)
                      const isBulkSelected = isBulkMode && bulkSelectedDates.includes(dateStr)
                      const col = index % 7
                      const prevDay = index > 0 ? calendarDays[index - 1] : null
                      const nextDay = index < calendarDays.length - 1 ? calendarDays[index + 1] : null
                      const hasPrev =
                        isBulkSelected &&
                        col > 0 &&
                        prevDay &&
                        isSameMonth(prevDay, safeDisplayDate) &&
                        bulkSelectedDates.includes(formatDate(prevDay))
                      const hasNext =
                        isBulkSelected &&
                        col < 6 &&
                        nextDay &&
                        isSameMonth(nextDay, safeDisplayDate) &&
                        bulkSelectedDates.includes(formatDate(nextDay))

                      if (!isCurrentMonth) {
                        return <div key={dateStr} className="h-8" aria-hidden />
                      }

                      return (
                        <div key={dateStr} className="relative flex items-center justify-center">
                          {isBulkSelected && (
                            <div
                              className={cn(
                                "absolute inset-y-1 left-0 right-0 border-2 border-[#F28A2E] pointer-events-none",
                                hasPrev && "border-l-0",
                                hasNext && "border-r-0",
                                hasPrev && hasNext
                                  ? "rounded-none"
                                  : hasPrev
                                    ? "rounded-r-full"
                                    : hasNext
                                      ? "rounded-l-full"
                                      : "rounded-full",
                              )}
                            />
                          )}
                          <button
                            onClick={() => {
                              if (isBulkMode) {
                                handleSelectDate(day)
                                handleToggleBulkDate(dateStr)
                                return
                              }
                              handleSelectDate(day)
                            }}
                            onDoubleClick={!isBulkMode ? () => handleOpenWeekView(day) : undefined}
                            className={cn(
                              "h-12 w-12 mx-auto flex items-center justify-center rounded-full text-sm text-slate-700",
                              "transition-colors hover:bg-slate-100",
                              isSelected && "border-2 border-[#F28A2E]",
                              isToday && "text-[#F28A2E]",
                            )}
                          >
                            <div className="flex flex-col items-center gap-1">
                              <span>{format(day, "d")}</span>
                              {hasMatch && (
                                <span
                                  className={cn(
                                    "h-2 w-2 rounded-full",
                                    hasConflict ? "bg-[#EF4444]" : "bg-[#F28A2E]",
                                  )}
                                />
                              )}
                            </div>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
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
              <div ref={weekViewRef} className="px-2 pb-0 pt-4 sm:p-4 sm:pb-0">
                <div className="flex items-center gap-1 sm:gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-full text-slate-500 shrink-0 sm:h-8 sm:w-8"
                    onClick={() => handleWeekShift(-7)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="grid min-w-0 flex-1 grid-cols-7 gap-1 sm:gap-2">{weekDays.map(renderWeekDay)}</div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-full text-slate-500 shrink-0 sm:h-8 sm:w-8"
                    onClick={() => handleWeekShift(7)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

          <div className="z-30 flex items-end justify-center px-3 flex-shrink-0">
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
                    "rounded-t-3xl border border-orange-300/60 bg-[#E29049] will-change-[height,transform]",
                    panelTransitionsEnabled
                      ? "transition-[height,transform,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                      : "transition-none",
                    "overflow-hidden",
                    !panelExpanded && "cursor-pointer",
                  )}
                style={{ height: panelExpanded ? expandedHeight : `${collapsedHeight}px` }}
                onClick={handlePanelExpand}
              >
                <button
                  type="button"
                  className="flex w-full justify-center pt-3 pb-2 cursor-pointer select-none"
                  onClick={handlePanelToggle}
                  aria-label={panelExpanded ? "Скрыть список смен" : "Показать список смен"}
                >
                  <div className="h-1.5 w-14 rounded-full bg-white/60" />
                </button>

                <div className="px-5 pb-6 h-full flex flex-col">
              {panelView === "list" ? (
                <div className="relative flex items-start justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-white/80">Всего смен</div>
                    <div className="text-2xl font-semibold text-white">
                      {isBulkMode ? bulkSelectedDates.length : selectedIntervals.length}
                    </div>
                    <div className="text-sm text-white/80 mt-1">
                      {format(safeSelectedDate, "d MMMM", { locale: ru })}
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
                      aria-label={`Создать смену на ${format(safeSelectedDate, "d MMMM", { locale: ru })}`}
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
                  <div className="text-sm font-semibold text-white">Детали смены</div>
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
                    {editingInterval ? "Редактирование" : "Новая смена"}
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
                      <div className="h-full min-h-0 space-y-2 overflow-y-auto pr-1">
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
                            <div className="text-sm font-semibold">Нет смен на выбранный день</div>
                            {!readOnly && (
                              <div className="text-xs text-white/70 mt-1">Нажмите + чтобы создать смену</div>
                            )}
                          </div>
                        ) : (
                          <>
                            {selectedIntervals.map((interval) => {
                              const status = getIntervalStatus(interval)
                              const employeeName = interval.employee?.fullName || interval.employee?.name || "Сотрудник"
                              const positionName = interval.position?.name || interval.employee?.primaryPosition?.name
                              const startTime = resolveTime(interval.startTime || interval.startAt)
                              const endTime = resolveTime(interval.endTime || interval.endAt)
                              const firstConflict = interval.conflicts?.[0]
                              const conflictPreview = firstConflict
                                ? `${firstConflict.startTime}—${firstConflict.endTime} (${firstConflict.employeeName || "Сотрудник"})`
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
                                            Конфликтует с: {conflictPreview}
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
                                + Добавить смену
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="w-1/3 px-2 h-full min-h-0">
                      {selectedInterval && (
                        <div className="h-full min-h-0 space-y-4 overflow-y-auto scrollbar-hidden pr-1">
                          <div className="space-y-3 px-1">
                            <div className={DETAIL_SECTION_CLASS}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/65">
                                    Назначение
                                  </div>
                                  <div className="mt-1 truncate text-sm font-semibold text-white" title={detailAssignmentText}>
                                    {detailEmployeeName}
                                    <span className="font-medium text-white/72"> — {detailPositionName || "Без позиции"}</span>
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
                                  Причина отмены
                                </div>
                                <div className="mt-2 text-sm leading-6 text-rose-950">
                                  {detailCancelReason || "Причина не указана"}
                                </div>
                              </div>
                            )}

                            <div className={DETAIL_SECTION_CLASS}>
                              <div className="mb-3">
                                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/65">Сводка</div>
                                <div className="mt-1 text-sm font-semibold text-white">Время и итог по смене</div>
                              </div>
                              <div className="overflow-hidden rounded-[18px] border border-white/70 bg-white/95 shadow-sm">
                                <div className="flex items-start justify-between gap-3 px-4 py-3.5">
                                  <div className="min-w-0">
                                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                      Рабочий день
                                    </div>
                                    <div className="mt-1 text-base font-semibold text-slate-900">{detailDateText}</div>
                                    <div className="mt-1 text-sm text-slate-600">{detailScheduleText}</div>
                                  </div>
                                  <div className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-right shadow-sm">
                                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-600">
                                      План
                                    </div>
                                    <div className="mt-0.5 text-sm font-semibold text-amber-950">{detailPlannedDurationText}</div>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-px border-y border-slate-200/80 bg-slate-200/80">
                                  <div className="bg-white px-4 py-3">
                                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                      Факт
                                    </div>
                                    <div className="mt-1 text-sm font-semibold text-slate-900">{detailWorkedText}</div>
                                    <div className="mt-1 text-xs text-slate-500">
                                      {detailMinutesWorked != null ? "Фактическое время" : "Нет фактических данных"}
                                    </div>
                                  </div>
                                  <div className="bg-white px-4 py-3">
                                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                      Начислено
                                    </div>
                                    <div className="mt-1 text-sm font-semibold text-slate-900">{detailSalaryText}</div>
                                    <div className="mt-1 text-xs text-slate-500">{detailSalaryHintText}</div>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-px bg-slate-200/80">
                                  <div className="bg-slate-50/90 px-4 py-2.5">
                                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                      Открыта
                                    </div>
                                    <div className="mt-1 text-sm font-semibold text-slate-900">{detailOpenedTimeText}</div>
                                    <div className="mt-1 text-xs text-slate-500">{detailOpenedHintText}</div>
                                  </div>
                                  <div className="bg-slate-50/90 px-4 py-2.5">
                                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                      Закрыта
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
                                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-500">Конфликт</div>
                                    <div className="mt-1 text-sm font-semibold text-slate-900">Смена пересекается с другим интервалом</div>
                                  </div>
                                  <Badge className="rounded-full border-0 bg-rose-500 px-3 py-1 text-[11px] text-white shadow-none">
                                    Проверить
                                  </Badge>
                                </div>
                                {(selectedInterval.conflicts ?? []).length === 0 ? (
                                  <div className={READONLY_FIELD_CLASS}>
                                    <div className="text-sm leading-6 text-slate-700">
                                      Конфликт не детализирован. Проверьте расписание сотрудника.
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
                                eyebrow: "Заметки",
                                title: "Комментарий к смене",
                                summary: detailNotesText || "Комментарий к смене не добавлен",
                                children: (
                                  <div className={cn(READONLY_FIELD_CLASS, "min-h-[88px]")}>
                                    <div className="text-sm leading-6 text-slate-700">
                                      {detailNotesText || "Комментарий к смене не добавлен"}
                                    </div>
                                  </div>
                                ),
                              })}

                              {renderDetailAccordionItem({
                                value: "procedures",
                                eyebrow: "Процедуры",
                                title: "Правила открытия и закрытия",
                                summary: detailProcedureSummary,
                                children: isProcedureLoading ? (
                                  <div className={READONLY_FIELD_CLASS}>
                                    <div className="text-xs text-slate-500">Загрузка правил...</div>
                                  </div>
                                ) : (
                                  <div className="space-y-4">
                                    {renderProcedureSection("OPEN правила", procedureDetails?.open)}
                                    {renderProcedureSection("CLOSE правила", procedureDetails?.close)}
                                  </div>
                                ),
                              })}

                              {renderDetailAccordionItem({
                                value: "calculations",
                                eyebrow: "Расчеты",
                                title: "Формулы и итоговые значения",
                                summary: detailCalculationsSummary,
                                children: (
                                  <div className="space-y-3">
                                    <div className="flex items-center gap-2 text-xs text-white/70">
                                      <Calculator className="h-3.5 w-3.5" />
                                      <span>Итоги по данным смены и кассовых формул</span>
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
                                Редактировать смену
                              </Button>
                              <Button variant="destructive" className="w-full" onClick={handleDeleteInterval}>
                                Удалить смену
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                    <div key={formViewKey} className="w-1/3 pl-2 h-full min-h-0 flex flex-col">
                      <div className="flex-1 min-h-0 space-y-3 overflow-y-auto pr-1">
                        <div className="space-y-4 px-1">
                          <div className={FORM_SECTION_CLASS}>
                            <div className="mb-4">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">Назначение</div>
                              <div className="mt-1 text-sm font-semibold text-white">Кому и на какую позицию назначить смену</div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="min-w-0 space-y-2">
                                <label className="text-xs font-semibold text-white/90">Сотрудник</label>
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
                                    <SelectValue placeholder="Выберите сотрудника" className="truncate" />
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
                                <label className="text-xs font-semibold text-white/90">Позиция</label>
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
                                    <SelectValue placeholder="Выберите позицию" className="truncate" />
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
                                    {positionOptions.length === 0 ? "У сотрудника нет доступных позиций" : "Нужно выбрать позицию"}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className={FORM_SECTION_CLASS}>
                            <div className="mb-4">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">Время</div>
                              <div className="mt-1 text-sm font-semibold text-white">Когда начинается и заканчивается смена</div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <label className="text-xs font-semibold text-white/90">Начало</label>
                                <TimePicker24h
                                  value={formValues.startTime}
                                  label="Начало смены"
                                  className="h-12"
                                  onChange={(value) => setFormValues((prev) => ({ ...prev, startTime: value }))}
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-xs font-semibold text-white/90">Окончание</label>
                                <TimePicker24h
                                  value={formValues.endTime}
                                  label="Окончание смены"
                                  className="h-12"
                                  onChange={(value) => setFormValues((prev) => ({ ...prev, endTime: value }))}
                                />
                              </div>
                            </div>
                          </div>

                          <div className={FORM_SECTION_CLASS}>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">Оплата</div>
                                <div className="mt-1 text-sm font-semibold text-white">Стандартная или индивидуальная ставка</div>
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
                                      {option.label}
                                    </ToggleGroupItem>
                                  ))}
                                </ToggleGroup>
                                {selectedCustomPayOptions.length > 0 && (
                                  <div className="space-y-2">
                                    {selectedCustomPayOptions.map((option) => (
                                      <div key={option.key} className="space-y-1">
                                        <label className="text-xs font-semibold text-white/90">{option.label}</label>
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
                              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">Заметки</div>
                              <div className="mt-1 text-sm font-semibold text-white">Комментарий для менеджера или команды</div>
                            </div>
                            <Textarea
                              rows={3}
                              className="border-white/70 bg-white/92 text-slate-900"
                              value={formValues.notes || ""}
                              onChange={(event) =>
                                setFormValues((prev) => ({ ...prev, notes: event.target.value }))
                              }
                              placeholder="Комментарий к смене"
                            />
                          </div>
                        </div>

                        <div className="space-y-2 px-4">
                          <Button
                            className="w-full bg-white text-orange-700 hover:bg-white/90"
                            disabled={!isFormValid || isSavingInterval}
                            onClick={handleSaveInterval}
                          >
                            {isSavingInterval ? "Сохранение..." : "Сохранить"}
                          </Button>
                          <Button
                            variant="ghost"
                            className="w-full text-white hover:bg-white/20"
                            disabled={isSavingInterval}
                            onClick={() => setPanelView(panelReturnView)}
                          >
                            Отмена
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
            <AlertDialogTitle>Смена пересекается</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <div>Смена пересекается с уже запланированной сменой:</div>
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
              Ок
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
