'use client'
import { useDraggable } from '@dnd-kit/core'
import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TimeRangeSelect } from '@/components/orders/TimeRangeSelect'
import type { OrderServiceDraft } from '@/types/orders'

export const SITE_VISIT_SERVICE_ID = '__site_visit__'

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

interface Props {
  fromTime: string | null
  toTime: string | null
  onTimeChange: (fromTime: string | null, toTime: string | null) => void
  isOverlay?: boolean
  visitDate?: string
}

export function SiteVisitCard({ fromTime, toTime, onTimeChange, isOverlay = false, visitDate }: Props) {
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
          <div className="space-y-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
              Arrival Window
            </span>
            <TimeRangeSelect
              fromTime={fromTime}
              toTime={toTime}
              onChange={onTimeChange}
              compact
              visitDate={visitDate}
            />
          </div>
        )}
      </div>
    </div>
  )
}
