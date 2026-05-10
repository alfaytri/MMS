'use client'
import { useRef } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OrderServiceDraft } from '@/types/orders'

export const SITE_VISIT_SERVICE_ID = '__site_visit__'

/** Build a synthetic OrderServiceDraft for drag-and-drop and calendar rendering. */
export function makeSiteVisitDraft(
  fromTime: string | null,
  toTime: string | null,
): OrderServiceDraft {
  return {
    serviceId: SITE_VISIT_SERVICE_ID,
    serviceName: 'Site Visit',
    path: ['Site Visit'],
    qty: 1,
    price: 0,
    duration: 60,
    fromTime,
    toTime,
  }
}

// Arrival window grid: 6 AM – 10 PM (same range as SelectedServiceCard)
const GRID_HOURS = Array.from({ length: 16 }, (_, i) => i + 6)
const GRID_ROWS = [GRID_HOURS.slice(0, 8), GRID_HOURS.slice(8)]

function toTimeStr(h: number): string {
  return `${String(h).padStart(2, '0')}:00`
}

function gridLabel(h: number): string {
  if (h === 12) return '12p'
  return h < 12 ? `${h}a` : `${h - 12}p`
}

function formatTime12h(t: string): string {
  const h = parseInt(t)
  const m = t.split(':')[1]
  const period = h < 12 ? 'AM' : 'PM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${m} ${period}`
}

interface TimeGridProps {
  fromTime: string | null
  toTime: string | null
  onChange: (fromTime: string | null, toTime: string | null) => void
}

function SiteVisitTimeGrid({ fromTime, toTime, onChange }: TimeGridProps) {
  const isDragging = useRef(false)
  const dragAnchor = useRef<number | null>(null)

  const fromHour = fromTime ? parseInt(fromTime) : null
  const toHour = toTime ? parseInt(toTime) : null

  function handleMouseDown(h: number, e: React.MouseEvent) {
    e.preventDefault()
    if (!isDragging.current && fromHour !== null && toHour === null) {
      if (h > fromHour) { onChange(fromTime!, toTimeStr(h)); return }
      if (h === fromHour) { onChange(null, null); return }
    }
    isDragging.current = true
    dragAnchor.current = h
    onChange(toTimeStr(h), null)
  }

  function handleMouseEnter(h: number) {
    if (!isDragging.current || dragAnchor.current === null) return
    const lo = Math.min(h, dragAnchor.current)
    const hi = Math.max(h, dragAnchor.current)
    onChange(toTimeStr(lo), lo !== hi ? toTimeStr(hi) : null)
  }

  function stopDrag() {
    isDragging.current = false
    dragAnchor.current = null
  }

  const rangeLabel =
    fromHour !== null && toHour !== null
      ? `${formatTime12h(toTimeStr(fromHour))} → ${formatTime12h(toTimeStr(toHour))}`
      : fromHour !== null
      ? `From ${formatTime12h(toTimeStr(fromHour))}`
      : null

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
          Arrival Window
        </span>
        {rangeLabel && (
          <span className="text-[10px] font-semibold text-orange-600">{rangeLabel}</span>
        )}
      </div>

      <div
        className="space-y-px rounded bg-slate-50 p-1 select-none"
        onMouseLeave={stopDrag}
        onMouseUp={stopDrag}
      >
        {GRID_ROWS.map((row, ri) => (
          <div key={ri} className="grid grid-cols-8 gap-px">
            {row.map((h) => {
              const selected =
                fromHour !== null
                  ? toHour !== null
                    ? h >= fromHour && h <= toHour
                    : h === fromHour
                  : false
              const isLeft = h === fromHour
              const isRight = h === toHour && toHour !== fromHour
              const isSingle = h === fromHour && toHour === null

              return (
                <div
                  key={h}
                  className="flex cursor-col-resize flex-col items-center"
                  onMouseDown={(e) => handleMouseDown(h, e)}
                  onMouseEnter={() => handleMouseEnter(h)}
                >
                  <span
                    className={cn(
                      'select-none text-[8px] leading-none mb-0.5',
                      selected ? 'font-semibold text-orange-600' : 'text-slate-400',
                    )}
                  >
                    {gridLabel(h)}
                  </span>
                  <div
                    className={cn(
                      'h-3 w-full transition-colors',
                      selected ? 'bg-orange-400' : 'bg-slate-200 hover:bg-orange-100',
                      isSingle && 'rounded',
                      isLeft && !isSingle && 'rounded-l',
                      isRight && 'rounded-r',
                    )}
                  />
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

interface Props {
  fromTime: string | null
  toTime: string | null
  onTimeChange: (fromTime: string | null, toTime: string | null) => void
  isOverlay?: boolean
}

export function SiteVisitCard({ fromTime, toTime, onTimeChange, isOverlay = false }: Props) {
  const siteVisitDraft = makeSiteVisitDraft(fromTime, toTime)

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: SITE_VISIT_SERVICE_ID,
    data: { type: 'service', service: siteVisitDraft },
    disabled: isOverlay,
  })

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      className={cn(
        'relative rounded-md border border-slate-200 bg-white text-sm',
        isDragging && !isOverlay && 'opacity-40',
        isOverlay && 'shadow-2xl ring-1 ring-orange-300 cursor-grabbing',
      )}
    >
      {!isOverlay && (
        <div className="absolute left-1.5 top-4">
          <button
            {...listeners}
            {...attributes}
            className="cursor-grab text-slate-300 hover:text-slate-500 active:cursor-grabbing"
            tabIndex={-1}
            aria-label="Drag to calendar to assign team"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className={cn('pt-2 pb-2 space-y-1.5', isOverlay ? 'px-3' : 'pl-7 pr-3')}>
        <p className="font-semibold leading-snug text-slate-900">Site Visit</p>
        {!isOverlay && (
          <p className="text-[11px] text-slate-400 leading-snug">
            Drag onto a team row in the calendar to assign
          </p>
        )}

        <div className="border-t border-slate-100" />

        {!isOverlay && (
          <SiteVisitTimeGrid fromTime={fromTime} toTime={toTime} onChange={onTimeChange} />
        )}
      </div>
    </div>
  )
}
