'use client'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { X, GripVertical, Clock, Minus, Plus } from 'lucide-react'
import type { OrderServiceDraft } from '@/types/orders'
import { cn } from '@/lib/utils'

interface Props {
  service: OrderServiceDraft
  onRemove: (serviceId: string) => void
  onQtyChange: (serviceId: string, qty: number) => void
}

export function SelectedServiceCard({ service, onRemove, onQtyChange }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: service.serviceId,
    data: { type: 'service', service },
  })

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined

  // Breadcrumb = all path levels except the final service name
  const pathLabel = service.path.slice(0, -1).join(' / ')
  const hasDuration = service.duration > 0

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative rounded-md border border-slate-200 bg-white text-sm',
        isDragging && 'opacity-50 shadow-lg'
      )}
    >
      {/* Drag handle — listeners only on this button, not the whole card */}
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

      {/* Remove button */}
      <button
        onClick={() => onRemove(service.serviceId)}
        className="absolute right-1.5 top-1.5 text-slate-400 hover:text-red-500"
        aria-label="Remove service"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Card body */}
      <div className="pl-7 pr-7 pt-2 pb-2 space-y-1">
        {/* Muted breadcrumb path */}
        {pathLabel && (
          <p className="truncate text-[11px] leading-none text-slate-400">{pathLabel}</p>
        )}

        {/* Service name — full width, wraps freely */}
        <p className="break-words pr-1 font-semibold leading-snug text-slate-900">
          {service.serviceName}
        </p>

        {/* Divider */}
        <div className="border-t border-slate-100" />

        {/* Controls row */}
        <div className="flex items-center gap-2 pt-0.5">
          {/* Qty stepper */}
          <div className="flex items-center rounded border border-slate-200">
            <button
              type="button"
              onClick={() => onQtyChange(service.serviceId, Math.max(1, service.qty - 1))}
              disabled={service.qty <= 1}
              className="px-1.5 py-1 text-slate-500 hover:text-slate-900 disabled:opacity-40"
              aria-label="Decrease quantity"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-6 select-none text-center text-xs font-medium text-slate-900">
              {service.qty}
            </span>
            <button
              type="button"
              onClick={() => onQtyChange(service.serviceId, service.qty + 1)}
              className="px-1.5 py-1 text-slate-500 hover:text-slate-900"
              aria-label="Increase quantity"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>

          {/* Duration — hidden when 0 or null */}
          {hasDuration && (
            <span className="flex items-center gap-0.5 text-xs text-slate-500">
              <Clock className="h-3 w-3" />
              {service.duration} min
            </span>
          )}

          {/* Total price */}
          <span className="ml-auto text-xs font-semibold text-slate-900">
            QAR {(service.price * service.qty).toFixed(0)}
          </span>
        </div>
      </div>
    </div>
  )
}
