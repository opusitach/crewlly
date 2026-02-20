"use client"

import { useEffect, useMemo, useState } from "react"
import { format, isValid } from "date-fns"
import { ru } from "date-fns/locale"
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

function capitalize(label: string) {
  if (!label) return label
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function MonthPicker({
  currentDate,
  onChange,
  showIcon = true,
}: {
  currentDate: Date | string | number
  onChange: (date: Date) => void
  showIcon?: boolean
}) {
  const safeCurrentDate = useMemo(() => {
    const next = currentDate instanceof Date ? currentDate : new Date(currentDate)
    return isValid(next) ? next : new Date()
  }, [currentDate])
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(safeCurrentDate.getFullYear())

  useEffect(() => {
    setYear(safeCurrentDate.getFullYear())
  }, [safeCurrentDate])

  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => new Date(year, i, 1)), [year])
  const currentMonth = safeCurrentDate.getMonth()
  const currentYear = safeCurrentDate.getFullYear()
  const label = capitalize(format(safeCurrentDate, "LLLL yyyy", { locale: ru }))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className={cn("px-1", showIcon ? "gap-2" : "gap-0")}>
          {showIcon && <Calendar className="h-4 w-4" />}
          <span className="font-semibold">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4 rounded-3xl border border-slate-200 shadow-[0_12px_30px_rgba(15,23,42,0.12)]">
        <div className="flex items-center justify-between mb-3">
          <Button variant="ghost" size="icon" onClick={() => setYear((prev) => prev - 1)} className="h-8 w-8">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-semibold">{year}</div>
          <Button variant="ghost" size="icon" onClick={() => setYear((prev) => prev + 1)} className="h-8 w-8">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-y-3 text-center">
          {months.map((month, idx) => {
            const isCurrent = year === currentYear && idx === currentMonth
            return (
              <button
                key={month.toISOString()}
                onClick={() => {
                  onChange(new Date(year, idx, 1))
                  setOpen(false)
                }}
                className={cn(
                  "mx-auto h-8 w-16 rounded-full text-xs font-medium text-slate-700",
                  "transition-colors hover:bg-slate-100",
                  isCurrent && "border-2 border-[#F28A2E] text-slate-900",
                )}
              >
                {capitalize(format(month, "LLL", { locale: ru }))}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
