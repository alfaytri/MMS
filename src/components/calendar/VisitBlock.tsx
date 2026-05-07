'use client'

import { useState } from 'react'
import {
  Briefcase, Zap, RefreshCw, Wrench, MapPin, FileText, ClipboardList, ShieldCheck,
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

/** Returns display config for a visit_type string. Falls back gracefully for unknown types. */
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
  /** Width of one hour in pixels */
  cellWidth: number
  dayStart: number
  canEdit: boolean
  canSwap: boolean
  onEdit: (visit: CalendarVisit) => void
  onSwap: (visit: CalendarVisit) => void
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m ?? 0)
}

export function VisitBlock({
  visit,
  cellWidth,
  dayStart,
  canEdit,
  canSwap,
  onEdit,
  onSwap,
}: VisitBlockProps) {
  const [hovered, setHovered] = useState(false)

  if (!visit.start_time || !visit.end_time) return null

  const startMin = timeToMinutes(visit.start_time)
  const endMin   = timeToMinutes(visit.end_time)
  const startHour = dayStart
  const leftPx  = ((startMin - startHour * 60) / 60) * cellWidth
  const widthPx = Math.max(((endMin - startMin) / 60) * cellWidth, 4)

  const cfg = getVisitTypeConfig(visit.visit_type)
  const Icon = cfg.icon
  const showLabel = widthPx >= 60

  return (
    <div
      className={cn(
        'absolute top-1 bottom-1 rounded text-white text-[10px] cursor-pointer select-none transition-opacity',
        cfg.color,
        'z-20',
      )}
      style={{ left: leftPx, width: widthPx }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => canEdit && onEdit(visit)}
    >
      <div className="flex items-center gap-0.5 h-full px-1 overflow-hidden">
        <Icon className={cn('h-2.5 w-2.5 shrink-0', cfg.iconColor)} />
        {showLabel && (
          <span className="truncate leading-tight">{visit.customer_name ?? cfg.label}</span>
        )}
      </div>

      {/* Hover card */}
      {hovered && (
        <div
          className="absolute top-full left-0 mt-1 min-w-[180px] bg-popover border rounded-md shadow-lg p-2 z-30 space-y-1"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <div className="text-xs font-medium text-foreground">{visit.customer_name ?? '—'}</div>
          <div className="text-[10px] text-muted-foreground">
            {cfg.label} · {visit.start_time}–{visit.end_time}
          </div>
          <div className="text-[10px] text-muted-foreground capitalize">{visit.status}</div>

          <div className="flex gap-1 pt-1">
            {canEdit && (
              <button
                className="text-[10px] px-2 py-0.5 rounded border hover:bg-muted transition-colors"
                onClick={e => { e.stopPropagation(); onEdit(visit) }}
              >
                Edit
              </button>
            )}
            {canSwap && visit.source_type === 'order' && (
              <button
                className="text-[10px] px-2 py-0.5 rounded border hover:bg-muted transition-colors"
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
