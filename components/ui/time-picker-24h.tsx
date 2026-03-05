'use client'

import * as React from 'react'
import { Clock3 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { buildTimeValue, normalizeTimeValue, splitTimeValue, stepTimeValue } from '@/lib/utils/time-utils'
import { cn } from '@/lib/utils'

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => index.toString().padStart(2, '0'))
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => index.toString().padStart(2, '0'))

type TimePicker24hProps = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
  label?: string
  presets?: string[]
  testId?: string
}

function TimePicker24h({
  value,
  onChange,
  disabled = false,
  className,
  label,
  presets = [],
  testId,
}: TimePicker24hProps) {
  const [open, setOpen] = React.useState(false)
  const safeValue = React.useMemo(() => normalizeTimeValue(value, '00:00'), [value])
  const { hours, minutes } = React.useMemo(() => splitTimeValue(safeValue), [safeValue])

  const quickActions = React.useMemo(
    () => [
      { label: '-15 мин', value: stepTimeValue(safeValue, -15) },
      { label: '+15 мин', value: stepTimeValue(safeValue, 15) },
      { label: '+1 час', value: stepTimeValue(safeValue, 60) },
    ],
    [safeValue],
  )

  const normalizedPresets = React.useMemo(
    () => Array.from(new Set(presets.map((preset) => normalizeTimeValue(preset, safeValue)))),
    [presets, safeValue],
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label ? `Выбрать время: ${label}` : 'Выбрать время'}
          disabled={disabled}
          data-testid={testId}
          className={cn(
            'flex h-14 w-full items-center justify-between rounded-[1.1rem] border border-white/70 bg-white/90 px-3 text-left shadow-sm transition-all outline-none hover:bg-white focus-visible:border-white focus-visible:ring-4 focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-60',
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-100 via-amber-50 to-white text-orange-600 shadow-inner">
              <Clock3 className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-lg font-semibold tabular-nums text-slate-900">{safeValue}</span>
              <span className="block text-[10px] font-medium uppercase tracking-[0.22em] text-slate-500">
                24-часовой формат
              </span>
            </span>
          </span>
          <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
            24h
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-80 max-w-[calc(100vw-2rem)] rounded-[1.75rem] border-white/80 bg-white/95 p-3 shadow-[0_24px_80px_rgba(15,23,42,0.18)] backdrop-blur-md"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-500">
              {label ?? 'Время'}
            </div>
            <div className="mt-1 text-3xl font-semibold tracking-tight tabular-nums text-slate-900">
              {safeValue}
            </div>
          </div>
          <div className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[11px] font-semibold text-orange-700">
            24 часа
          </div>
        </div>

        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <Select
            value={hours}
            onValueChange={(nextHours) => onChange(buildTimeValue(nextHours, minutes))}
            disabled={disabled}
          >
            <SelectTrigger className="h-14 w-full rounded-2xl border-slate-200 bg-slate-50/90 text-base font-semibold tabular-nums text-slate-900 shadow-none">
              <SelectValue placeholder="Часы" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-slate-200 bg-white/95 shadow-[0_16px_40px_rgba(15,23,42,0.14)]">
              {HOUR_OPTIONS.map((hour) => (
                <SelectItem key={hour} value={hour} className="rounded-xl text-base font-semibold tabular-nums">
                  {hour}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="text-2xl font-semibold text-slate-300">:</div>

          <Select
            value={minutes}
            onValueChange={(nextMinutes) => onChange(buildTimeValue(hours, nextMinutes))}
            disabled={disabled}
          >
            <SelectTrigger className="h-14 w-full rounded-2xl border-slate-200 bg-slate-50/90 text-base font-semibold tabular-nums text-slate-900 shadow-none">
              <SelectValue placeholder="Минуты" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-slate-200 bg-white/95 shadow-[0_16px_40px_rgba(15,23,42,0.14)]">
              {MINUTE_OPTIONS.map((minute) => (
                <SelectItem key={minute} value={minute} className="rounded-xl text-base font-semibold tabular-nums">
                  {minute}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {quickActions.map((action) => (
            <Button
              key={action.label}
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-2xl bg-slate-100/80 text-slate-700 hover:bg-slate-200/80"
              onClick={() => onChange(action.value)}
            >
              {action.label}
            </Button>
          ))}
        </div>

        {normalizedPresets.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">Быстрый выбор</div>
            <div className="flex flex-wrap gap-2">
              {normalizedPresets.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold tabular-nums text-slate-700 hover:bg-slate-50',
                    preset === safeValue && 'border-orange-300 bg-orange-50 text-orange-700',
                  )}
                  onClick={() => onChange(preset)}
                >
                  {preset}
                </Button>
              ))}
            </div>
          </div>
        )}

        <Button
          type="button"
          className="mt-4 h-10 w-full rounded-2xl bg-slate-900 text-white hover:bg-slate-800"
          onClick={() => setOpen(false)}
        >
          Готово
        </Button>
      </PopoverContent>
    </Popover>
  )
}

export { TimePicker24h }
