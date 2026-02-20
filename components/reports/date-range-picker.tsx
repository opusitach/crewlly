"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { X, ChevronLeft, ChevronRight } from "lucide-react"
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isAfter,
  isBefore,
  subDays,
  startOfDay,
} from "date-fns"
import { ru } from "date-fns/locale"

interface DateRangePickerProps {
  isOpen: boolean
  onClose: () => void
  startDate: Date | null
  endDate: Date | null
  onApply: (start: Date, end: Date) => void
}

export default function DateRangePicker({ isOpen, onClose, startDate, endDate, onApply }: DateRangePickerProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedStart, setSelectedStart] = useState<Date | null>(startDate)
  const [selectedEnd, setSelectedEnd] = useState<Date | null>(endDate)
  const [error, setError] = useState<string>("")

  if (!isOpen) return null

  const today = startOfDay(new Date())

  const presets = [
    { label: "Сегодня", getValue: () => ({ start: today, end: today }) },
    { label: "Вчера", getValue: () => ({ start: subDays(today, 1), end: subDays(today, 1) }) },
    { label: "Последние 7 дней", getValue: () => ({ start: subDays(today, 6), end: today }) },
    { label: "Последние 30 дней", getValue: () => ({ start: subDays(today, 29), end: today }) },
    { label: "Этот месяц", getValue: () => ({ start: startOfMonth(today), end: today }) },
    {
      label: "Прошлый месяц",
      getValue: () => {
        const lastMonth = subDays(startOfMonth(today), 1)
        return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) }
      },
    },
  ]

  const handlePresetClick = (preset: (typeof presets)[0]) => {
    const { start, end } = preset.getValue()
    setSelectedStart(start)
    setSelectedEnd(end)
    setError("")
  }

  const handleDateClick = (date: Date) => {
    // Don't allow future dates
    if (isAfter(date, today)) {
      setError("Нельзя выбирать будущие даты")
      return
    }

    setError("")

    if (!selectedStart || (selectedStart && selectedEnd)) {
      // Start new selection
      setSelectedStart(date)
      setSelectedEnd(null)
    } else {
      // Complete selection
      if (isBefore(date, selectedStart)) {
        // Swap if end is before start
        setSelectedEnd(selectedStart)
        setSelectedStart(date)
      } else {
        setSelectedEnd(date)
      }
    }
  }

  const handleApply = () => {
    if (selectedStart && selectedEnd) {
      onApply(selectedStart, selectedEnd)
      onClose()
    }
  }

  const handleReset = () => {
    setSelectedStart(null)
    setSelectedEnd(null)
    setError("")
  }

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd })

  const isDateInRange = (date: Date) => {
    if (!selectedStart) return false
    if (!selectedEnd) return isSameDay(date, selectedStart)
    return (
      (isAfter(date, selectedStart) || isSameDay(date, selectedStart)) &&
      (isBefore(date, selectedEnd) || isSameDay(date, selectedEnd))
    )
  }

  const isDateSelected = (date: Date) => {
    return (selectedStart && isSameDay(date, selectedStart)) || (selectedEnd && isSameDay(date, selectedEnd))
  }

  const canApply = selectedStart && selectedEnd

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end">
      <div className="bg-card text-card-foreground flex flex-col gap-4 rounded-xl border py-6 rounded-t-3xl rounded-b-none border-b-0 shadow-2xl overflow-hidden max-w-md mx-auto w-full animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">Выбрать период</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full h-8 w-8">
            <X className="h-5 w-5" strokeWidth={1.5} />
          </Button>
        </div>

        {/* Selected Range Display */}
        {selectedStart && selectedEnd && (
          <div className="px-4 pt-3 pb-2">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Выбранный период</p>
              <p className="font-semibold text-base mt-0.5">
                {format(selectedStart, "dd.MM.yyyy", { locale: ru })} —{" "}
                {format(selectedEnd, "dd.MM.yyyy", { locale: ru })}
              </p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="px-4 pb-2">
            <Card className="bg-destructive/10 border-destructive/20 p-2">
              <p className="text-xs text-destructive text-center">{error}</p>
            </Card>
          </div>
        )}

        {/* Presets */}
        <div className="px-4 py-3 border-b border-border">
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <Button
                key={preset.label}
                variant="secondary"
                size="sm"
                onClick={() => handlePresetClick(preset)}
                className="h-8 text-xs"
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Calendar */}
        <div className="p-4">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentMonth(subDays(startOfMonth(currentMonth), 1))}
              className="h-8 w-8 rounded-full"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
            </Button>
            <h3 className="font-semibold">{format(currentMonth, "LLLL yyyy", { locale: ru })}</h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                const nextMonth = new Date(currentMonth)
                nextMonth.setMonth(nextMonth.getMonth() + 1)
                if (!isAfter(startOfMonth(nextMonth), today)) {
                  setCurrentMonth(nextMonth)
                }
              }}
              disabled={isAfter(
                startOfMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)),
                today,
              )}
              className="h-8 w-8 rounded-full"
            >
              <ChevronRight className="h-5 w-5" strokeWidth={1.5} />
            </Button>
          </div>

          {/* Day Headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => (
              <div key={day} className="text-center text-xs font-medium text-muted-foreground py-1">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Empty cells for days before month start */}
            {Array.from({ length: (monthStart.getDay() + 6) % 7 }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}

            {/* Days */}
            {daysInMonth.map((day) => {
              const isInRange = isDateInRange(day)
              const isSelected = isDateSelected(day)
              const isFuture = isAfter(day, today)
              const isToday = isSameDay(day, today)

              return (
                <button
                  key={day.toString()}
                  onClick={() => handleDateClick(day)}
                  disabled={isFuture}
                  className={`
                    relative h-10 w-full rounded-lg text-sm font-medium transition-all
                    ${isFuture ? "text-muted-foreground/30 cursor-not-allowed" : ""}
                    ${isSelected ? "bg-primary text-primary-foreground shadow-sm" : ""}
                    ${isInRange && !isSelected ? "bg-primary/10" : ""}
                    ${!isInRange && !isSelected && !isFuture ? "hover:bg-accent" : ""}
                    ${isToday && !isSelected ? "ring-1 ring-primary" : ""}
                  `}
                >
                  {format(day, "d")}
                </button>
              )
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 pt-2 pb-safe flex gap-2 border-t border-border">
          <Button variant="outline" onClick={handleReset} className="flex-1 h-11 bg-transparent">
            Сбросить
          </Button>
          <Button onClick={handleApply} disabled={!canApply} className="flex-1 h-11">
            Применить
          </Button>
        </div>
      </div>
    </div>
  )
}
