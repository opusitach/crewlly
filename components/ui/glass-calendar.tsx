"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, Settings } from "lucide-react"
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns"
import { cn } from "@/lib/utils"

export type GlassCalendarView = "week" | "month"

export interface GlassCalendarDay {
  date: Date
  isToday?: boolean
  isSelected?: boolean
  isCurrentMonth?: boolean
  isDisabled?: boolean
  hasEvent?: boolean
  hasConflict?: boolean
  eventCount?: number
  helperText?: string
  isRangeHighlight?: boolean
  continuesRangeFromPrev?: boolean
  continuesRangeToNext?: boolean
  onDoubleClick?: () => void
}

export interface GlassCalendarProps extends React.HTMLAttributes<HTMLDivElement> {
  view?: GlassCalendarView
  defaultView?: GlassCalendarView
  selectedDate?: Date
  displayMonth?: Date
  days?: GlassCalendarDay[]
  weekdayLabels?: string[]
  title?: string
  subtitle?: string
  toolbar?: React.ReactNode
  footer?: React.ReactNode
  headerEnd?: React.ReactNode
  showSettings?: boolean
  onDateSelect?: (date: Date) => void
  onViewChange?: (view: GlassCalendarView) => void
  onDisplayMonthChange?: (date: Date) => void
  onPrev?: () => void
  onNext?: () => void
  onSettingsClick?: () => void
}

const DEFAULT_WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

const capitalize = (value: string) => (value.length > 0 ? value.charAt(0).toUpperCase() + value.slice(1) : value)

function getWeekdayLabel(date: Date, labels: string[]) {
  const weekdayIndex = (date.getDay() + 6) % 7
  return labels[weekdayIndex] ?? format(date, "EEEEE")
}

function buildDefaultDays(view: GlassCalendarView, displayMonth: Date, selectedDate: Date): GlassCalendarDay[] {
  if (view === "week") {
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 })

    return eachDayOfInterval({ start: weekStart, end: weekEnd }).map((date) => ({
      date,
      isToday: isToday(date),
      isSelected: isSameDay(date, selectedDate),
      isCurrentMonth: isSameMonth(date, displayMonth),
    }))
  }

  const monthStart = startOfMonth(displayMonth)
  const monthEnd = endOfMonth(displayMonth)
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })

  return eachDayOfInterval({ start: calendarStart, end: calendarEnd }).map((date) => ({
    date,
    isToday: isToday(date),
    isSelected: isSameDay(date, selectedDate),
    isCurrentMonth: isSameMonth(date, displayMonth),
  }))
}

