'use client'

import { useMemo, useState } from 'react'
import {
  Plus, Pencil, Trash2, CheckCircle2, XCircle, KeyRound, Archive,
  UsersRound, ChevronRight, Loader2, SearchX, Activity,
} from 'lucide-react'
import type { ActivityLog } from '@/hooks/useActivityLog'
import { useAuditEntityNames } from '@/hooks/useAuditEntityNames'
import { computeFieldDiff } from '@/lib/utils/computeFieldDiff'
import { humanizeModule } from '@/lib/utils/auditPermissionMap'
import { format, isToday, isYesterday, formatDistanceToNow } from 'date-fns'

// ─── Action taxonomy ───────────────────────────────────────────────────────────

type ActionKind = 'create' | 'update' | 'delete' | 'approve' | 'reject' | 'toggle' | 'auth' | 'assign' | 'other'

function classifyAction(action: string): ActionKind {
  const a = action.toLowerCase()
  if (/create|add|insert/.test(a))                    return 'create'
  if (/approve/.test(a))                              return 'approve'
  if (/reject|deny|decline/.test(a))                  return 'reject'
  if (/delete|remove|destroy/.test(a))                return 'delete'
  if (/activate|deactivate|archive|restore|toggle/.test(a)) return 'toggle'
  if (/login|logout|signin|signout|auth/.test(a))     return 'auth'
  if (/assign|invite|share/.test(a))                  return 'assign'
  if (/update|change|edit|modify|patch/.test(a))      return 'update'
  return 'other'
}

const ACTION_META: Record<ActionKind, {
  label:    string
  Icon:     typeof Plus
  bg:       string
  fg:       string
  ring:     string
  chipBg:   string
  chipFg:   string
}> = {
  create:  { label: 'Created',  Icon: Plus,         bg: 'bg-success/10',      fg: 'text-success',        ring: 'ring-success/30',      chipBg: 'bg-success/10',      chipFg: 'text-success' },
  update:  { label: 'Updated',  Icon: Pencil,       bg: 'bg-primary/10',      fg: 'text-primary',        ring: 'ring-primary/30',      chipBg: 'bg-primary/10',      chipFg: 'text-primary' },
  delete:  { label: 'Deleted',  Icon: Trash2,       bg: 'bg-destructive/10',  fg: 'text-destructive',    ring: 'ring-destructive/30',  chipBg: 'bg-destructive/10',  chipFg: 'text-destructive' },
  approve: { label: 'Approved', Icon: CheckCircle2, bg: 'bg-success/10',      fg: 'text-success',        ring: 'ring-success/30',      chipBg: 'bg-success/10',      chipFg: 'text-success' },
  reject:  { label: 'Rejected', Icon: XCircle,      bg: 'bg-destructive/10',  fg: 'text-destructive',    ring: 'ring-destructive/30',  chipBg: 'bg-destructive/10',  chipFg: 'text-destructive' },
  toggle:  { label: 'Toggled',  Icon: Archive,      bg: 'bg-warning/10',      fg: 'text-warning',        ring: 'ring-warning/30',      chipBg: 'bg-warning/10',      chipFg: 'text-warning' },
  auth:    { label: 'Auth',     Icon: KeyRound,     bg: 'bg-muted',           fg: 'text-muted-foreground', ring: 'ring-border',         chipBg: 'bg-muted',           chipFg: 'text-muted-foreground' },
  assign:  { label: 'Assigned', Icon: UsersRound,   bg: 'bg-blue-500/10',     fg: 'text-blue-600',       ring: 'ring-blue-500/30',     chipBg: 'bg-blue-500/10',     chipFg: 'text-blue-600' },
  other:   { label: 'Event',    Icon: Activity,     bg: 'bg-muted',           fg: 'text-muted-foreground', ring: 'ring-border',         chipBg: 'bg-muted',           chipFg: 'text-muted-foreground' },
}

// ─── Entity name resolution ────────────────────────────────────────────────────

const NAME_KEYS = [
  'name', 'name_en', 'name_ar', 'full_name', 'brand',
  'po_number', 'order_number', 'so_number',
  'bill_number', 'invoice_number', 'return_number', 'rcv_number',
  'code', 'label', 'reference', 'title', 'sku',
]

function extractName(data: Record<string, unknown> | null | undefined): string | null {
  if (!data) return null
  for (const key of NAME_KEYS) {
    const val = data[key]
    if (val != null && val !== '') return String(val)
  }
  return null
}

function resolveEntityName(entry: ActivityLog, nameLookup?: Map<string, string>): string {
  return (
    extractName(entry.new_data as Record<string, unknown> | null)
    ?? extractName(entry.old_data as Record<string, unknown> | null)
    ?? nameLookup?.get(entry.entity_id)
    ?? entry.details
    ?? entry.entity_id.slice(0, 8)
  )
}

