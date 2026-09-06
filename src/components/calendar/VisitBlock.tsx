'use client'

import { useState } from 'react'
import { Phone, CheckCircle2, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useVisitPaymentStatus } from '@/hooks/useVisitPaymentStatus'
import { fmt12, toMinutes, blockLeftPx, blockWidthPx } from '@/lib/calendar/time'
import { getVisitTypeConfig, solidColor, type VisitTypeDisplayConfig } from '@/lib/calendar/visitTypes'
import type { CalendarVisit } from '@/hooks/useCalendarVisits'

// Re-export the shared visit-type config so this module's existing importers
// (TeamDaySheet, VisitDetailPanel, SwapTeamDialog, TeamCard) keep working unchanged.
export { getVisitTypeConfig, solidColor }
export type { VisitTypeDisplayConfig }

function parseServices(summary: string | null): string[] {
  if (!summary) return []
  const out: string[] = []
  let depth = 0
  let buf = ''
  for (const ch of summary) {
    if (ch === '[' || ch === '(') depth++
    else if (ch === ']' || ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      const s = buf.trim()
      if (s) out.push(s)
      buf = ''
    } else {
      buf += ch
    }
  }
  const tail = buf.trim()
  if (tail) out.push(tail)
  return out
}

function kindLabel(visit: CalendarVisit): string {
  if (visit.source_type === 'site_visit') return 'Site Visit'
  if (visit.source_type === 'contract_visit') return 'Contract Visit'
  if (visit.source_type === 'follow_up_request') return 'Follow-up Request'
  return 'Order'
}

interface VisitBlockProps {
  visit: CalendarVisit
  cellWidth: number
  dayStart: number
  /** Last working hour (exclusive) — used to detect overtime. */
  workEnd: number
  /** Which stacking track this block sits on (0 = top). */
  track: number
  /** Height of one track in px. */
  trackHeight: number
  canEdit: boolean
  canSwap: boolean
  onEdit: (visit: CalendarVisit) => void
  onSwap: (visit: CalendarVisit) => void
}


export function VisitBlock({
  visit,
  cellWidth,
  dayStart,
  workEnd,
  track,
  trackHeight,
  canEdit,
  canSwap,
  onEdit,
  onSwap,
}: VisitBlockProps) {
  const [hovered, setHovered] = useState(false)

  if (!visit.start_time || !visit.end_time) return null

  const startMin  = toMinutes(visit.start_time)
  const endMin    = toMinutes(visit.end_time)
  // cellWidth is per half-hour slot (30 min)
  const leftPx    = blockLeftPx(startMin, dayStart, cellWidth)
  const widthPx   = blockWidthPx(startMin, endMin, cellWidth)
  const isOvertime = endMin > workEnd * 60

  const topPx    = track * trackHeight + 2
  const heightPx = trackHeight - 4

  const cfg = getVisitTypeConfig(visit.visit_type)
  const Icon = cfg.icon
  const showOrderNum = widthPx >= 80
  const showName     = widthPx >= 120

  const timeLabel = `${fmt12(visit.start_time.substring(0, 5))} – ${fmt12(visit.end_time.substring(0, 5))}`

  return (
    <div
      className={cn(
        'absolute rounded-md border text-[11px] cursor-pointer select-none transition-shadow hover:shadow-md',
        cfg.blockClass,
        'z-20',
      )}
      style={{ left: leftPx, width: widthPx, top: topPx, height: heightPx }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onEdit(visit)}
    >
      {/* Block content — soft pastel block, dark text on light background */}
      <div className="flex items-center gap-1 h-full px-1.5 overflow-hidden">
        <Icon className={cn('h-3 w-3 shrink-0', cfg.iconColor)} />
        {showOrderNum && visit.order_number && (
          <span className={cn('truncate leading-none font-mono text-[9px] font-semibold', cfg.numberClass)}>
            {visit.order_number}
          </span>
        )}
        {showName && (
          <span className="truncate leading-none font-medium">
            {visit.customer_name ?? cfg.label}
          </span>
        )}
      </div>

      {/* Overtime badge */}
      {isOvertime && (
        <span className="absolute top-0.5 right-0.5 rounded-sm bg-orange-500 px-0.5 text-[8px] font-bold leading-tight text-white">
          OT
        </span>
      )}

      {/* Hover popup */}
      {hovered && (
        <HoverPopup
          visit={visit}
          cfg={cfg}
          Icon={Icon}
          timeLabel={timeLabel}
          isOvertime={isOvertime}
          canEdit={canEdit}
          canSwap={canSwap}
          onEdit={onEdit}
          onSwap={onSwap}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        />
      )}
    </div>
  )
}

