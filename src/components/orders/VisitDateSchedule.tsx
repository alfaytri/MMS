'use client'
import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Copy, Check, AlertTriangle, Loader2 } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDateAvailability } from '@/hooks/useDateAvailability'
import type { VisitDateWindow } from '@/types/orders'

// 30-minute slots 06:00 – 22:00
const TIME_OPTIONS: string[] = []
for (let h = 6; h <= 22; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:00`)
  if (h < 22) TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:30`)
}

interface Props {
  windows: VisitDateWindow[]
  onChange: (windows: VisitDateWindow[]) => void
}

export function VisitDateSchedule({ windows, onChange }: Props) {
  const [appliedDates, setAppliedDates] = useState<Set<string>>(new Set())

  const sorted = [...windows].sort((a, b) => a.date.localeCompare(b.date))

  // First row with both times filled is the "Apply to all" source
  const sourceWindow = sorted.find((w) => w.fromTime && w.toTime) ?? null

  // Dates eligible for conflict check: empty rows other than source
  const datesToCheck = sourceWindow
    ? sorted
        .filter((w) => w.date !== sourceWindow.date && (!w.fromTime || !w.toTime))
        .map((w) => w.date)
    : []

  const {
    data: availability = [],
    isLoading: isCheckingAvailability,
  } = useDateAvailability(
    datesToCheck,
    sourceWindow?.fromTime ?? null,
    sourceWindow?.toTime ?? null
  )

  const availabilityMap = new Map(availability.map((a) => [a.visit_date, a.available_teams_count]))

  function updateWindow(date: string, patch: Partial<VisitDateWindow>) {
    onChange(windows.map((w) => (w.date === date ? { ...w, ...patch } : w)))
    // Clear applied marker when user manually edits a row
    if (appliedDates.has(date)) {
      setAppliedDates((prev) => {
        const next = new Set(prev)
        next.delete(date)
        return next
      })
    }
  }

  function getToOptions(fromTime: string | null): string[] {
    if (!fromTime) return TIME_OPTIONS
    const idx = TIME_OPTIONS.indexOf(fromTime)
    return idx === -1 ? TIME_OPTIONS : TIME_OPTIONS.slice(idx + 1)
  }

  function handleApplyToAll() {
    if (!sourceWindow?.fromTime || !sourceWindow?.toTime) return
    const newApplied = new Set(appliedDates)
    const updated = windows.map((w) => {
      if (w.date === sourceWindow.date) return w
      if (w.fromTime && w.toTime) return w          // already has a custom window
      const avail = availabilityMap.get(w.date)
      if (avail === 0) return w                      // conflicted — skip
      newApplied.add(w.date)
      return { ...w, fromTime: sourceWindow.fromTime, toTime: sourceWindow.toTime }
    })
    setAppliedDates(newApplied)
    onChange(updated)
  }

  const hasOtherEmptyRows = sorted.some(
    (w) => w.date !== sourceWindow?.date && (!w.fromTime || !w.toTime)
  )
  // Apply button disabled while availability query is in-flight (review fix: race condition)
  const showApplyButton = !!sourceWindow && hasOtherEmptyRows && sorted.length > 1

  if (sorted.length === 0) return null

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Requested Arrival Window
      </Label>

      <div className="space-y-2">
        {sorted.map((w) => {
          const isSource = w.date === sourceWindow?.date
          const isApplied = appliedDates.has(w.date)
          const avail = availabilityMap.get(w.date)
          // Only show "No availability" after the query has returned (not while loading)
          const isConflicted = !isCheckingAvailability && avail === 0
          const toOptions = getToOptions(w.fromTime)

          return (
            <div key={w.date} className="flex flex-wrap items-center gap-2">
              {/* Date label */}
              <span className="w-24 shrink-0 text-xs text-slate-600">
                {format(parseISO(w.date), 'd MMM yyyy')}
              </span>

              {/* From time */}
              <Select
                value={w.fromTime ?? ''}
                onValueChange={(v) => {
                  const fromTime = v || null
                  // Reset toTime when fromTime changes to prevent invalid ranges
                  const toTime =
                    w.toTime && fromTime && w.toTime > fromTime ? w.toTime : null
                  updateWindow(w.date, { fromTime, toTime })
                }}
              >
                <SelectTrigger className="h-8 w-[90px] text-xs">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t} className="text-xs">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <span className="text-xs text-slate-400">→</span>

              {/* To time — disabled until fromTime is set */}
              <Select
                value={w.toTime ?? ''}
                onValueChange={(v) => updateWindow(w.date, { toTime: v || null })}
                disabled={!w.fromTime}
              >
                <SelectTrigger className="h-8 w-[90px] text-xs">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {toOptions.map((t) => (
                    <SelectItem key={t} value={t} className="text-xs">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Status / action column */}
              <div className="flex min-w-0 flex-1 items-center gap-1">
                {isSource && showApplyButton && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={handleApplyToAll}
                    disabled={isCheckingAvailability}
                    title={isCheckingAvailability ? 'Checking availability…' : undefined}
                  >
                    {isCheckingAvailability
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Copy className="h-3 w-3" />
                    }
                    Apply to all
                  </Button>
                )}
                {isApplied && !isSource && (
                  <span className="flex items-center gap-0.5 text-xs text-slate-400">
                    <Check className="h-3 w-3 text-green-500" />
                    applied
                  </span>
                )}
                {isConflicted && (
                  <span className="flex items-center gap-1 text-xs text-amber-600">
                    <AlertTriangle className="h-3 w-3" />
                    No availability
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
