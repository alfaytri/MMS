'use client'
import { useDraggable } from '@dnd-kit/core'
import { X, GripVertical, Clock } from 'lucide-react'
import type { OrderServiceDraft } from '@/types/orders'
import { cn } from '@/lib/utils'
import { TimeRangeSelect } from '@/components/orders/TimeRangeSelect'

interface Props {
  service: OrderServiceDraft
  onRemove: (serviceId: string) => void
  onQtyChange: (serviceId: string, qty: number) => void
  onTimeChange: (serviceId: string, fromTime: string | null, toTime: string | null) => void
  isOverlay?: boolean
  /** Effective unit price to display (e.g. emergency_price on an emergency
   *  order). Falls back to the service's base price when omitted. */
  unitPrice?: number
  /** When true, hides the per-service arrival window time grid (e.g. in quotation form) */
  hideTimeControls?: boolean
  /** When true, hides the drag handle (use when the day-window is the drag target instead) */
  hideDragHandle?: boolean
  /** Primary visit date — used to filter past time slots when today */
  visitDate?: string
}

export function SelectedServiceCard({
  service,
  onRemove,
  onQtyChange,
  onTimeChange,
  isOverlay = false,
  unitPrice,
  hideTimeControls = false,
  hideDragHandle = false,
  visitDate,
}: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: service.serviceId,
    data: { type: 'service', service },
    disabled: isOverlay || hideDragHandle,
  })

  const pathLabel = service.path.slice(0, -1).join(' / ')
  const hasDuration = service.duration > 0

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      className={cn(
        'relative rounded-md border border-border bg-white text-sm',
        isDragging && !isOverlay && 'opacity-40',
        isOverlay && 'shadow-2xl ring-1 ring-orange-300 cursor-grabbing',
      )}
    >
      {!isOverlay && !hideDragHandle && (
        <div className="absolute left-1.5 top-1/2 -translate-y-1/2">
          <button
            {...listeners}
            {...attributes}
            className="cursor-grab text-slate-300 hover:text-muted-foreground active:cursor-grabbing"
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
          className="absolute right-1.5 top-1.5 text-muted-foreground hover:text-destructive"
          aria-label="Remove service"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      <div className={cn('pt-2 pb-2 space-y-1.5', isOverlay ? 'px-3' : 'pl-7 pr-7')}>
        {pathLabel && (
          <p className="truncate text-[11px] leading-none text-muted-foreground">{pathLabel}</p>
        )}
        <p className="break-words pr-1 font-semibold leading-snug text-foreground">
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
            className="w-14 rounded border border-border px-2 py-1 text-center text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-orange-400 disabled:opacity-50"
            aria-label="Quantity"
          />

          {hasDuration && (
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {service.duration} min
            </span>
          )}

          <span className="ml-auto text-xs font-semibold text-foreground">
            QAR {((unitPrice ?? service.price) * service.qty).toFixed(0)}
          </span>
        </div>

        {/* Per-service arrival window — hidden in overlay and when hideTimeControls */}
        {!isOverlay && !hideTimeControls && (
          <>
            <div className="border-t border-slate-100" />
            <div className="space-y-1">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Arrival Window
              </span>
              <TimeRangeSelect
                fromTime={service.fromTime}
                toTime={service.toTime}
                onChange={(from, to) => onTimeChange(service.serviceId, from, to)}
                compact
                visitDate={visitDate}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
