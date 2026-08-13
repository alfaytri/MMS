'use client'

import { useMemo, useState } from 'react'
import {
  startOfMonth, endOfMonth, subMonths,
  startOfQuarter, endOfQuarter,
  startOfYear, endOfYear,
  format, parseISO, isValid,
} from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export type DateRange = { start: string; end: string }

type Props = {
  value: DateRange
  onChange: (range: DateRange) => void
  className?: string
}

type PresetKey =
  | 'this-month' | 'last-month'
  | 'this-quarter' | 'this-year'
  | 'last-12m'    | 'custom'

function iso(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

export function presetRange(key: Exclude<PresetKey, 'custom'>, today = new Date()): DateRange {
  switch (key) {
    case 'this-month':   return { start: iso(startOfMonth(today)), end: iso(endOfMonth(today)) }
    case 'last-month': {
      const lm = subMonths(today, 1)
      return { start: iso(startOfMonth(lm)), end: iso(endOfMonth(lm)) }
    }
    case 'this-quarter': return { start: iso(startOfQuarter(today)), end: iso(endOfQuarter(today)) }
    case 'this-year':    return { start: iso(startOfYear(today)),    end: iso(endOfYear(today)) }
    case 'last-12m': {
      const start = subMonths(today, 11)
      return { start: iso(startOfMonth(start)), end: iso(endOfMonth(today)) }
    }
  }
}

function labelFor(range: DateRange): string {
  const s = parseISO(range.start)
  const e = parseISO(range.end)
  if (!isValid(s) || !isValid(e)) return 'Select range'

  if (iso(startOfMonth(s)) === range.start && iso(endOfMonth(s)) === range.end
      && s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return format(s, 'MMM yyyy')
  }
  if (iso(startOfYear(s)) === range.start && iso(endOfYear(s)) === range.end) {
    return format(s, 'yyyy')
  }
  if (s.getFullYear() === e.getFullYear()) {
    return `${format(s, 'MMM d')} – ${format(e, 'MMM d, yyyy')}`
  }
  return `${format(s, 'MMM d, yyyy')} – ${format(e, 'MMM d, yyyy')}`
}

export function DateRangePicker({ value, onChange, className }: Props) {
  const [open, setOpen] = useState(false)
  const [customStart, setCustomStart] = useState(value.start)
  const [customEnd, setCustomEnd]     = useState(value.end)

  const presets: { key: Exclude<PresetKey, 'custom'>; label: string }[] = useMemo(() => [
    { key: 'this-month',   label: 'This month' },
    { key: 'last-month',   label: 'Last month' },
    { key: 'this-quarter', label: 'This quarter' },
    { key: 'this-year',    label: 'This year' },
    { key: 'last-12m',     label: 'Last 12 months' },
  ], [])

  const applyPreset = (key: Exclude<PresetKey, 'custom'>) => {
    const range = presetRange(key)
    onChange(range)
    setCustomStart(range.start)
    setCustomEnd(range.end)
    setOpen(false)
  }

  const applyCustom = () => {
    if (!customStart || !customEnd) return
    if (customEnd < customStart) return
    onChange({ start: customStart, end: customEnd })
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(props) => (
          <Button
            {...props}
            type="button"
            variant="outline"
            className={cn(
              'h-9 min-h-11 md:min-h-0 min-w-[180px] justify-start font-normal',
              className,
            )}
          >
            <CalendarIcon className="h-4 w-4 mr-2 shrink-0 text-muted-foreground" />
            <span className="truncate">{labelFor(value)}</span>
          </Button>
        )}
      />
      <PopoverContent className="w-72 p-3" align="end">
        <div className="flex flex-col gap-1">
          {presets.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPreset(p.key)}
              className="text-left px-2 py-1.5 rounded-md text-sm hover:bg-accent transition-colors"
            >
              {p.label}
            </button>
          ))}
          <div className="border-t my-2" />
          <div className="text-xs text-muted-foreground px-2">Custom range</div>
          <div className="flex flex-col gap-2 px-2 pb-1">
            <input
              type="date"
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              aria-label="Start date"
            />
            <input
              type="date"
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              value={customEnd}
              min={customStart}
              onChange={(e) => setCustomEnd(e.target.value)}
              aria-label="End date"
            />
            <Button
              size="sm"
              className="h-8"
              onClick={applyCustom}
              disabled={!customStart || !customEnd || customEnd < customStart}
            >
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
