'use client'

import { useState } from 'react'
import {
  Briefcase, Zap, RefreshCw, Wrench, MapPin, FileText, ClipboardList, ShieldCheck, Phone,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CalendarVisit } from '@/hooks/useCalendarVisits'

export interface VisitTypeDisplayConfig {
  key: string
  label: string
  color: string          // Tailwind bg class
  iconColor: string      // Tailwind text class for icon
  icon: React.ComponentType<{ className?: string }>
}

const VISIT_TYPE_CONFIGS: VisitTypeDisplayConfig[] = [
  { key: 'normal_order',        label: 'Normal Order',          color: 'bg-blue-500',   iconColor: 'text-blue-100',   icon: Briefcase },
  { key: 'emergency',           label: 'Emergency',             color: 'bg-red-500',    iconColor: 'text-red-100',    icon: Zap },
  { key: 'follow_up',           label: 'Follow Up',             color: 'bg-orange-400', iconColor: 'text-orange-100', icon: RefreshCw },
  { key: 'backwork',            label: 'Backwork',              color: 'bg-yellow-500', iconColor: 'text-yellow-100', icon: Wrench },
  { key: 'site_visit',          label: 'Site Visit',            color: 'bg-green-500',  iconColor: 'text-green-100',  icon: MapPin },
  { key: 'site_visit_contract', label: 'Site Visit (Contract)', color: 'bg-teal-500',   iconColor: 'text-teal-100',   icon: FileText },
  { key: 'contract_visit',      label: 'Contract Visit',        color: 'bg-purple-500', iconColor: 'text-purple-100', icon: ClipboardList },
  { key: 'qc_visit',            label: 'QC Visit',              color: 'bg-pink-500',   iconColor: 'text-pink-100',   icon: ShieldCheck },
]

const FALLBACK_CONFIG: Omit<VisitTypeDisplayConfig, 'key'> = {
  label: 'Visit',
  color: 'bg-slate-500',
  iconColor: 'text-slate-100',
  icon: Briefcase,
}

export function getVisitTypeConfig(visitType: string): VisitTypeDisplayConfig {
  return (
    VISIT_TYPE_CONFIGS.find(c => c.key === visitType) ?? {
      key: visitType,
      ...FALLBACK_CONFIG,
    }
  )
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
  const leftPx    = ((startMin - dayStart * 60) / 60) * cellWidth
  const widthPx   = Math.max(((endMin - startMin) / 60) * cellWidth, 4)
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
        'absolute rounded-sm text-white text-[10px] cursor-pointer select-none transition-opacity hover:opacity-90',
        cfg.color,
        'z-20',
      )}
      style={{ left: leftPx, width: widthPx, top: topPx, height: heightPx }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onEdit(visit)}
    >
      {/* Block content */}
      <div className="flex items-center gap-0.5 h-full px-1.5 overflow-hidden">
        <Icon className={cn('h-3 w-3 shrink-0', cfg.iconColor)} />
        {showOrderNum && visit.order_number && (
          <span className="truncate leading-none font-mono text-[9px] opacity-90">
            {visit.order_number.replace('N/2026/', '')}
          </span>
        )}
        {showName && (
          <span className="truncate leading-none ml-0.5">
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
        <div
          className="absolute top-full left-0 mt-1 min-w-[220px] bg-popover border border-border rounded-lg shadow-xl p-3 z-30 space-y-2"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {/* Order number */}
          {visit.order_number && (
            <p className="font-mono font-bold text-foreground text-sm">{visit.order_number}</p>
          )}

          {/* Type + status */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white', cfg.color)}>
              <Icon className="h-2.5 w-2.5" />
              {cfg.label}
            </span>
            <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
              {visit.status}
            </span>
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
            {visit.services_summary && (
              <p className="text-[11px] text-muted-foreground border-t pt-1.5">{visit.services_summary}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-1 pt-0.5 border-t">
            {canEdit && (
              <button
                className="flex-1 text-[11px] font-medium px-2 py-1 rounded border hover:bg-muted transition-colors"
                onClick={e => { e.stopPropagation(); onEdit(visit) }}
              >
                View Details
              </button>
            )}
            {canSwap && visit.source_type === 'order' && (
              <button
                className="flex-1 text-[11px] font-medium px-2 py-1 rounded border hover:bg-muted transition-colors"
                onClick={e => { e.stopPropagation(); onSwap(visit) }}
              >
                Swap Team
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
