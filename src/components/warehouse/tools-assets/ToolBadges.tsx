import { Badge } from '@/components/ui/badge'

/**
 * Shared tool badges (consistent vocabulary across the team view, repair bucket,
 * and unit rows). Status = physical state; Lifecycle = New/Used/Repaired age axis.
 */

const STATUS_META: Record<string, { label: string; cls: string }> = {
  assigned:    { label: 'In service',   cls: 'border-border text-foreground' },
  available:   { label: 'Available',    cls: 'border-border text-muted-foreground' },
  maintenance: { label: 'Under repair', cls: 'border-amber-500/40 text-amber-700 bg-amber-500/10' },
  retired:     { label: 'Retired',      cls: 'border-border text-muted-foreground' },
}

export function ToolStatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, cls: 'border-border text-muted-foreground' }
  return <Badge variant="outline" className={`text-[10px] h-5 px-1.5 font-normal ${m.cls}`}>{m.label}</Badge>
}

const LIFECYCLE_META: Record<string, { label: string; cls: string }> = {
  new:      { label: 'New',      cls: 'border-emerald-500/40 text-emerald-700 bg-emerald-500/10' },
  used:     { label: 'Used',     cls: 'border-border text-muted-foreground' },
  repaired: { label: 'Repaired', cls: 'border-sky-500/40 text-sky-700 bg-sky-500/10' },
}

/** New (fresh, lasts longest) → Used → Repaired (shortest remaining life). */
export function ToolLifecycleBadge({ type }: { type: string | null | undefined }) {
  if (!type) return null
  const m = LIFECYCLE_META[type] ?? { label: type, cls: 'border-border text-muted-foreground' }
  return <Badge variant="outline" className={`text-[10px] h-5 px-1.5 font-normal ${m.cls}`}>{m.label}</Badge>
}
