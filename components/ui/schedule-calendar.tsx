"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, X, SlidersHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import type { GlassCalendarDay } from "@/components/ui/glass-calendar"
import { useTranslation } from "@/lib/i18n/context"

const DEFAULT_WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

export type ScheduleCalendarView = "week" | "month"
type ShiftStatus = "working" | "dayoff" | "vacation" | "sick" | null

export interface ScheduleEmployee {
  id: string
  name: string
  position: string
}

export interface ScheduleShiftInfo {
  date: Date
  status: ShiftStatus
  label?: string
  employeeId?: string
}

export interface ScheduleFilterState {
  employeeId: string | null
  position: string | null
  status: ShiftStatus
}

export interface ScheduleCalendarProps extends React.HTMLAttributes<HTMLDivElement> {
  // Controlled state (when provided, overrides internal state)
  view?: ScheduleCalendarView
  defaultView?: ScheduleCalendarView
  selectedDate?: Date
  displayMonth?: Date
  /** External pre-computed day data (from shifts-view). When provided, skips internal shift lookup. */
  days?: GlassCalendarDay[]

  // Self-contained shift data (used when `days` is not provided)
  shifts?: ScheduleShiftInfo[]
  employees?: ScheduleEmployee[]
  positions?: string[]

  // Callbacks
  onDateSelect?: (date: Date) => void
  onViewChange?: (view: ScheduleCalendarView) => void
  onFilterChange?: (filters: ScheduleFilterState) => void
  onPrev?: () => void
  onNext?: () => void
  onToday?: () => void

  // Slots
  toolbar?: React.ReactNode
  footer?: React.ReactNode
  headerEnd?: React.ReactNode

  // Display
  title?: string
  subtitle?: string
  weekdayLabels?: string[]
  showFilters?: boolean
}

// ── helpers ──────────────────────────────────────────────────────────────────

function getMonthDays(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number) {
  const day = new Date(year, month, 1).getDay()
  return day === 0 ? 6 : day - 1
}

function isSameDay(d1: Date, d2: Date) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  )
}

function formatDateShort(date: Date, locale: string) {
  const day = date.getDate()
  const month = new Intl.DateTimeFormat(locale, { month: "short" }).format(date)
  return `${day} ${month}`
}

function getWeekDates(date: Date): Date[] {
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(date)
  monday.setDate(date.getDate() + diff)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

// ── Filter bottom sheet ───────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: NonNullable<ShiftStatus>; labelKey: "planner_shift_status_working" | "planner_shift_status_dayoff" | "planner_shift_status_vacation" | "planner_shift_status_sick" }[] = [
  { value: "working", labelKey: "planner_shift_status_working" },
  { value: "dayoff", labelKey: "planner_shift_status_dayoff" },
  { value: "vacation", labelKey: "planner_shift_status_vacation" },
  { value: "sick", labelKey: "planner_shift_status_sick" },
]

