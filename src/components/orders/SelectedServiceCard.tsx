'use client'
import { useEffect, useRef, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { X, GripVertical, Clock } from 'lucide-react'
import type { OrderServiceDraft } from '@/types/orders'
import { cn } from '@/lib/utils'

// Working hours shown in the service time grid: 12 AM – 11 PM (24 h, 3 rows of 8)
const GRID_HOURS = Array.from({ length: 24 }, (_, i) => i)
const GRID_ROWS = [GRID_HOURS.slice(0, 8), GRID_HOURS.slice(8, 16), GRID_HOURS.slice(16)]

function toTimeStr(h: number): string {
  return `${String(h).padStart(2, '0')}:00`
}

function gridLabel(h: number): string {
  if (h === 0) return '12a'
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
  fromTime: string | null | undefined
  toTime: string | null | undefined
  onChange: (fromTime: string | null, toTime: string | null) => void
}

function ServiceTimeGrid({ fromTime, toTime, onChange }: TimeGridProps) {
  const fromHour = fromTime ? parseInt(fromTime) : null
  const toHour = toTime ? parseInt(toTime) : null

  // Drag state — use refs so the global mouseup handler always sees current values
  const dragStartRef = useRef<number | null>(null)
  const [preview, setPreview] = useState<{ from: number; to: number } | null>(null)
  const previewRef = useRef(preview)
  const fromHourRef = useRef(fromHour)
  const toHourRef = useRef(toHour)
  const onChangeRef = useRef(onChange)
  useEffect(() => { previewRef.current = preview }, [preview])
  useEffect(() => { fromHourRef.current = fromHour }, [fromHour])
  useEffect(() => { toHourRef.current = toHour }, [toHour])
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

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

  // During drag show preview, otherwise committed values
  const displayFrom = preview ? preview.from : fromHour
  const displayTo = preview ? preview.to : toHour

  const rangeLabel =
    displayFrom !== null && displayTo !== null
      ? `${formatTime12h(toTimeStr(displayFrom))} → ${formatTime12h(toTimeStr(displayTo))}`
      : displayFrom !== null
      ? `From ${formatTime12h(toTimeStr(displayFrom))}`
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

      <div className="space-y-px rounded bg-slate-50 p-1 select-none">
        {GRID_ROWS.map((row, ri) => (
          <div key={ri} className="grid grid-cols-8 gap-px">
            {row.map((h) => {
              const selected =
                displayFrom !== null
                  ? displayTo !== null
                    ? h >= displayFrom && h <= displayTo
                    : h === displayFrom
                  : false
              const isLeft = h === displayFrom
              const isRight = h === displayTo && displayTo !== displayFrom
              const isSingle = selected && displayTo === null

              return (
                <div
                  key={h}
                  className="flex cursor-pointer flex-col items-center"
                  onMouseDown={() => handleMouseDown(h)}
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
  service: OrderServiceDraft
  onRemove: (serviceId: string) => void
  onQtyChange: (serviceId: string, qty: number) => void
  onTimeChange: (serviceId: string, fromTime: string | null, toTime: string | null) => void
  isOverlay?: boolean
  /** When true, hides the per-service arrival window time grid (e.g. in quotation form) */
  hideTimeControls?: boolean
}

export function SelectedServiceCard({
  service,
  onRemove,
  onQtyChange,
  onTimeChange,
  isOverlay = false,
  hideTimeControls = false,
}: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: service.serviceId,
    data: { type: 'service', service },
    disabled: isOverlay,
  })

  const pathLabel = service.path.slice(0, -1).join(' / ')
  const hasDuration = service.duration > 0

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
        <div className="absolute left-1.5 top-1/2 -translate-y-1/2">
          <button
            {...listeners}
            {...attributes}
            className="cursor-grab text-slate-300 hover:text-slate-500 active:cursor-grabbing"
            tabIndex={-1}
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        </div>
      )}

      {!isOverlay && (
        <button
          onClick={() => onRemove(service.serviceId)}
          className="absolute right-1.5 top-1.5 text-slate-400 hover:text-red-500"
          aria-label="Remove service"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      <div className={cn('pt-2 pb-2 space-y-1.5', isOverlay ? 'px-3' : 'pl-7 pr-7')}>
        {pathLabel && (
          <p className="truncate text-[11px] leading-none text-slate-400">{pathLabel}</p>
        )}
        <p className="break-words pr-1 font-semibold leading-snug text-slate-900">
          {service.serviceName}
        </p>

        <div className="border-t border-slate-100" />

        {/* Qty / duration / price row */}
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={service.qty}
            disabled={isOverlay}
            onChange={(e) => onQtyChange(service.serviceId, Math.max(1, parseInt(e.target.value) || 1))}
            className="w-14 rounded border border-slate-200 px-2 py-1 text-center text-xs font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-orange-400 disabled:opacity-50"
            aria-label="Quantity"
          />

          {hasDuration && (
            <span className="flex items-center gap-0.5 text-xs text-slate-500">
              <Clock className="h-3 w-3" />
              {service.duration} min
            </span>
          )}

          <span className="ml-auto text-xs font-semibold text-slate-900">
            QAR {(service.price * service.qty).toFixed(0)}
          </span>
        </div>

        {/* Per-service arrival window — hidden in overlay and when hideTimeControls */}
        {!isOverlay && !hideTimeControls && (
          <>
            <div className="border-t border-slate-100" />
            <ServiceTimeGrid
              fromTime={service.fromTime}
              toTime={service.toTime}
              onChange={(from, to) => onTimeChange(service.serviceId, from, to)}
            />
          </>
        )}
      </div>
    </div>
  )
}
