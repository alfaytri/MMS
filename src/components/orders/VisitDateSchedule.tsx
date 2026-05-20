'use client'
import { useEffect, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Copy, Check, AlertTriangle, Loader2, X, GripVertical } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useDraggable } from '@dnd-kit/core'
import { useDateAvailability } from '@/hooks/useDateAvailability'
import { cn } from '@/lib/utils'
import type { VisitDateWindow } from '@/types/orders'

// Full day: 12AM–11PM in three rows of 8
const ALL_HOURS = Array.from({ length: 24 }, (_, i) => i)
const ROWS = [ALL_HOURS.slice(0, 8), ALL_HOURS.slice(8, 16), ALL_HOURS.slice(16, 24)]

function toTimeStr(h: number): string {
  return `${String(h).padStart(2, '0')}:00`
}

function gridLabel(h: number): string {
  if (h === 0) return '12am'
  if (h === 12) return '12pm'
  return h < 12 ? `${h}am` : `${h - 12}pm`
}

function formatTime12h(t: string): string {
  const h = parseInt(t)
  const m = t.split(':')[1]
  const period = h < 12 ? 'AM' : 'PM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${m} ${period}`
}

// ---------------------------------------------------------------------------
// TimeWindowGrid — drag or click-click to select a range across 3 rows
// ---------------------------------------------------------------------------

interface TimeWindowGridProps {
  fromTime: string | null
  toTime: string | null
  onChange: (fromTime: string | null, toTime: string | null) => void
}