function entityTypeLabel(entry: ActivityLog): string {
  return entry.entity_type?.replace(/_/g, ' ') ?? 'record'
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '??'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Deterministic actor hue based on name
const ACTOR_HUES = [
  { bg: 'bg-primary/10',       fg: 'text-primary',       ring: 'ring-primary/30' },
  { bg: 'bg-blue-500/10',      fg: 'text-blue-600',      ring: 'ring-blue-500/30' },
  { bg: 'bg-success/10',       fg: 'text-success',       ring: 'ring-success/30' },
  { bg: 'bg-warning/10',       fg: 'text-warning',       ring: 'ring-warning/30' },
  { bg: 'bg-purple-500/10',    fg: 'text-purple-600',    ring: 'ring-purple-500/30' },
  { bg: 'bg-pink-500/10',      fg: 'text-pink-600',      ring: 'ring-pink-500/30' },
  { bg: 'bg-teal-500/10',      fg: 'text-teal-600',      ring: 'ring-teal-500/30' },
]
function actorHue(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff
  return ACTOR_HUES[hash % ACTOR_HUES.length]
}

// ─── Day grouping ──────────────────────────────────────────────────────────────

function dayLabel(iso: string): string {
  const d = new Date(iso)
  if (isToday(d))     return `Today · ${format(d, 'EEE dd MMM')}`
  if (isYesterday(d)) return `Yesterday · ${format(d, 'EEE dd MMM')}`
  return format(d, 'EEE dd MMM yyyy')
}

function dayKey(iso: string): string {
  return iso.slice(0, 10) // YYYY-MM-DD
}

// ─── Action filter chips ───────────────────────────────────────────────────────

const ACTION_CHIPS: { kind: ActionKind | 'all'; label: string }[] = [
  { kind: 'all',     label: 'All' },
  { kind: 'create',  label: 'Created' },
  { kind: 'update',  label: 'Updated' },
  { kind: 'delete',  label: 'Deleted' },
  { kind: 'approve', label: 'Approved' },
  { kind: 'reject',  label: 'Rejected' },
]

function ActionChips({
  value, onChange, counts,
}: {
  value: ActionKind | 'all'
  onChange: (v: ActionKind | 'all') => void
  counts: Partial<Record<ActionKind | 'all', number>>
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ACTION_CHIPS.map(({ kind, label }) => {
        const active = value === kind
        const meta = kind === 'all' ? null : ACTION_META[kind]
        const n = counts[kind] ?? 0
        return (
          <button
            key={kind}
            type="button"
            onClick={() => onChange(kind)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ring-1 transition-colors ${
              active
                ? kind === 'all'
                  ? 'bg-foreground text-background ring-foreground'
                  : `${meta!.bg} ${meta!.fg} ${meta!.ring} ring-2`
                : 'bg-background text-muted-foreground ring-border hover:bg-muted/50'
            }`}
          >
            {meta && <meta.Icon className="h-3 w-3" />}
            <span>{label}</span>
            <span className={`tabular-nums ${active && kind === 'all' ? 'text-background/70' : 'text-muted-foreground/70'}`}>{n}</span>
          </button>
        )
      })}
    </div>
  )
}

// ─── Timeline row ──────────────────────────────────────────────────────────────

function TimelineRow({
  entry, nameLookup, expanded, onToggle,
}: {
  entry:      ActivityLog
  nameLookup: Map<string, string> | undefined
  expanded:   boolean
  onToggle:   (id: string) => void
}) {
  const kind      = classifyAction(entry.action)
  const meta      = ACTION_META[kind]
  const actor     = entry.performer_name ?? 'System'
  const hue       = actorHue(actor)
  const entityName = resolveEntityName(entry, nameLookup)
  const entityTy  = entityTypeLabel(entry)

  const diffs = useMemo(
    () => computeFieldDiff(
      entry.old_data as Record<string, unknown> | null,
      entry.new_data as Record<string, unknown> | null,
    ),
    [entry.old_data, entry.new_data],
  )

  const createdAt = new Date(entry.created_at ?? Date.now())
  const canExpand = diffs.length > 0

  return (
    <div className={`group border rounded-lg transition-colors ${expanded ? 'bg-muted/20' : 'bg-background hover:bg-muted/10'}`}>
      <button
        type="button"
        disabled={!canExpand}
        onClick={() => canExpand && onToggle(entry.id)}
        className={`w-full flex items-start gap-3 px-3 py-2.5 text-left ${canExpand ? 'cursor-pointer' : 'cursor-default'}`}
      >
        {/* Actor avatar */}
        <div className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold ring-2 ${hue.bg} ${hue.fg} ${hue.ring}`}>
          {initialsOf(actor)}
        </div>

        {/* Action icon */}
        <div className={`h-6 w-6 shrink-0 rounded-full flex items-center justify-center mt-1 ${meta.bg} ${meta.fg} ring-1 ${meta.ring}`}>
          <meta.Icon className="h-3 w-3" />
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {entry.module && (
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${meta.chipBg} ${meta.chipFg}`}>
                {humanizeModule(entry.module)}
              </span>
            )}
            {canExpand && (
              <span className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                {diffs.length} {diffs.length === 1 ? 'field' : 'fields'}
              </span>
            )}
          </div>
          <p className="text-[12px] leading-snug">
            <span className="font-semibold">{actor}</span>
            <span className="text-muted-foreground"> {meta.label.toLowerCase()} </span>
            <span className="text-muted-foreground">{entityTy}</span>
            {entityName && <span className="font-medium ml-1">&ldquo;{entityName}&rdquo;</span>}
          </p>
        </div>

        {/* Timestamp + chevron */}
        <div className="flex flex-col items-end shrink-0 gap-0.5">
          <time
            title={format(createdAt, 'PPpp')}
            dateTime={createdAt.toISOString()}
            className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap"
          >
            {formatDistanceToNow(createdAt, { addSuffix: true })}
          </time>
          <span className="text-[9px] text-muted-foreground/60 tabular-nums">
            {format(createdAt, 'HH:mm')}
          </span>
          {canExpand && (
            <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform mt-0.5 ${expanded ? 'rotate-90' : ''}`} />
          )}
        </div>
      </button>

      {expanded && diffs.length > 0 && (
        <div className="px-3 pb-3 pt-1 pl-14 border-t space-y-2">
          {diffs.map((d) => (
            <div key={d.field} className="text-[11px] font-mono">
              <div className="text-muted-foreground mb-0.5">{d.label}</div>
              {d.arrayDiff ? (
                <div className="pl-3 space-y-0.5 max-h-48 overflow-y-auto">
                  {d.arrayDiff.removed.map((v) => (
                    <div key={`r-${v}`} className="text-destructive/80 break-all">
                      <span className="select-none">−&nbsp;</span>{v}
                    </div>
                  ))}
                  {d.arrayDiff.added.map((v) => (
                    <div key={`a-${v}`} className="text-success break-all">
                      <span className="select-none">+&nbsp;</span>{v}
                    </div>
                  ))}
                </div>
              ) : d.from && d.to ? (
                <div className="pl-3 space-y-0.5">
                  <div className="text-destructive/80 line-through break-all">{d.from}</div>
                  <div className="text-success break-all">{d.to}</div>
                </div>
              ) : d.to ? (
                <div className="pl-3 text-success break-all">
                  <span className="select-none">+&nbsp;</span>{d.to}
                </div>
              ) : d.from ? (
                <div className="pl-3 text-destructive/80 line-through break-all">
                  <span className="select-none no-underline">−&nbsp;</span>{d.from}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main timeline ─────────────────────────────────────────────────────────────

interface Props {
  logs:       ActivityLog[]
  isLoading:  boolean
  searchTerm?: string
}

export function AuditTimeline({ logs, isLoading }: Props) {
  const { data: nameLookup } = useAuditEntityNames(logs)
  const [actionFilter, setActionFilter] = useState<ActionKind | 'all'>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const counts = useMemo(() => {
    const c: Partial<Record<ActionKind | 'all', number>> = { all: logs.length }
    for (const log of logs) {
      const k = classifyAction(log.action)
      c[k] = (c[k] ?? 0) + 1
    }
    return c
  }, [logs])

  const filtered = useMemo(() => {
    if (actionFilter === 'all') return logs
    return logs.filter((l) => classifyAction(l.action) === actionFilter)
  }, [logs, actionFilter])

  const byDay = useMemo(() => {
    const map = new Map<string, ActivityLog[]>()
    for (const log of filtered) {
      const k = dayKey(log.created_at ?? new Date().toISOString())
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(log)
    }
    return Array.from(map.entries())
  }, [filtered])

  function toggle(id: string) {
    setExpanded((prev) => {
      const n = new Set(prev)
      if (n.has(id)) { n.delete(id) } else { n.add(id) }
      return n
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading audit trail…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ActionChips value={actionFilter} onChange={setActionFilter} counts={counts} />

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <SearchX className="h-10 w-10 mb-3 opacity-40" />
          <p className="text-sm">No audit entries found</p>
          <p className="text-xs mt-1">Try adjusting your filters or date range</p>
        </div>
      ) : (
        <div className="space-y-4">
          {byDay.map(([key, entries]) => {
            const firstIso = entries[0]?.created_at ?? key
            return (
              <div key={key} className="space-y-1.5">
                <div className="sticky top-0 z-10 -mx-3 px-3 py-2 flex items-center gap-2 bg-background border-b">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground">
                    {dayLabel(firstIso)}
                  </span>
                  <span className="text-[10px] text-muted-foreground tabular-nums ml-auto">
                    {entries.length} {entries.length === 1 ? 'event' : 'events'}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {entries.map((entry) => (
                    <TimelineRow
                      key={entry.id}
                      entry={entry}
                      nameLookup={nameLookup}
                      expanded={expanded.has(entry.id)}
                      onToggle={toggle}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
