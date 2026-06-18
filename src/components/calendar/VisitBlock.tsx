'use client'

import { useState } from 'react'
import {
  Briefcase, Zap, RefreshCw, Wrench, MapPin, FileText, ClipboardList, ShieldCheck,
  Phone, CheckCircle2, Circle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useVisitPaymentStatus } from '@/hooks/useVisitPaymentStatus'
import type { CalendarVisit } from '@/hooks/useCalendarVisits'

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

export interface VisitTypeDisplayConfig {
  key: string
  label: string
  /** Soft compound class — used on the calendar block itself.
   *  Format: "bg-<hue>-100 border-<hue>-300 text-<hue>-900" */
  blockClass: string
  /** Mid-tone class for the order_number monospace label on the block. */
  numberClass: string
  /** Solid color — used for the colored pill inside the popup and the side panel header. */
  solidClass: string
  /** Back-compat alias for solidClass. Several legacy components (TeamCard,
   *  TlOrderCard, TeamDaySheet, etc.) still read cfg.color. */
  color: string
  /** Icon tint class for the small icon used INSIDE the soft block. */
  iconColor: string
  icon: React.ComponentType<{ className?: string }>
}

// Visit type keys reflect the actual values emitted by the calendar_visits view.
// Orders source uses orders.type literally (e.g. 'order', 'follow-up', 'site-visit')
// with 'normal_order' as the COALESCE fallback. Hyphenated and underscored
// variants both appear in the wild, so each gets its own entry pointing at
// the same config.
const VISIT_TYPE_CONFIGS: Array<Omit<VisitTypeDisplayConfig, 'color'>> = [
  // Normal order — orders.type='order' OR the COALESCE fallback 'normal_order'
  { key: 'order',               label: 'Normal Order',          blockClass: 'bg-orange-100 border-orange-300 text-orange-900', numberClass: 'text-orange-700', solidClass: 'bg-orange-500', iconColor: 'text-orange-700', icon: Briefcase },
  { key: 'normal_order',        label: 'Normal Order',          blockClass: 'bg-orange-100 border-orange-300 text-orange-900', numberClass: 'text-orange-700', solidClass: 'bg-orange-500', iconColor: 'text-orange-700', icon: Briefcase },

  { key: 'emergency',           label: 'Emergency',             blockClass: 'bg-red-100 border-red-300 text-red-900',          numberClass: 'text-red-700',    solidClass: 'bg-red-500',    iconColor: 'text-red-700',    icon: Zap },

  { key: 'follow-up',           label: 'Follow Up',             blockClass: 'bg-yellow-100 border-yellow-400 text-yellow-900', numberClass: 'text-yellow-700', solidClass: 'bg-yellow-500', iconColor: 'text-yellow-700', icon: RefreshCw },
  { key: 'follow_up',           label: 'Follow Up',             blockClass: 'bg-yellow-100 border-yellow-400 text-yellow-900', numberClass: 'text-yellow-700', solidClass: 'bg-yellow-500', iconColor: 'text-yellow-700', icon: RefreshCw },

  { key: 'follow_up_request',   label: 'Follow-up Requested',   blockClass: 'bg-yellow-50 border-yellow-400 border-dashed text-yellow-900', numberClass: 'text-yellow-700', solidClass: 'bg-amber-500',  iconColor: 'text-yellow-700', icon: RefreshCw },

  { key: 'backwork',            label: 'Backwork',              blockClass: 'bg-rose-100 border-rose-300 text-rose-900',       numberClass: 'text-rose-700',   solidClass: 'bg-rose-500',   iconColor: 'text-rose-700',   icon: Wrench },

  { key: 'site_visit',          label: 'Site Visit',            blockClass: 'bg-green-100 border-green-300 text-green-900',    numberClass: 'text-green-700',  solidClass: 'bg-green-500',  iconColor: 'text-green-700',  icon: MapPin },
  { key: 'site-visit',          label: 'Site Visit',            blockClass: 'bg-green-100 border-green-300 text-green-900',    numberClass: 'text-green-700',  solidClass: 'bg-green-500',  iconColor: 'text-green-700',  icon: MapPin },

  { key: 'site_visit_contract', label: 'Site Visit (Contract)', blockClass: 'bg-teal-100 border-teal-300 text-teal-900',       numberClass: 'text-teal-700',   solidClass: 'bg-teal-500',   iconColor: 'text-teal-700',   icon: FileText },
  { key: 'site-visit-contract', label: 'Site Visit (Contract)', blockClass: 'bg-teal-100 border-teal-300 text-teal-900',       numberClass: 'text-teal-700',   solidClass: 'bg-teal-500',   iconColor: 'text-teal-700',   icon: FileText },

  { key: 'contract_visit',      label: 'Contract Visit',        blockClass: 'bg-purple-100 border-purple-300 text-purple-900', numberClass: 'text-purple-700', solidClass: 'bg-purple-500', iconColor: 'text-purple-700', icon: ClipboardList },
  { key: 'contract',            label: 'Contract Visit',        blockClass: 'bg-purple-100 border-purple-300 text-purple-900', numberClass: 'text-purple-700', solidClass: 'bg-purple-500', iconColor: 'text-purple-700', icon: ClipboardList },

  { key: 'qc_visit',            label: 'QC Visit',              blockClass: 'bg-indigo-100 border-indigo-300 text-indigo-900', numberClass: 'text-indigo-700', solidClass: 'bg-indigo-500', iconColor: 'text-indigo-700', icon: ShieldCheck },
  { key: 'qc',                  label: 'QC Visit',              blockClass: 'bg-indigo-100 border-indigo-300 text-indigo-900', numberClass: 'text-indigo-700', solidClass: 'bg-indigo-500', iconColor: 'text-indigo-700', icon: ShieldCheck },
]

/** Back-compat: legacy code paths still pass cfg.color. Map to solidClass. */
export function solidColor(c: string): string {
  // No longer needed — kept as a passthrough so older imports don't break.
  return c
}

type ConfigBase = Omit<VisitTypeDisplayConfig, 'color'>

const FALLBACK_CONFIG: Omit<ConfigBase, 'key'> = {
  label: 'Visit',
  blockClass: 'bg-slate-100 border-slate-300 text-slate-900',
  numberClass: 'text-slate-700',
  solidClass: 'bg-slate-500',
  iconColor: 'text-slate-700',
  icon: Briefcase,
}

export function getVisitTypeConfig(visitType: string): VisitTypeDisplayConfig {
  const found = VISIT_TYPE_CONFIGS.find(c => c.key === visitType) as ConfigBase | undefined
  const base: ConfigBase = found ?? { key: visitType, ...FALLBACK_CONFIG }
  return { ...base, color: base.solidClass }
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

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m ?? 0)
}

function fmt12(t: string): string {
  const [hStr, mStr] = t.split(':')
  const h = parseInt(hStr)
  const m = mStr ?? '00'
  const period = h < 12 ? 'AM' : 'PM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${m} ${period}`
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

  const startMin  = timeToMinutes(visit.start_time)
  const endMin    = timeToMinutes(visit.end_time)
  // cellWidth is per half-hour slot (30 min)
  const leftPx    = ((startMin - dayStart * 60) / 30) * cellWidth
  const widthPx   = Math.max(((endMin - startMin) / 30) * cellWidth, 4)
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