function TimeWindowGrid({ fromTime, toTime, onChange }: TimeWindowGridProps) {
  const fromHour = fromTime ? parseInt(fromTime) : null
  const toHour   = toTime   ? parseInt(toTime)   : null

  const dragStartRef  = useRef<number | null>(null)
  const [preview, setPreview] = useState<{ from: number; to: number } | null>(null)
  const previewRef    = useRef(preview)
  const fromHourRef   = useRef(fromHour)
  const toHourRef     = useRef(toHour)
  const onChangeRef   = useRef(onChange)
  useEffect(() => { previewRef.current  = preview },    [preview])
  useEffect(() => { fromHourRef.current = fromHour },   [fromHour])
  useEffect(() => { toHourRef.current   = toHour },     [toHour])
  useEffect(() => { onChangeRef.current = onChange },   [onChange])

  useEffect(() => {
    function onMouseUp() {
      if (dragStartRef.current === null) return
      const p = previewRef.current
      if (p !== null) {
        if (p.from === p.to && fromHourRef.current === p.from && toHourRef.current === null) {
          onChangeRef.current(null, null)
        } else if (p.from === p.to) {
          onChangeRef.current(toTimeStr(p.from), null)
        } else {
          onChangeRef.current(toTimeStr(p.from), toTimeStr(p.to))
        }
      }
      dragStartRef.current = null
      setPreview(null)
    }
    window.addEventListener('mouseup', onMouseUp)
    return () => window.removeEventListener('mouseup', onMouseUp)
  }, [])

  function handleMouseDown(h: number) {
    dragStartRef.current = h
    setPreview({ from: h, to: h })
  }

  function handleMouseEnter(h: number) {
    if (dragStartRef.current === null) return
    const s = dragStartRef.current
    setPreview({ from: Math.min(s, h), to: Math.max(s, h) })
  }

  const displayFrom = preview ? preview.from : fromHour
  const displayTo   = preview ? preview.to   : toHour

  return (
    <div className="space-y-px rounded-md bg-slate-50 p-1.5 select-none">
      {ROWS.map((row, rowIdx) => (
        <div key={rowIdx} className="grid grid-cols-8 gap-px">
          {row.map((h) => {
            const selected =
              displayFrom !== null
                ? displayTo !== null
                  ? h >= displayFrom && h <= displayTo
                  : h === displayFrom
                : false
            const isLeft   = h === displayFrom
            const isRight  = h === displayTo && displayTo !== displayFrom
            const isSingle = h === displayFrom && displayTo === null

            return (
              <div
                key={h}
                className="flex cursor-pointer flex-col items-center"
                onMouseDown={() => handleMouseDown(h)}
                onMouseEnter={() => handleMouseEnter(h)}
              >
                <span
                  className={cn(
                    'mb-0.5 select-none text-[9px] leading-none',
                    selected ? 'font-semibold text-orange-600' : 'text-slate-400',
                  )}
                >
                  {gridLabel(h)}
                </span>
                <div
                  className={cn(
                    'h-5 w-full transition-colors',
                    selected ? 'bg-orange-400' : 'bg-slate-200 hover:bg-orange-100',
                    isSingle && 'rounded',
                    isLeft  && !isSingle && 'rounded-l',
                    isRight && 'rounded-r',
                  )}
                />
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// WindowDragHandle — grip icon that makes the day-window row draggable
// ---------------------------------------------------------------------------

function WindowDragHandle({ date, fromTime, toTime }: { date: string; fromTime: string | null; toTime: string | null }) {
  const canDrag = !!fromTime
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `day-window-${date}`,
    data: { type: 'day-window', date, fromTime, toTime },
    disabled: !canDrag,
  })

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      type="button"
      tabIndex={-1}
      aria-label="Drag to assign to team"
      title={canDrag ? 'Drag to assign all services to a team' : 'Set a time window first'}
      className={cn(
        'flex items-center text-slate-300 transition-colors',
        canDrag ? 'cursor-grab hover:text-orange-400 active:cursor-grabbing' : 'cursor-default opacity-40',
        isDragging && 'opacity-40',
      )}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  )
}

// ---------------------------------------------------------------------------
// VisitDateSchedule
// ---------------------------------------------------------------------------

interface Props {
  windows: VisitDateWindow[]
  onChange: (windows: VisitDateWindow[]) => void
}

export function VisitDateSchedule({ windows, onChange }: Props) {
  const [appliedDates, setAppliedDates] = useState<Set<string>>(new Set())

  const sorted = [...windows].sort((a, b) => a.date.localeCompare(b.date))
  const sourceWindow = sorted.find((w) => w.fromTime && w.toTime) ?? null

  const datesToCheck = sourceWindow
    ? sorted
        .filter((w) => w.date !== sourceWindow.date && (!w.fromTime || !w.toTime))
        .map((w) => w.date)
    : []

  const { data: availability = [], isLoading: isCheckingAvailability } = useDateAvailability(
    datesToCheck,
    sourceWindow?.fromTime ?? null,
    sourceWindow?.toTime ?? null,
  )
  const availabilityMap = new Map(
    availability.map((a) => [a.visit_date, a.available_teams_count]),
  )

  function updateWindow(date: string, patch: Partial<VisitDateWindow>) {
    onChange(windows.map((w) => (w.date === date ? { ...w, ...patch } : w)))
    if (appliedDates.has(date)) {
      setAppliedDates((prev) => {
        const next = new Set(prev)
        next.delete(date)
        return next
      })
    }
  }

  function handleApplyToAll() {
    if (!sourceWindow?.fromTime || !sourceWindow?.toTime) return
    const newApplied = new Set(appliedDates)
    const updated = windows.map((w) => {
      if (w.date === sourceWindow.date) return w
      if (w.fromTime && w.toTime) return w
      if (availabilityMap.get(w.date) === 0) return w
      newApplied.add(w.date)
      return { ...w, fromTime: sourceWindow.fromTime, toTime: sourceWindow.toTime }
    })
    setAppliedDates(newApplied)
    onChange(updated)
  }

  const hasOtherEmptyRows = sorted.some(
    (w) => w.date !== sourceWindow?.date && (!w.fromTime || !w.toTime),
  )
  const showApplyButton = !!sourceWindow && hasOtherEmptyRows && sorted.length > 1

  if (sorted.length === 0) return null

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Requested Arrival Window
      </Label>

      <div className="space-y-4">
        {sorted.map((w) => {
          const isSource = w.date === sourceWindow?.date
          const isApplied = appliedDates.has(w.date)
          const avail = availabilityMap.get(w.date)
          const isConflicted = !isCheckingAvailability && avail === 0

          const rangeLabel =
            w.fromTime && w.toTime
              ? `${formatTime12h(w.fromTime)} → ${formatTime12h(w.toTime)}`
              : w.fromTime
              ? `From ${formatTime12h(w.fromTime)}`
              : null

          return (
            <div key={w.date} className="space-y-1.5">
              {/* Date row */}
              <div className="flex items-center justify-between gap-1">
                <div className="flex min-w-0 items-center gap-1">
                  <WindowDragHandle date={w.date} fromTime={w.fromTime} toTime={w.toTime} />
                  <span className="shrink-0 text-xs font-medium text-slate-700">
                    {format(parseISO(w.date), 'd MMM yyyy')}
                  </span>
                  {rangeLabel && (
                    <span className="truncate text-[11px] font-medium text-orange-600">
                      {rangeLabel}
                    </span>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {w.fromTime && (
                    <button
                      type="button"
                      onClick={() => updateWindow(w.date, { fromTime: null, toTime: null })}
                      className="text-slate-400 hover:text-red-500"
                      aria-label="Clear time window"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}

                  {isSource && showApplyButton && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 gap-1 px-2 text-[11px]"
                      onClick={handleApplyToAll}
                      disabled={isCheckingAvailability}
                    >
                      {isCheckingAvailability ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      Apply to all
                    </Button>
                  )}

                  {isApplied && !isSource && (
                    <span className="flex items-center gap-0.5 text-[11px] text-slate-400">
                      <Check className="h-3 w-3 text-green-500" />
                      applied
                    </span>
                  )}

                  {isConflicted && (
                    <span className="flex items-center gap-1 text-[11px] text-amber-600">
                      <AlertTriangle className="h-3 w-3" />
                      No availability
                    </span>
                  )}
                </div>
              </div>

              <TimeWindowGrid
                fromTime={w.fromTime}
                toTime={w.toTime}
                onChange={(from, to) => updateWindow(w.date, { fromTime: from, toTime: to })}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
