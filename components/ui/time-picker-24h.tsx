'use client'

import * as React from 'react'

import { normalizeTimeValue } from '@/lib/utils/time-utils'
import { cn } from '@/lib/utils'

type TimePicker24hProps = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
  label?: string
  testId?: string
}

type TimeInputWithPicker = HTMLInputElement & {
  showPicker?: () => void
}

const TIME_STEP_SECONDS = 5 * 60
const MAX_STEPPED_MINUTES = 23 * 60 + 55

const snapToFiveMinutes = (value: string) => {
  const normalized = normalizeTimeValue(value, '00:00')
  const [hours, minutes] = normalized.split(':').map(Number)
  const totalMinutes = hours * 60 + minutes
  const snappedMinutes = Math.min(MAX_STEPPED_MINUTES, Math.round(totalMinutes / 5) * 5)
  const nextHours = Math.floor(snappedMinutes / 60)
  const nextMinutes = snappedMinutes % 60
  return `${nextHours.toString().padStart(2, '0')}:${nextMinutes.toString().padStart(2, '0')}`
}

function TimePicker24h({
  value,
  onChange,
  disabled = false,
  className,
  label,
  testId,
}: TimePicker24hProps) {
  const safeValue = React.useMemo(() => normalizeTimeValue(value, '00:00'), [value])
  const handleClick = React.useCallback((event: React.MouseEvent<HTMLInputElement>) => {
    const input = event.currentTarget as TimeInputWithPicker
    if (typeof input.showPicker !== 'function') return

    try {
      input.showPicker()
    } catch {
      // Ignore browsers that expose showPicker but reject the call for this control.
    }
  }, [])

  return (
    <input
      type="time"
      lang="en-GB"
      step={TIME_STEP_SECONDS}
      value={safeValue}
      aria-label={label ? `Выбрать время: ${label}` : 'Выбрать время'}
      data-testid={testId}
      disabled={disabled}
      onClick={handleClick}
      onChange={(event) => onChange(snapToFiveMinutes(event.target.value))}
      className={cn(
        'h-14 w-full rounded-[1.1rem] border border-white/70 bg-white/92 px-4 text-lg font-semibold tabular-nums text-slate-900 shadow-sm outline-none transition-all hover:bg-white focus-visible:border-white focus-visible:ring-4 focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
    />
  )
}

export { TimePicker24h }
