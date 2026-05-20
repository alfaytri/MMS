'use client'
import { useEffect, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { AlertTriangle, ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, GripVertical, Loader2, X } from 'lucide-react'
import { Label } from '@/components/ui/label'
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

export function formatTime12h(t: string): string {
  const h = parseInt(t)
  const m = t.split(':')[1]
  const period = h < 12 ? 'AM' : 'PM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${m} ${period}`
}

// ---------------------------------------------------------------------------
// TimeWindowGrid — drag-to-select a range across 3 rows
// ---------------------------------------------------------------------------

interface TimeWindowGridProps {
  fromTime: string | null
  toTime: string | null
  onChange: (fromTime: string | null, toTime: string | null) => void
}

function TimeWindowGrid({ fromTime, toTime, onChange }: TimeWindowGridProps) {
  const fromHour = fromTime ? parseInt(fromTime) : null
  const toHour   = toTime   ? parseInt(toTime)   : null

  const dragStartRef = useRef<number | null>(null)
  const [preview, setPreview] = useState<{ from: number; to: number } | null>(null)
  const previewRef   = useRef(preview)
  const fromHourRef  = useRef(fromHour)
  const toHourRef    = useRef(toHour)
  const onChangeRef  = useRef(onChange)
  useEffect(() => { previewRef.current  = preview  }, [preview])
  useEffect(() => { fromHourRef.current = fromHour }, [fromHour])
  useEffect(() => { toHourRef.current   = toHour   }, [toHour])
  useEffect(() => { onChangeRef.current = onChange  }, [onChange])

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
                <span className={cn('mb-0.5 select-none text-[9px] leading-none', selected ? 'font-semibold text-orange-600' : 'text-slate-400')}>
                  {gridLabel(h)}
                </span>
                <div className={cn(
                  'h-5 w-full transition-colors',
                  selected ? 'bg-orange-400' : 'bg-slate-200 hover:bg-orange-100',
                  isSingle && 'rounded',
                  isLeft  && !isSingle && 'rounded-l',
                  isRight && 'rounded-r',
                )} />
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// WindowDragHandle — grip that drags the day-window onto the team calendar
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

interface ServiceSummary {
  serviceId: string
  serviceName: string
  qty: number
}

interface Props {
  windows: VisitDateWindow[]
  onChange: (windows: VisitDateWindow[]) => void
  services?: ServiceSummary[]
}

export function VisitDateSchedule({ windows, onChange, services = [] }: Props) {
  const sorted = [...windows].sort((a, b) => a.date.localeCompare(b.date))
  const isMultiDay = sorted.length > 1

  // Accordion open state — first day open by default
  const [openDates, setOpenDates] = useState<Set<string>>(
    () => new Set(sorted[0] ? [sorted[0].date] : [])
  )

  // When a new date is added, open it automatically
  useEffect(() => {
    setOpenDates((prev) => {
      const next = new Set(prev)
      sorted.forEach((w) => { if (!next.has(w.date) && windows.length > prev.size) next.add(w.date) })
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windows.length])

  const sourceWindow = sorted.find((w) => w.fromTime && w.toTime) ?? null
  const datesToCheck = sourceWindow
    ? sorted.filter((w) => w.date !== sourceWindow.date && (!w.fromTime || !w.toTime)).map((w) => w.date)
    : []

  const { data: availability = [], isLoading: isCheckingAvailability } = useDateAvailability(
    datesToCheck,
    sourceWindow?.fromTime ?? null,
    sourceWindow?.toTime ?? null,
  )
  const availabilityMap = new Map(availability.map((a) => [a.visit_date, a.available_teams_count]))

  function updateWindow(date: string, patch: Partial<VisitDateWindow>) {
    onChange(windows.map((w) => (w.date === date ? { ...w, ...patch } : w)))
  }

  function toggleOpen(date: string) {
    setOpenDates((prev) => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  // Swap time windows between two adjacent sorted positions
  function swapTimeWindows(i: number, j: number) {
    const dateA = sorted[i].date
    const dateB = sorted[j].date
    const winA  = windows.find((w) => w.date === dateA)!
    const winB  = windows.find((w) => w.date === dateB)!
    onChange(windows.map((w) => {
      if (w.date === dateA) return { ...w, fromTime: winB.fromTime, toTime: winB.toTime }
      if (w.date === dateB) return { ...w, fromTime: winA.fromTime, toTime: winA.toTime }
      return w
    }))
  }

  if (sorted.length === 0) return null

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Requested Arrival Window
      </Label>

      <div className={cn('space-y-1.5', isMultiDay && 'space-y-1')}>
        {sorted.map((w, i) => {
          const isOpen = !isMultiDay || openDates.has(w.date)
          const avail = availabilityMap.get(w.date)
          const isConflicted = !isCheckingAvailability && avail === 0

          const rangeLabel =
            w.fromTime && w.toTime
              ? `${formatTime12h(w.fromTime)} → ${formatTime12h(w.toTime)}`
              : w.fromTime
              ? `From ${formatTime12h(w.fromTime)}`
              : null

          return (
            <div
              key={w.date}
              className={cn(
                'rounded-lg border border-slate-200 bg-white',
                isMultiDay && 'overflow-hidden',
              )}
            >
              {/* ── Header row ───────────────────────────────────────────── */}
              <div
                className={cn(
                  'flex items-center gap-1 px-2 py-1.5',
                  isMultiDay && 'cursor-pointer hover:bg-slate-50 transition-colors',
                )}
                onClick={() => isMultiDay && toggleOpen(w.date)}
              >
                {/* Accordion chevron */}
                {isMultiDay && (
                  <span className="shrink-0 text-slate-400">
                    {isOpen
                      ? <ChevronDown className="h-3.5 w-3.5" />
                      : <ChevronRight className="h-3.5 w-3.5" />
                    }
                  </span>
                )}

                {/* Date + time label */}
                <span className="shrink-0 text-xs font-semibold text-slate-700">
                  {format(parseISO(w.date), 'd MMM yyyy')}
                </span>
                {rangeLabel && (
                  <span className="truncate text-[11px] font-medium text-orange-600">
                    {rangeLabel}
                  </span>
                )}
                {isConflicted && (
                  <span className="ml-auto flex shrink-0 items-center gap-1 text-[11px] text-amber-600">
                    {isCheckingAvailability
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <AlertTriangle className="h-3 w-3" />
                    }
                    {!isCheckingAvailability && 'No availability'}
                  </span>
                )}

                {/* Right-side controls — stop click from toggling accordion */}
                <div
                  className="ml-auto flex shrink-0 items-center gap-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  {isMultiDay && (
                    <>
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => swapTimeWindows(i, i - 1)}
                        className="rounded p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-20"
                        title="Move window up"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        disabled={i === sorted.length - 1}
                        onClick={() => swapTimeWindows(i, i + 1)}
                        className="rounded p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-20"
                        title="Move window down"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                    </>
                  )}

                  <WindowDragHandle date={w.date} fromTime={w.fromTime} toTime={w.toTime} />

                  {w.fromTime && (
                    <button
                      type="button"
                      onClick={() => updateWindow(w.date, { fromTime: null, toTime: null })}
                      className="rounded p-0.5 text-slate-400 hover:text-red-500"
                      aria-label="Clear time window"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* ── Expandable body ───────────────────────────────────────── */}
              {isOpen && (
                <div className="space-y-2 border-t border-slate-100 px-2 pb-2 pt-2">
                  <TimeWindowGrid
                    fromTime={w.fromTime}
                    toTime={w.toTime}
                    onChange={(from, to) => updateWindow(w.date, { fromTime: from, toTime: to })}
                  />

                  {/* Service list for this day */}
                  {services.length > 0 && (
                    <div className="space-y-0.5 pt-0.5">
                      {services.map((s) => (
                        <div key={s.serviceId} className="flex items-center gap-1.5">
                          <Check className="h-3 w-3 shrink-0 text-orange-400" />
                          <span className="truncate text-[11px] text-slate-600">
                            {s.qty > 1 && <span className="font-semibold text-slate-500">{s.qty}× </span>}
                            {s.serviceName}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
