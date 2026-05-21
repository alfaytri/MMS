'use client'

import { X, User, Phone, Clock, Users, ExternalLink, RefreshCw, ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getVisitTypeConfig } from './VisitBlock'
import type { CalendarVisit } from '@/hooks/useCalendarVisits'

interface VisitDetailPanelProps {
  visit: CalendarVisit | null
  teamName: string | null
  canEdit: boolean
  canSwap: boolean
  onEdit: (visit: CalendarVisit) => void
  onSwap: (visit: CalendarVisit) => void
  onClose: () => void
}

function fmt12(t: string): string {
  const [hStr, mStr] = t.split(':')
  const h = parseInt(hStr)
  const m = mStr ?? '00'
  const period = h < 12 ? 'AM' : 'PM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${m} ${period}`
}

function Row({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <Icon className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
      <span className="text-foreground">{children}</span>
    </div>
  )
}

export function VisitDetailPanel({
  visit,
  teamName,
  canEdit,
  canSwap,
  onEdit,
  onSwap,
  onClose,
}: VisitDetailPanelProps) {
  if (!visit) return null

  const cfg = getVisitTypeConfig(visit.visit_type)
  const Icon = cfg.icon

  const timeLabel = visit.start_time && visit.end_time
    ? `${fmt12(visit.start_time.substring(0, 5))} – ${fmt12(visit.end_time.substring(0, 5))}`
    : visit.start_time
    ? fmt12(visit.start_time.substring(0, 5))
    : '—'

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-80 bg-background shadow-2xl border-l flex flex-col">
        {/* Coloured header */}
        <div className={cn('flex items-center justify-between px-4 py-3 text-white', cfg.color)}>
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 opacity-90" />
            <span className="text-sm font-semibold">{cfg.label}</span>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center h-7 w-7 rounded-full hover:bg-white/20 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Order number */}
          {visit.order_number && (
            <p className="font-mono font-bold text-2xl text-foreground leading-none tracking-tight">
              {visit.order_number}
            </p>
          )}

          {/* Status badge */}
          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold capitalize">
              {visit.status}
            </span>
            {visit.source_type === 'site_visit' && (
              <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                Site Visit
              </span>
            )}
          </div>

          {/* Detail rows */}
          <div className="space-y-3 bg-muted/40 rounded-xl px-4 py-4">
            {visit.customer_name && (
              <Row icon={User}>{visit.customer_name}</Row>
            )}
            {visit.customer_phone && (
              <Row icon={Phone}>{visit.customer_phone}</Row>
            )}
            <Row icon={Clock}>{timeLabel}</Row>
            {teamName && (
              <Row icon={Users}>{teamName}</Row>
            )}
          </div>

          {/* Services */}
          {visit.services_summary && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                Services
              </p>
              <div className="flex items-start gap-3 text-sm">
                <ClipboardList className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
                <span className="text-foreground leading-relaxed">{visit.services_summary}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="border-t p-4 space-y-2">
          {canEdit && (
            <Button
              className="w-full gap-2 h-10"
              onClick={() => { onEdit(visit); onClose() }}
            >
              <ExternalLink className="h-4 w-4" />
              Edit Order
            </Button>
          )}
          {canSwap && visit.source_type === 'order' && (
            <Button
              variant="outline"
              className="w-full gap-2 h-10"
              onClick={() => { onSwap(visit); onClose() }}
            >
              <RefreshCw className="h-4 w-4" />
              Swap Team
            </Button>
          )}
        </div>
      </div>
    </>
  )
}
