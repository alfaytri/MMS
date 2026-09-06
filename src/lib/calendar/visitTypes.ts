// src/lib/calendar/visitTypes.ts
// The single canonical visit-type display config for every calendar surface.
// Previously the solid palette lived in calendar/VisitBlock.tsx and the
// order-booking grid (orders/CalendarBlocks.tsx) hand-mirrored a parallel copy.
//
// Keys reflect the values the calendar_visits view emits — orders.type used
// literally ('order', 'follow-up', 'site-visit') plus 'normal_order' as the
// COALESCE fallback; hyphenated and underscored variants both appear, so each
// gets its own entry pointing at the same config.
import {
  Briefcase, Zap, RefreshCw, Wrench, MapPin, FileText, ClipboardList, ShieldCheck,
} from 'lucide-react'

export interface VisitTypeDisplayConfig {
  key: string
  label: string
  /** Soft compound class for the calendar block itself. */
  blockClass: string
  /** Mid-tone class for the monospace order-number label on the block. */
  numberClass: string
  /** Lighter pill class for popup/inline badges (order grid). */
  badgeClass: string
  /** Solid color — the colored pill inside the popup / side-panel header. */
  solidClass: string
  /** Back-compat alias for solidClass (legacy consumers read cfg.color). */
  color: string
  /** Icon tint class for the small icon inside the soft block. */
  iconColor: string
  icon: React.ComponentType<{ className?: string }>
}

type ConfigBase = Omit<VisitTypeDisplayConfig, 'color'>

const VISIT_TYPE_CONFIGS: ConfigBase[] = [
  { key: 'order',               label: 'Normal Order',          blockClass: 'bg-orange-100 border-orange-300 text-orange-900', numberClass: 'text-orange-700', badgeClass: 'border-orange-200 bg-orange-50 text-orange-700', solidClass: 'bg-orange-500', iconColor: 'text-orange-700', icon: Briefcase },
  { key: 'normal_order',        label: 'Normal Order',          blockClass: 'bg-orange-100 border-orange-300 text-orange-900', numberClass: 'text-orange-700', badgeClass: 'border-orange-200 bg-orange-50 text-orange-700', solidClass: 'bg-orange-500', iconColor: 'text-orange-700', icon: Briefcase },

  { key: 'emergency',           label: 'Emergency',             blockClass: 'bg-red-100 border-red-300 text-red-900',          numberClass: 'text-red-700',    badgeClass: 'border-red-200 bg-red-50 text-red-700',       solidClass: 'bg-red-500',    iconColor: 'text-red-700',    icon: Zap },

  { key: 'follow-up',           label: 'Follow Up',             blockClass: 'bg-yellow-100 border-yellow-400 text-yellow-900', numberClass: 'text-yellow-700', badgeClass: 'border-yellow-300 bg-yellow-50 text-yellow-800', solidClass: 'bg-yellow-500', iconColor: 'text-yellow-700', icon: RefreshCw },
  { key: 'follow_up',           label: 'Follow Up',             blockClass: 'bg-yellow-100 border-yellow-400 text-yellow-900', numberClass: 'text-yellow-700', badgeClass: 'border-yellow-300 bg-yellow-50 text-yellow-800', solidClass: 'bg-yellow-500', iconColor: 'text-yellow-700', icon: RefreshCw },

  { key: 'follow_up_request',   label: 'Follow-up Requested',   blockClass: 'bg-yellow-50 border-yellow-400 border-dashed text-yellow-900', numberClass: 'text-yellow-700', badgeClass: 'border-yellow-300 bg-yellow-100 text-yellow-800', solidClass: 'bg-amber-500',  iconColor: 'text-yellow-700', icon: RefreshCw },

  { key: 'backwork',            label: 'Backwork',              blockClass: 'bg-rose-100 border-rose-300 text-rose-900',       numberClass: 'text-rose-700',   badgeClass: 'border-rose-200 bg-rose-50 text-rose-700',    solidClass: 'bg-rose-500',   iconColor: 'text-rose-700',   icon: Wrench },

  { key: 'site_visit',          label: 'Site Visit',            blockClass: 'bg-green-100 border-green-300 text-green-900',    numberClass: 'text-green-700',  badgeClass: 'border-green-200 bg-green-50 text-green-700', solidClass: 'bg-green-500',  iconColor: 'text-green-700',  icon: MapPin },
  { key: 'site-visit',          label: 'Site Visit',            blockClass: 'bg-green-100 border-green-300 text-green-900',    numberClass: 'text-green-700',  badgeClass: 'border-green-200 bg-green-50 text-green-700', solidClass: 'bg-green-500',  iconColor: 'text-green-700',  icon: MapPin },

  { key: 'site_visit_contract', label: 'Site Visit (Contract)', blockClass: 'bg-teal-100 border-teal-300 text-teal-900',       numberClass: 'text-teal-700',   badgeClass: 'border-teal-200 bg-teal-50 text-teal-700',    solidClass: 'bg-teal-500',   iconColor: 'text-teal-700',   icon: FileText },
  { key: 'site-visit-contract', label: 'Site Visit (Contract)', blockClass: 'bg-teal-100 border-teal-300 text-teal-900',       numberClass: 'text-teal-700',   badgeClass: 'border-teal-200 bg-teal-50 text-teal-700',    solidClass: 'bg-teal-500',   iconColor: 'text-teal-700',   icon: FileText },

  { key: 'contract_visit',      label: 'Contract Visit',        blockClass: 'bg-purple-100 border-purple-300 text-purple-900', numberClass: 'text-purple-700', badgeClass: 'border-purple-200 bg-purple-50 text-purple-700', solidClass: 'bg-purple-500', iconColor: 'text-purple-700', icon: ClipboardList },
  { key: 'contract',            label: 'Contract Visit',        blockClass: 'bg-purple-100 border-purple-300 text-purple-900', numberClass: 'text-purple-700', badgeClass: 'border-purple-200 bg-purple-50 text-purple-700', solidClass: 'bg-purple-500', iconColor: 'text-purple-700', icon: ClipboardList },

  { key: 'qc_visit',            label: 'QC Visit',              blockClass: 'bg-indigo-100 border-indigo-300 text-indigo-900', numberClass: 'text-indigo-700', badgeClass: 'border-indigo-200 bg-indigo-50 text-indigo-700', solidClass: 'bg-indigo-500', iconColor: 'text-indigo-700', icon: ShieldCheck },
  { key: 'qc',                  label: 'QC Visit',              blockClass: 'bg-indigo-100 border-indigo-300 text-indigo-900', numberClass: 'text-indigo-700', badgeClass: 'border-indigo-200 bg-indigo-50 text-indigo-700', solidClass: 'bg-indigo-500', iconColor: 'text-indigo-700', icon: ShieldCheck },
]

const FALLBACK_CONFIG: Omit<ConfigBase, 'key'> = {
  label: 'Visit',
  blockClass: 'bg-slate-100 border-slate-300 text-slate-900',
  numberClass: 'text-slate-700',
  badgeClass: 'border-slate-200 bg-slate-50 text-slate-700',
  solidClass: 'bg-slate-500',
  iconColor: 'text-slate-700',
  icon: Briefcase,
}

/** Back-compat passthrough (legacy code paths pass cfg.color). */
export function solidColor(c: string): string {
  return c
}

export function getVisitTypeConfig(visitType: string): VisitTypeDisplayConfig {
  const found = VISIT_TYPE_CONFIGS.find((c) => c.key === visitType)
  const base: ConfigBase = found ?? { key: visitType, ...FALLBACK_CONFIG }
  return { ...base, color: base.solidClass }
}
