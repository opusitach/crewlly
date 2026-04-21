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
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "rounded-full border-border/80 bg-background/90 text-foreground shadow-xs hover:bg-accent",
            showIcon ? "gap-2 px-3" : "gap-0 px-3",
          )}
        >
          {showIcon && <Calendar className="h-4 w-4" />}
          <span className="font-semibold">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 rounded-[24px] border border-border bg-popover p-4 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.24)]">
        <div className="mb-3 flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => setYear((prev) => prev - 1)} className="size-8 rounded-full">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-semibold">{year}</div>
          <Button variant="ghost" size="icon" onClick={() => setYear((prev) => prev + 1)} className="size-8 rounded-full">
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
                  "mx-auto h-8 w-16 rounded-full border border-transparent text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                  isCurrent && "border-primary/20 bg-primary/10 text-primary",
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