function FilterBottomSheet({
  isOpen,
  onClose,
  filters,
  onFilterChange,
  employees,
  positions,
  onClearAll,
}: {
  isOpen: boolean
  onClose: () => void
  filters: ScheduleFilterState
  onFilterChange: (key: keyof ScheduleFilterState, value: string | null) => void
  employees: ScheduleEmployee[]
  positions: string[]
  onClearAll: () => void
}) {
  const { t } = useTranslation()
  const hasActiveFilters = filters.employeeId || filters.position || filters.status
  if (!isOpen) return null

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40 animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-card rounded-t-3xl shadow-xl animate-in slide-in-from-bottom duration-300 max-h-[85vh] overflow-hidden">
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>
        <div className="flex items-center justify-between px-5 pb-4 border-b border-border">
          <h3 className="text-lg font-semibold">{t("planner_filters")}</h3>
          <div className="flex items-center gap-3">
            {hasActiveFilters && (
              <button onClick={onClearAll} className="text-sm text-orange-500 font-medium">
                {t("common_reset")}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 -mr-2 rounded-full hover:bg-muted transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="p-5 space-y-6 overflow-y-auto max-h-[60vh]">
          {employees.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">{t("planner_employee")}</label>
              <div className="flex flex-wrap gap-2">
                <FilterPill active={!filters.employeeId} onClick={() => onFilterChange("employeeId", null)}>{t("common_all")}</FilterPill>
                {employees.map((emp) => (
                  <FilterPill key={emp.id} active={filters.employeeId === emp.id} onClick={() => onFilterChange("employeeId", emp.id)}>
                    {emp.name}
                  </FilterPill>
                ))}
              </div>
            </div>
          )}
          {positions.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">{t("planner_position")}</label>
              <div className="flex flex-wrap gap-2">
                <FilterPill active={!filters.position} onClick={() => onFilterChange("position", null)}>{t("common_all")}</FilterPill>
                {positions.map((pos) => (
                  <FilterPill key={pos} active={filters.position === pos} onClick={() => onFilterChange("position", pos)}>
                    {pos}
                  </FilterPill>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-foreground mb-3">{t("planner_status")}</label>
            <div className="flex flex-wrap gap-2">
              <FilterPill active={!filters.status} onClick={() => onFilterChange("status", null)}>{t("common_all")}</FilterPill>
              {STATUS_OPTIONS.map((s) => (
                <FilterPill key={s.value} active={filters.status === s.value} onClick={() => onFilterChange("status", s.value)}>
                  <span className={cn(
                    "w-2 h-2 rounded-full",
                    s.value === "working" && "bg-green-500",
                    s.value === "dayoff" && "bg-gray-400",
                    s.value === "vacation" && "bg-blue-500",
                    s.value === "sick" && "bg-red-500",
                  )} />
                  {t(s.labelKey)}
                </FilterPill>
              ))}
            </div>
          </div>
        </div>
        <div className="p-5 border-t border-border bg-card">
          <button
            onClick={onClose}
            className="w-full py-3.5 bg-orange-500 text-white font-semibold rounded-2xl hover:bg-orange-600 active:scale-[0.98] transition-all"
          >
            {t("common_apply")}
          </button>
        </div>
      </div>
    </>
  )
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2",
        active ? "bg-orange-500 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80",
      )}
    >
      {children}
    </button>
  )
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-orange-100 text-orange-700 rounded-full">
      {label}
      <button
        onClick={onRemove}
        className="hover:bg-orange-200 rounded-full p-0.5 transition-colors"
        aria-label={`Удалить фильтр ${label}`}
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export const ScheduleCalendar = React.forwardRef<HTMLDivElement, ScheduleCalendarProps>(
  (
    {
      className,
      view: viewProp,
      defaultView = "month",
      selectedDate: selectedDateProp,
      displayMonth: displayMonthProp,
      days,
      shifts = [],
      employees = [],
      positions = [],
      onDateSelect,
      onViewChange,
      onFilterChange,
      onPrev,
      onNext,
      onToday,
      toolbar,
      footer,
      headerEnd,
      title,
      subtitle,
      weekdayLabels = DEFAULT_WEEKDAY_LABELS,
      showFilters = true,
      ...props
    },
    ref,
  ) => {
    const { t, language } = useTranslation()
    const locale = language === "en" ? "en-US" : "ru-RU"

    // Internal state (used when controlled props are absent)
    const [internalView, setInternalView] = React.useState<ScheduleCalendarView>(defaultView)
    const [internalSelectedDate, setInternalSelectedDate] = React.useState(selectedDateProp ?? new Date())
    const [internalDisplayMonth, setInternalDisplayMonth] = React.useState(
      displayMonthProp ?? selectedDateProp ?? new Date(),
    )
    const [filters, setFilters] = React.useState<ScheduleFilterState>({
      employeeId: null,
      position: null,
      status: null,
    })
    const [isFilterOpen, setIsFilterOpen] = React.useState(false)

    // Sync controlled props into internal state
    React.useEffect(() => {
      if (selectedDateProp !== undefined) setInternalSelectedDate(selectedDateProp)
    }, [selectedDateProp])
    React.useEffect(() => {
      if (displayMonthProp !== undefined) setInternalDisplayMonth(displayMonthProp)
    }, [displayMonthProp])

    const resolvedView = viewProp ?? internalView
    const resolvedSelectedDate = selectedDateProp ?? internalSelectedDate
    const resolvedDisplayMonth = displayMonthProp ?? internalDisplayMonth

    const currentMonth = resolvedDisplayMonth.getMonth()
    const currentYear = resolvedDisplayMonth.getFullYear()

    // ── handlers ──────────────────────────────────────────────────────────────

    const handleViewChange = (next: ScheduleCalendarView) => {
      if (viewProp === undefined) setInternalView(next)
      onViewChange?.(next)
    }

    const handleDateSelect = (date: Date) => {
      if (selectedDateProp === undefined) setInternalSelectedDate(date)
      if (displayMonthProp === undefined) setInternalDisplayMonth(date)
      onDateSelect?.(date)
    }

    const handlePrev = () => {
      if (onPrev) {
        onPrev()
        return
      }
      // internal navigation
      if (resolvedView === "week") {
        const next = new Date(resolvedSelectedDate)
        next.setDate(next.getDate() - 7)
        setInternalSelectedDate(next)
        setInternalDisplayMonth(next)
        onDateSelect?.(next)
      } else {
        const next = new Date(currentYear, currentMonth - 1, 1)
        setInternalDisplayMonth(next)
      }
    }

    const handleNext = () => {
      if (onNext) {
        onNext()
        return
      }
      if (resolvedView === "week") {
        const next = new Date(resolvedSelectedDate)
        next.setDate(next.getDate() + 7)
        setInternalSelectedDate(next)
        setInternalDisplayMonth(next)
        onDateSelect?.(next)
      } else {
        const next = new Date(currentYear, currentMonth + 1, 1)
        setInternalDisplayMonth(next)
      }
    }

    const handleFilterChange = (key: keyof ScheduleFilterState, value: string | null) => {
      const next = { ...filters, [key]: value }
      setFilters(next)
      onFilterChange?.(next)
    }

    const clearAllFilters = () => {
      const empty: ScheduleFilterState = { employeeId: null, position: null, status: null }
      setFilters(empty)
      onFilterChange?.(empty)
    }

    const hasActiveFilters = !!(filters.employeeId || filters.position || filters.status)
    const activeFilterCount = [filters.employeeId, filters.position, filters.status].filter(Boolean).length

    // ── computed header text ──────────────────────────────────────────────────

    const resolvedTitle = title ?? new Intl.DateTimeFormat(locale, { month: "long" }).format(resolvedDisplayMonth)
    const resolvedSubtitle = (() => {
      if (subtitle) return subtitle
      if (resolvedView === "week") {
        const week = days && days.length >= 7 ? days.map((d) => d.date) : getWeekDates(resolvedSelectedDate)
        const first = week[0]
        const last = week[week.length - 1]
        if (first && last) {
          return `${formatDateShort(first, locale)} — ${formatDateShort(last, locale)} ${last.getFullYear()}`
        }
      }
      return `${currentYear}`
    })()

    // ── internal shift lookup (used when `days` not provided) ─────────────────

    const getShiftForDate = (date: Date): ScheduleShiftInfo | undefined => {
      return shifts.find((s) => {
        const matchDate = isSameDay(s.date, date)
        const matchEmployee = !filters.employeeId || s.employeeId === filters.employeeId
        const matchStatus = !filters.status || s.status === filters.status
        return matchDate && matchEmployee && matchStatus
      })
    }

    const getShiftStatusText = (shift: ScheduleShiftInfo | undefined) => {
      if (!shift) return t("planner_no_data")
      switch (shift.status) {
        case "working": return shift.label || t("planner_workday")
        case "dayoff": return t("planner_shift_status_dayoff")
        case "vacation": return t("planner_shift_status_vacation")
        case "sick": return t("planner_shift_status_sick")
        default: return t("planner_no_data")
      }
    }

    // ── internal calendar grid generation (used when `days` not provided) ─────

    const internalCalendarDays = React.useMemo((): Date[] => {
      if (resolvedView === "week") {
        return getWeekDates(resolvedSelectedDate)
      }
      const result: Date[] = []
      const totalDays = getMonthDays(currentYear, currentMonth)
      const firstDay = getFirstDayOfMonth(currentYear, currentMonth)
      const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1
      const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear
      const prevMonthDays = getMonthDays(prevYear, prevMonth)

      for (let i = firstDay - 1; i >= 0; i--) {
        result.push(new Date(prevYear, prevMonth, prevMonthDays - i))
      }
      for (let i = 1; i <= totalDays; i++) {
        result.push(new Date(currentYear, currentMonth, i))
      }
      const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1
      const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear
      for (let i = 1; result.length < 42; i++) {
        result.push(new Date(nextYear, nextMonth, i))
      }
      return result
    }, [resolvedView, resolvedSelectedDate, currentYear, currentMonth])

    // ── selected shift for footer ─────────────────────────────────────────────

    const selectedShift = days ? undefined : getShiftForDate(resolvedSelectedDate)
    const selectedEmployee = employees.find((e) => e.id === filters.employeeId)
    const selectedStatus = STATUS_OPTIONS.find((s) => s.value === filters.status)

    // ── renderers ─────────────────────────────────────────────────────────────

    const today = React.useMemo(() => new Date(), [])

    /** Month view — square cells with colored backgrounds */
    const renderMonthCell = (date: Date | null, idx: number, externalDay?: GlassCalendarDay) => {
      if (!date) return <div key={idx} />

      const isCurrentMonth = externalDay
        ? (externalDay.isCurrentMonth ?? true)
        : date.getMonth() === currentMonth
      const isSelected = externalDay
        ? (externalDay.isSelected ?? false)
        : isSameDay(date, resolvedSelectedDate)
      const isToday = externalDay ? (externalDay.isToday ?? false) : isSameDay(date, today)
      const isDisabled = externalDay?.isDisabled ?? false
      const isWeekend = date.getDay() === 0 || date.getDay() === 6

      // Determine event/conflict state
      let hasEvent = false
      let hasConflict = false
      let shift: ScheduleShiftInfo | undefined
      const isRangeHighlight = externalDay?.isRangeHighlight ?? false

      if (externalDay) {
        hasEvent = externalDay.hasEvent ?? false
        hasConflict = externalDay.hasConflict ?? false
      } else {
        shift = getShiftForDate(date)
        hasEvent = !!shift
        hasConflict = false
      }

      const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${idx}`

      const isHighlighted = isSelected || isRangeHighlight

      return (
        <div key={dateKey} className="relative flex min-h-[52px] items-center justify-center">
          <button
            type="button"
            disabled={isDisabled}
            onClick={() => handleDateSelect(date)}
            onDoubleClick={externalDay?.onDoubleClick}
            className={cn(
              "relative z-10 aspect-square w-full flex flex-col items-center justify-center rounded-2xl text-[15px] font-semibold transition-all",
              "hover:opacity-80 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "min-h-[52px]",
              isCurrentMonth
                ? isWeekend
                  ? "text-orange-400"
                  : "text-foreground"
                : "text-muted-foreground/35",
              isHighlighted && "bg-orange-500 text-white",
              isToday && !isHighlighted && "ring-2 ring-orange-300",
              isDisabled && "cursor-not-allowed opacity-50",
              // Event/status background (not selected)
              !isHighlighted && hasConflict && "bg-red-50 dark:bg-red-950/30",
              !isHighlighted && hasEvent && !hasConflict && "bg-green-50 dark:bg-green-950/30",
              !isHighlighted && shift?.status === "dayoff" && "bg-muted",
              !isHighlighted && shift?.status === "vacation" && "bg-blue-50 dark:bg-blue-950/30",
              !isHighlighted && shift?.status === "sick" && "bg-red-50 dark:bg-red-950/30",
            )}
          >
            <span>{date.getDate()}</span>
            {/* Dot indicator */}
            {!isHighlighted && (hasEvent || isToday) ? (
              <span
                className={cn(
                  "mt-[3px] w-1.5 h-1.5 rounded-full",
                  hasConflict
                    ? "bg-red-500"
                    : hasEvent
                      ? shift?.status === "dayoff"
                        ? "bg-muted-foreground/60"
                        : shift?.status === "vacation"
                          ? "bg-blue-500"
                          : shift?.status === "sick"
                            ? "bg-red-500"
                            : "bg-green-500"
                      : "bg-primary",
                )}
              />
            ) : null}
          </button>
        </div>
      )
    }

    /** Week view — square cell + dot below (matches month view cell style) */
    const renderWeekCard = (date: Date, idx: number, externalDay?: GlassCalendarDay) => {
      const isSelected = externalDay
        ? (externalDay.isSelected ?? false)
        : isSameDay(date, resolvedSelectedDate)
      const isToday = externalDay ? (externalDay.isToday ?? false) : isSameDay(date, today)
      const isDisabled = externalDay?.isDisabled ?? false
      const isWeekend = date.getDay() === 0 || date.getDay() === 6

      let hasEvent = false
      let hasConflict = false
      let shift: ScheduleShiftInfo | undefined

      if (externalDay) {
        hasEvent = externalDay.hasEvent ?? false
        hasConflict = externalDay.hasConflict ?? false
      } else {
        shift = getShiftForDate(date)
        hasEvent = !!shift
      }

      const dateKey = `week-${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${idx}`

      const dotColor = hasConflict
        ? "bg-red-500"
        : hasEvent
          ? shift?.status === "dayoff"
            ? "bg-muted-foreground/60"
            : shift?.status === "vacation"
              ? "bg-blue-500"
              : shift?.status === "sick"
                ? "bg-red-500"
                : "bg-green-500"
          : null

      return (
        <div key={dateKey} className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            disabled={isDisabled}
            onClick={() => handleDateSelect(date)}
            onDoubleClick={externalDay?.onDoubleClick}
            className={cn(
              "aspect-square w-full flex items-center justify-center rounded-2xl text-[15px] font-semibold transition-all",
              "hover:opacity-80 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "min-h-[52px]",
              isWeekend ? "text-orange-400" : "text-foreground",
              isSelected && "bg-orange-500 text-white",
              isToday && !isSelected && "ring-2 ring-orange-300",
              isDisabled && "cursor-not-allowed opacity-50",
              !isSelected && hasConflict && "bg-red-50 dark:bg-red-950/30",
              !isSelected && hasEvent && !hasConflict && "bg-green-50 dark:bg-green-950/30",
              !isSelected && shift?.status === "dayoff" && "bg-muted",
              !isSelected && shift?.status === "vacation" && "bg-blue-50 dark:bg-blue-950/30",
              !isSelected && shift?.status === "sick" && "bg-red-50 dark:bg-red-950/30",
            )}
          >
            {date.getDate()}
          </button>
          {/* Dot below the cell (reserve space when empty for alignment) */}
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              dotColor && !isSelected ? dotColor : "bg-transparent",
            )}
          />
        </div>
      )
    }

    // ── build grid arrays ─────────────────────────────────────────────────────

    const renderMonthGrid = () => {
      if (days) {
        return days.map((d, idx) => renderMonthCell(d.date, idx, d))
      }
      return internalCalendarDays.map((date, idx) => renderMonthCell(date, idx))
    }

    const renderWeekGrid = () => {
      if (days) {
        return days.map((d, idx) => renderWeekCard(d.date, idx, d))
      }
      return internalCalendarDays.map((date, idx) => renderWeekCard(date, idx))
    }

    // ── default footer content ────────────────────────────────────────────────

    const defaultFooter = (
      <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-2">
        <div className="text-sm">
          <span className="text-muted-foreground">{t("planner_selected")}: </span>
          <span className="font-medium text-foreground">
            {formatDateShort(resolvedSelectedDate, locale)}
          </span>
        </div>
        <div
          className={cn(
            "text-sm font-medium px-3 py-1.5 rounded-xl self-start xs:self-auto",
            selectedShift?.status === "working" && "bg-green-100 text-green-700",
            selectedShift?.status === "dayoff" && "bg-muted text-muted-foreground",
            selectedShift?.status === "vacation" && "bg-blue-100 text-blue-700",
            selectedShift?.status === "sick" && "bg-red-100 text-red-700",
            !selectedShift && "bg-muted text-muted-foreground",
          )}
        >
          {getShiftStatusText(selectedShift)}
        </div>
      </div>
    )

    // ── render ────────────────────────────────────────────────────────────────

    return (
      <>
        <div
          ref={ref}
          className={cn(
            "w-full overflow-hidden rounded-[28px] border border-border",
            "bg-card p-5",
            "text-card-foreground shadow-[0_18px_40px_-28px_rgba(15,23,42,0.24)]",
            className,
          )}
          {...props}
        >
          {/* ── Row 1: view switcher + today ── */}
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex rounded-full border border-border bg-secondary/80 p-1 shadow-xs">
              <button
                type="button"
                onClick={() => handleViewChange("week")}
                className={cn(
                  "rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
                  resolvedView === "week"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t("planner_week")}
              </button>
              <button
                type="button"
                onClick={() => handleViewChange("month")}
                className={cn(
                  "rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
                  resolvedView === "month"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t("planner_month")}
              </button>
            </div>

            {onToday ? (
              <button
                type="button"
                onClick={onToday}
                className="rounded-full border border-border bg-secondary/80 px-4 py-1.5 text-xs font-semibold text-muted-foreground shadow-xs transition-colors hover:text-foreground"
              >
                {t("planner_today")}
              </button>
            ) : null}
          </div>

          {/* ── Row 2: month title + nav arrows ── */}
          <div className="mt-5 flex items-center justify-between gap-3">
            <div
              key={`${resolvedView}-${resolvedTitle}-${resolvedSubtitle}`}
              className="min-w-0 animate-in fade-in-0 slide-in-from-top-1 duration-200"
            >
              {resolvedView === "month" ? (
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="text-3xl font-semibold tracking-tight leading-none">{resolvedTitle}</span>
                  {resolvedSubtitle ? (
                    <span className="text-lg font-medium text-muted-foreground shrink-0">{resolvedSubtitle}</span>
                  ) : null}
                </div>
              ) : (
                <>
                  <div className="truncate text-3xl font-semibold tracking-tight">{resolvedTitle}</div>
                  {resolvedSubtitle ? (
                    <div className="mt-1 text-xs text-muted-foreground">{resolvedSubtitle}</div>
                  ) : null}
                </>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {headerEnd ? (
                <div className="mr-1 flex items-center">{headerEnd}</div>
              ) : showFilters ? (
                <button
                  type="button"
                  onClick={() => setIsFilterOpen(true)}
                  className={cn(
                    "relative mr-1 flex shrink-0 items-center gap-2 rounded-full border border-border bg-secondary/80 px-4 py-1.5 text-xs font-semibold transition-colors shadow-xs",
                    hasActiveFilters
                      ? "border-orange-300/60 bg-orange-500/10 text-orange-600"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <SlidersHorizontal className="size-3.5" />
                  {t("planner_filters")}
                  {activeFilterCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              ) : null}
              <button
                type="button"
                onClick={handlePrev}
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                aria-label={t("planner_prev_period")}
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                aria-label={t("planner_next_period")}
              >
                <ChevronRight className="size-5" />
              </button>
            </div>
          </div>

          {/* ── Toolbar slot (MonthPicker, bulk buttons, filter dropdowns) ── */}
          {toolbar ? <div className="mt-4">{toolbar}</div> : null}

          {/* ── Active filter chips (only in self-contained mode) ── */}
          {!toolbar && hasActiveFilters ? (
            <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
              {selectedEmployee && (
                <FilterChip label={selectedEmployee.name} onRemove={() => handleFilterChange("employeeId", null)} />
              )}
              {filters.position && (
                <FilterChip label={filters.position} onRemove={() => handleFilterChange("position", null)} />
              )}
              {selectedStatus && <FilterChip label={t(selectedStatus.labelKey)} onRemove={() => handleFilterChange("status", null)} />}
              <button
                onClick={clearAllFilters}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap px-2 py-1"
              >
                {t("common_reset")}
              </button>
            </div>
          ) : null}

          {/* ── Weekday headers ── */}
          {resolvedView === "month" ? (
            <div className="mt-5">
              <div className="grid grid-cols-7 gap-1.5 text-center">
                {weekdayLabels.map((label, idx) => (
                  <div
                    key={label}
                    className={cn(
                      "text-[11px] font-medium py-1",
                      idx >= 5 ? "text-orange-400/80" : "text-muted-foreground",
                    )}
                  >
                    {label}
                  </div>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-7 gap-1.5">{renderMonthGrid()}</div>
            </div>
          ) : (
            <div className="mt-5">
              <div className="grid grid-cols-7 gap-1.5 text-center">
                {weekdayLabels.map((label, idx) => (
                  <div
                    key={label}
                    className={cn(
                      "text-[11px] font-medium py-1",
                      idx >= 5 ? "text-orange-400/80" : "text-muted-foreground",
                    )}
                  >
                    {label}
                  </div>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-7 gap-1.5">{renderWeekGrid()}</div>
            </div>
          )}

          {/* ── Footer ── */}
          <div className="mt-4 pt-4 border-t border-border">
            {footer ?? (!days ? defaultFooter : null)}
          </div>
        </div>

        {/* Mobile filter bottom sheet */}
        {showFilters && !headerEnd ? (
          <FilterBottomSheet
            isOpen={isFilterOpen}
            onClose={() => setIsFilterOpen(false)}
            filters={filters}
            onFilterChange={handleFilterChange}
            employees={employees}
            positions={positions}
            onClearAll={clearAllFilters}
          />
        ) : null}
      </>
    )
  },
)

ScheduleCalendar.displayName = "ScheduleCalendar"