export const GlassCalendar = React.forwardRef<HTMLDivElement, GlassCalendarProps>(
  (
    {
      className,
      view,
      defaultView = "month",
      selectedDate: selectedDateProp,
      displayMonth: displayMonthProp,
      days,
      weekdayLabels = DEFAULT_WEEKDAY_LABELS,
      title,
      subtitle,
      toolbar,
      footer,
      headerEnd,
      showSettings = true,
      onDateSelect,
      onViewChange,
      onDisplayMonthChange,
      onPrev,
      onNext,
      onSettingsClick,
      ...props
    },
    ref,
  ) => {
    const [uncontrolledView, setUncontrolledView] = React.useState<GlassCalendarView>(defaultView)
    const [internalSelectedDate, setInternalSelectedDate] = React.useState(selectedDateProp ?? new Date())
    const [internalDisplayMonth, setInternalDisplayMonth] = React.useState(displayMonthProp ?? selectedDateProp ?? new Date())

    React.useEffect(() => {
      if (selectedDateProp) {
        setInternalSelectedDate(selectedDateProp)
      }
    }, [selectedDateProp])

    React.useEffect(() => {
      if (displayMonthProp) {
        setInternalDisplayMonth(displayMonthProp)
      }
    }, [displayMonthProp])

    const resolvedView = view ?? uncontrolledView
    const resolvedSelectedDate = selectedDateProp ?? internalSelectedDate
    const resolvedDisplayMonth = displayMonthProp ?? internalDisplayMonth

    const resolvedDays = React.useMemo(() => {
      const sourceDays = days ?? buildDefaultDays(resolvedView, resolvedDisplayMonth, resolvedSelectedDate)
      return sourceDays.map((day) => ({
        ...day,
        isToday: day.isToday ?? isToday(day.date),
        isSelected: day.isSelected ?? isSameDay(day.date, resolvedSelectedDate),
        isCurrentMonth: day.isCurrentMonth ?? isSameMonth(day.date, resolvedDisplayMonth),
        hasEvent: day.hasEvent ?? (day.eventCount ?? 0) > 0,
        eventCount: day.eventCount ?? 0,
      }))
    }, [days, resolvedDisplayMonth, resolvedSelectedDate, resolvedView])

    const resolvedTitle = React.useMemo(() => {
      if (title) return title
      return capitalize(format(resolvedDisplayMonth, "MMMM"))
    }, [resolvedDisplayMonth, title])

    const resolvedSubtitle = React.useMemo(() => {
      if (subtitle) return subtitle
      if (resolvedView === "week" && resolvedDays.length > 0) {
        const start = resolvedDays[0]?.date
        const end = resolvedDays[resolvedDays.length - 1]?.date
        if (start && end) {
          return `${format(start, "d MMM")} - ${format(end, "d MMM yyyy")}`
        }
      }
      return format(resolvedDisplayMonth, "yyyy")
    }, [resolvedDays, resolvedDisplayMonth, resolvedView, subtitle])

    const handleViewChange = (nextView: GlassCalendarView) => {
      if (view === undefined) {
        setUncontrolledView(nextView)
      }
      onViewChange?.(nextView)
    }

    const handleDateClick = (date: Date) => {
      if (selectedDateProp === undefined) {
        setInternalSelectedDate(date)
      }
      if (displayMonthProp === undefined) {
        setInternalDisplayMonth(date)
      }
      onDateSelect?.(date)
    }

    const updateDisplayMonth = (nextDate: Date) => {
      if (displayMonthProp === undefined) {
        setInternalDisplayMonth(nextDate)
      }
      onDisplayMonthChange?.(nextDate)
    }

    const handlePrev = () => {
      if (onPrev) {
        onPrev()
        return
      }

      if (resolvedView === "week") {
        const nextDate = addDays(resolvedSelectedDate, -7)
        if (selectedDateProp === undefined) {
          setInternalSelectedDate(nextDate)
        }
        updateDisplayMonth(nextDate)
        onDateSelect?.(nextDate)
        return
      }

      updateDisplayMonth(subMonths(resolvedDisplayMonth, 1))
    }

    const handleNext = () => {
      if (onNext) {
        onNext()
        return
      }

      if (resolvedView === "week") {
        const nextDate = addDays(resolvedSelectedDate, 7)
        if (selectedDateProp === undefined) {
          setInternalSelectedDate(nextDate)
        }
        updateDisplayMonth(nextDate)
        onDateSelect?.(nextDate)
        return
      }

      updateDisplayMonth(addMonths(resolvedDisplayMonth, 1))
    }

    const renderMonthDay = (day: GlassCalendarDay) => {
      const dateKey = format(day.date, "yyyy-MM-dd")

      return (
        <div key={dateKey} className="relative flex min-h-14 items-center justify-center">
          {day.isRangeHighlight ? (
            <div
              className={cn(
                "absolute inset-y-1 left-0 right-0 border border-primary/20 bg-primary/8",
                day.continuesRangeFromPrev && day.continuesRangeToNext
                  ? "rounded-none border-x-0"
                  : day.continuesRangeFromPrev
                    ? "rounded-r-full border-l-0"
                    : day.continuesRangeToNext
                      ? "rounded-l-full border-r-0"
                      : "rounded-full",
              )}
            />
          ) : null}
          <button
            type="button"
            disabled={day.isDisabled}
            onClick={() => handleDateClick(day.date)}
            onDoubleClick={day.onDoubleClick}
            className={cn(
              "relative z-10 flex size-11 flex-col items-center justify-center rounded-[16px] border text-sm font-semibold tabular-nums transition-all duration-200",
              day.isSelected
                ? "border-primary bg-primary text-primary-foreground shadow-xs"
                : "border-border/80 bg-background/90 text-foreground hover:bg-accent hover:text-accent-foreground",
              !day.isCurrentMonth && !day.isSelected && "bg-muted/45 text-muted-foreground/70",
              day.isToday && !day.isSelected && "border-primary/35 text-primary",
              day.isDisabled && "cursor-not-allowed opacity-50",
            )}
          >
            <span>{format(day.date, "d")}</span>
            {day.hasEvent ? (
              <span
                className={cn(
                  "mt-1 size-1.5 rounded-full",
                  day.hasConflict ? "bg-destructive" : day.isSelected ? "bg-primary-foreground" : "bg-primary",
                )}
              />
            ) : day.isToday && !day.isSelected ? (
              <span className="mt-1 size-1.5 rounded-full bg-primary" />
            ) : null}
          </button>
        </div>
      )
    }

    const renderWeekDay = (day: GlassCalendarDay) => {
      const dateKey = format(day.date, "yyyy-MM-dd")
      const weekdayLabel = getWeekdayLabel(day.date, weekdayLabels).toUpperCase()

      return (
        <button
          key={dateKey}
          type="button"
          disabled={day.isDisabled}
          onClick={() => handleDateClick(day.date)}
          onDoubleClick={day.onDoubleClick}
          className={cn(
            "min-w-0 rounded-[18px] border border-border bg-secondary/40 px-2 py-3 text-left transition-all duration-200 hover:bg-accent hover:text-accent-foreground",
            day.isSelected && "border-primary/30 bg-primary/10 shadow-sm",
            day.isDisabled && "cursor-not-allowed opacity-50",
          )}
        >
          <div className={cn("text-[10px] font-semibold tracking-[0.18em] text-muted-foreground", day.isToday && "text-primary")}>
            {weekdayLabel}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className={cn("text-2xl font-semibold text-foreground tabular-nums", day.isToday && !day.isSelected && "text-primary")}>
              {format(day.date, "d")}
            </div>
            {day.hasEvent ? (
              <span
                className={cn(
                  "size-2 rounded-full",
                  day.hasConflict ? "bg-destructive" : day.isSelected ? "bg-primary" : "bg-primary/75",
                )}
              />
            ) : null}
          </div>
          <div className="mt-2 truncate text-[11px] text-muted-foreground">{day.helperText ?? "Нет смен"}</div>
        </button>
      )
    }

    return (
      <div
        ref={ref}
        className={cn(
          "w-full overflow-hidden rounded-[28px] border border-border bg-card p-5 text-card-foreground shadow-[0_18px_40px_-28px_rgba(15,23,42,0.24)]",
          className,
        )}
        {...props}
      >
        <div className="flex items-center justify-between gap-3">
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
              Неделя
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
              Месяц
            </button>
          </div>
          {headerEnd ? (
            <div className="flex items-center gap-2">{headerEnd}</div>
          ) : showSettings ? (
            <button
              type="button"
              onClick={onSettingsClick}
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label="Открыть настройки календаря"
            >
              <Settings className="size-5" />
            </button>
          ) : null}
        </div>

        <div className="mt-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div
              key={`${resolvedView}-${resolvedTitle}-${resolvedSubtitle}`}
              className="animate-in fade-in-0 slide-in-from-top-1 duration-200"
            >
              <div className="truncate text-3xl font-semibold tracking-tight">{resolvedTitle}</div>
              {resolvedSubtitle ? <div className="mt-1 text-xs text-muted-foreground">{resolvedSubtitle}</div> : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handlePrev}
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label="Предыдущий период"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label="Следующий период"
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
        </div>

        {toolbar ? <div className="mt-4">{toolbar}</div> : null}

        {resolvedView === "month" ? (
          <div className="mt-5">
            <div className="grid grid-cols-7 gap-2 text-center">
              {weekdayLabels.map((dayLabel) => (
                <div key={dayLabel} className="text-[11px] font-medium text-muted-foreground">
                  {dayLabel}
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-7 gap-2">{resolvedDays.map(renderMonthDay)}</div>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-7 gap-2">{resolvedDays.map(renderWeekDay)}</div>
        )}

        {footer ? <div className="mt-4">{footer}</div> : null}
      </div>
    )
  },
)

GlassCalendar.displayName = "GlassCalendar"
