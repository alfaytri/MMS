'use client'

import { useState, useEffect, useMemo } from 'react'
import { isToday, parseISO } from 'date-fns'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

// Generate 48 time slots: 00:00, 00:30, 01:00, ... 23:30
const TIME_SLOTS: { value: string; label: string }[] = []
for (let h = 0; h < 24; h++) {
  for (const m of [0, 30]) {
    const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    const period = h < 12 ? 'AM' : 'PM'
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
    const label = `${h12}:${String(m).padStart(2, '0')} ${period}`
    TIME_SLOTS.push({ value, label })
  }
}

function useNowMinutes(enabled: boolean): number | null {
  const [minutes, setMinutes] = useState<number | null>(null)
  useEffect(() => {
    if (!enabled) { setMinutes(null); return }
    const tick = () => {
      const n = new Date()
      setMinutes(n.getHours() * 60 + n.getMinutes())
    }
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [enabled])
  return minutes
}

/** Convert "HH:MM" to total minutes for comparison */
function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function formatTime12h(t: string): string {
  const h = parseInt(t)
  const m = t.split(':')[1]
  const period = h < 12 ? 'AM' : 'PM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${m} ${period}`
}

interface TimeRangeSelectProps {
  fromTime: string | null | undefined
  toTime: string | null | undefined
  onChange: (fromTime: string | null, toTime: string | null) => void
  disabled?: boolean
  /** Compact variant for per-service cards (smaller text, tighter spacing) */
  compact?: boolean
  /** When set and the date is today, past time slots are hidden */
  visitDate?: string
}

export function TimeRangeSelect({
  fromTime,
  toTime,
  onChange,
  disabled = false,
  compact = false,
  visitDate,
}: TimeRangeSelectProps) {
  const from = fromTime ?? null
  const to = toTime ?? null

  const dateIsToday = !!visitDate && isToday(parseISO(visitDate))
  const nowMinutes = useNowMinutes(dateIsToday)

  const fromSlots = useMemo(() => {
    if (!dateIsToday || nowMinutes === null) return TIME_SLOTS
    return TIME_SLOTS.filter((s) => toMinutes(s.value) >= nowMinutes)
  }, [dateIsToday, nowMinutes])

  // "To" options: only slots strictly after the selected "From"
  const toSlots = from
    ? TIME_SLOTS.filter((s) => toMinutes(s.value) > toMinutes(from))
    : TIME_SLOTS

  const hasSelection = !!from

  return (
    <div className={cn('flex items-center gap-2', compact ? 'gap-1.5' : 'gap-2')}>
      {/* From */}
      <div className="flex-1 min-w-0">
        {!compact && (
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
            From
          </span>
        )}
        <Select
          value={from ?? ''}
          onValueChange={(v) => {
            const newFrom = v || null
            // If current "To" is not after new "From", clear it
            if (newFrom && to && toMinutes(to) <= toMinutes(newFrom)) {
              onChange(newFrom, null)
            } else {
              onChange(newFrom, to)
            }
          }}
          disabled={disabled}
        >
          <SelectTrigger className={cn('w-full', compact ? 'h-7 text-xs' : 'h-8 text-xs')}>
            <SelectValue placeholder={compact ? 'From' : 'Select time'} />
          </SelectTrigger>
          <SelectContent className="max-h-56">
            {fromSlots.map((s) => (
              <SelectItem key={s.value} value={s.value} className="text-xs">
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Arrow */}
      <span className={cn('shrink-0 text-slate-400', compact ? 'text-xs pt-0' : 'text-sm pt-4')}>→</span>

      {/* To */}
      <div className="flex-1 min-w-0">
        {!compact && (
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
            To
          </span>
        )}
        <Select
          value={to ?? ''}
          onValueChange={(v) => onChange(from, v || null)}
          disabled={disabled || !from}
        >
          <SelectTrigger className={cn('w-full', compact ? 'h-7 text-xs' : 'h-8 text-xs')}>
            <SelectValue placeholder={compact ? 'To' : 'Select time'} />
          </SelectTrigger>
          <SelectContent className="max-h-56">
            {toSlots.map((s) => (
              <SelectItem key={s.value} value={s.value} className="text-xs">
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Clear button */}
      {hasSelection && !disabled && (
        <button
          type="button"
          onClick={() => onChange(null, null)}
          className={cn(
            'shrink-0 rounded p-1 text-slate-400 hover:text-red-500 transition-colors',
            compact ? 'mt-0' : 'mt-4',
          )}
          aria-label="Clear time range"
        >
          <X className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
        </button>
      )}
    </div>
  )
}