interface HoverPopupProps {
  visit: CalendarVisit
  cfg: VisitTypeDisplayConfig
  Icon: React.ComponentType<{ className?: string }>
  timeLabel: string
  isOvertime: boolean
  canEdit: boolean
  canSwap: boolean
  onEdit: (visit: CalendarVisit) => void
  onSwap: (visit: CalendarVisit) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}

function HoverPopup({
  visit, cfg, Icon, timeLabel, isOvertime,
  canEdit, canSwap, onEdit, onSwap,
  onMouseEnter, onMouseLeave,
}: HoverPopupProps) {
  const isCompleted = visit.status === 'completed'
  const payment = useVisitPaymentStatus(visit.id, isCompleted)
  const paymentInfo = payment.data
  const showPayment = isCompleted && paymentInfo
  const services = parseServices(visit.services_summary)
  const previewServices = services.slice(0, 4)
  const moreCount = Math.max(0, services.length - previewServices.length)

  return (
    <div
      className="absolute top-full left-0 mt-1 min-w-[240px] max-w-[300px] bg-popover border border-border rounded-lg shadow-xl p-3 z-30 space-y-2"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Entity kind + order/visit number */}
      <div>
        <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
          {kindLabel(visit)}
        </p>
        {visit.order_number && (
          <p className="font-mono font-bold text-foreground text-sm leading-tight">{visit.order_number}</p>
        )}
      </div>

      {/* Type pill + status + payment */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white', cfg.solidClass)}>
          <Icon className="h-2.5 w-2.5" />
          {cfg.label}
        </span>
        <span className={cn(
          'rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize',
          isCompleted ? 'border-green-300 bg-green-50 text-green-800' : 'border-foreground/15 text-muted-foreground',
        )}>
          {visit.status}
        </span>
        {showPayment && paymentInfo.status === 'paid' && (
          <span className="inline-flex items-center gap-1 rounded-full border border-green-300 bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-800">
            <CheckCircle2 className="h-2.5 w-2.5" /> Paid
          </span>
        )}
        {showPayment && paymentInfo.status === 'unpaid' && (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
            <Circle className="h-2.5 w-2.5" /> Unpaid
          </span>
        )}
        {isOvertime && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700">
            ⚠ Overtime
          </span>
        )}
      </div>

      {/* Details */}
      <div className="space-y-1">
        {visit.customer_name && (
          <p className="text-[11px] font-semibold text-foreground">{visit.customer_name}</p>
        )}
        {visit.customer_phone && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Phone className="h-3 w-3" />
            {visit.customer_phone}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">{timeLabel}</p>
      </div>

      {/* Services as a tight list */}
      {previewServices.length > 0 && (
        <div className="border-t pt-1.5 space-y-0.5">
          {previewServices.map((s, i) => (
            <p key={i} className="text-[11px] text-foreground leading-snug">• {s}</p>
          ))}
          {moreCount > 0 && (
            <p className="text-[10px] text-muted-foreground italic">+ {moreCount} more</p>
          )}
        </div>
      )}

      {/* Created by — orders / site visits only (other sources don't track a creator) */}
      {visit.created_by_name && (
        <p className="border-t pt-1.5 text-[10px] text-muted-foreground text-right">
          Created by <span className="font-medium text-foreground">{visit.created_by_name}</span>
        </p>
      )}

      {/* Actions */}
      {(canEdit || (canSwap && visit.source_type === 'order' && visit.status !== 'completed' && visit.status !== 'cancelled')) && (
        <div className="flex gap-1 pt-1.5 border-t">
          {canEdit && (
            <button
              type="button"
              className="flex-1 text-[11px] font-medium px-2 py-1.5 rounded border border-border bg-background text-foreground hover:bg-muted transition-colors"
              onClick={e => { e.stopPropagation(); onEdit(visit) }}
            >
              View Details
            </button>
          )}
          {canSwap && visit.source_type === 'order' && visit.status !== 'completed' && visit.status !== 'cancelled' && (
            <button
              type="button"
              className="flex-1 text-[11px] font-medium px-2 py-1.5 rounded border border-border bg-background text-foreground hover:bg-muted transition-colors"
              onClick={e => { e.stopPropagation(); onSwap(visit) }}
            >
              Swap Team
            </button>
          )}
        </div>
      )}
    </div>
  )
}
