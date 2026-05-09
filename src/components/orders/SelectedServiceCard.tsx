'use client'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { X, GripVertical, Clock } from 'lucide-react'
import type { OrderServiceDraft } from '@/types/orders'
import { cn } from '@/lib/utils'

interface Props {
  service: OrderServiceDraft
  onRemove: (serviceId: string) => void
}

export function SelectedServiceCard({ service, onRemove }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: service.serviceId,
    data: { type: 'service', service },
  })

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm',
        isDragging && 'opacity-50 shadow-lg'
      )}
    >
      <button {...listeners} {...attributes} className="cursor-grab text-slate-300 hover:text-slate-500 active:cursor-grabbing">
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">
        <p className="truncate font-medium text-slate-900">{service.serviceName}</p>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>×{service.qty}</span>
          <span>·</span>
          <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{service.duration}m</span>
          <span>·</span>
          <span>QAR {(service.price * service.qty).toFixed(0)}</span>
        </div>
      </div>
      <button
        onClick={() => onRemove(service.serviceId)}
        className="text-slate-400 hover:text-red-500"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
