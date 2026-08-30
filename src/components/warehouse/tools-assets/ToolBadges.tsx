import { Badge } from '@/components/ui/badge'
import { Layers, Hash, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

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

const CONDITION_META: Record<string, { cls: string }> = {
  Good: { cls: 'border-emerald-500/40 text-emerald-700 bg-emerald-500/10' },
  Fair: { cls: 'border-amber-500/40 text-amber-700 bg-amber-500/10' },
}

/** Physical health from the last check: Good (fine) / Fair (flagged — watch it). */
export function ToolConditionBadge({ condition }: { condition: string | null | undefined }) {
  if (!condition) return null
  const m = CONDITION_META[condition] ?? { cls: 'border-border text-muted-foreground' }
  return <Badge variant="outline" className={`text-[10px] h-5 px-1.5 font-normal ${m.cls}`}>{condition}</Badge>
}

// ── Tool tracking mode ────────────────────────────────────────────────────────
// One visual vocabulary for telling a BULK tool (sellable qty stock, bought and
// sold like a consumable) from a SERIALIZED tool (per-unit custody, each unit
// tracked by serial and assigned to a team), reused across the catalog tree,
// item rows, and the legend so the two read differently at a glance without
// cluttering the view. Bulk = teal · Layers (a stack of fungible quantity);
// Serialized = violet · Hash (an individual serial identity). These are
// semantic MODE accents only — the app's primary stays orange.

type ToolMode = 'serialized' | 'bulk'

const MODE_META: Record<ToolMode, { label: string; kind: string; icon: LucideIcon; title: string; cls: string; dot: string }> = {
  bulk: {
    label: 'Bulk',
    kind: 'Sellable',
    icon: Layers,
    title: 'Bulk — sellable qty stock (bought, sold on orders & consumed like a consumable)',
    cls: 'border-teal-500/40 bg-teal-500/10 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
    dot: 'bg-teal-500',
  },
  serialized: {
    label: 'Serialized',
    kind: 'Custody',
    icon: Hash,
    title: 'Serialized — per-unit custody (each unit tracked by serial, assigned to teams; not sold)',
    cls: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
    dot: 'bg-violet-500',
  },
}

/**
 * Tracking-mode chip. `withKind` appends the affordance word (Sellable /
 * Custody) for roomier spots (the catalog legend, headers); omit it on compact
 * category rows where the label alone plus the hover title is enough.
 */
export function ToolModeBadge({ mode, withKind = false, className }: { mode: ToolMode; withKind?: boolean; className?: string }) {
  const m = MODE_META[mode]
  const Icon = m.icon
  return (
    <Badge variant="outline" title={m.title} className={cn('text-[10px] h-5 px-1.5 font-normal', m.cls, className)}>
      <Icon aria-hidden />
      {m.label}
      {withKind && <span className="opacity-70">· {m.kind}</span>}
    </Badge>
  )
}

/**
 * Dense-row mode dot — colour-codes a catalog item row to its category's mode
 * without a full chip. Carries the same hover title for pointer + assistive tech.
 */
export function ToolModeDot({ mode, className }: { mode: ToolMode; className?: string }) {
  const m = MODE_META[mode]
  return (
    <span
      title={m.title}
      className={cn('inline-block h-1.5 w-1.5 rounded-full shrink-0', m.dot, className)}
    />
  )
}
