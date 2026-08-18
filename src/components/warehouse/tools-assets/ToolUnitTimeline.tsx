'use client'

import { useMemo } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useToolUnitTimeline } from '@/hooks/useToolUnitHistory'

function fmtDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
}

export function ToolUnitTimeline({
  unit, onBack,
}: {
  unit: { id: string; label: string }
  onBack: () => void
}) {
  const { data: rows = [], isLoading, error } = useToolUnitTimeline(unit.id)

  const firstAssigned = rows.length ? rows[0].assigned_at : null
  const totalDays = useMemo(() => rows.reduce((sum, r) => sum + Number(r.days ?? 0), 0), [rows])
  const perTeam = useMemo(() => {
    const m = new Map<string, { name: string; days: number }>()
    for (const r of rows) {
      const key = r.team_id ?? 'unknown'
      const cur = m.get(key) ?? { name: r.team_name ?? '—', days: 0 }
      cur.days += Number(r.days ?? 0)
      m.set(key, cur)
    }
    return Array.from(m.values()).sort((a, b) => b.days - a.days)
  }, [rows])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 min-w-0">
        <Button variant="ghost" size="sm" className="h-8 gap-1 shrink-0" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Search
        </Button>
        <div className="font-semibold text-sm truncate">{unit.label}</div>
      </div>

      {/* Fixed min-height so the summary line doesn't shift the layout while loading. */}
      <div className="min-h-[2.5rem] text-sm text-muted-foreground">
        {error ? (
          <span className="text-destructive">{(error as Error).message}</span>
        ) : isLoading ? (
          'Loading history…'
        ) : firstAssigned ? (
          <>
            First assigned <span className="text-foreground">{fmtDate(firstAssigned)}</span> ·{' '}
            {rows.length} stint{rows.length === 1 ? '' : 's'} · {totalDays.toFixed(1)} total days
          </>
        ) : (
          'This tool has never been assigned to a team yet.'
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : rows.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border p-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Total days per team
            </div>
            <ul className="space-y-1 text-sm">
              {perTeam.map((t, i) => (
                <li key={i} className="flex items-center justify-between gap-2">
                  <span className="truncate">{t.name}</span>
                  <span className="tabular-nums shrink-0">{t.days.toFixed(1)} d</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border p-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Timeline
            </div>
            <ol className="relative border-l pl-4 space-y-3">
              {rows.map((r) => (
                <li key={r.assignment_id} className="relative text-sm">
                  <span className="absolute -left-[1.30rem] top-1 h-2.5 w-2.5 rounded-full border bg-background" />
                  <div className="font-medium truncate">
                    {r.team_name ?? '—'}
                    {r.is_current && <span className="ml-1 text-[11px] text-green-600">(current)</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {fmtDate(r.assigned_at)} → {r.released_at ? fmtDate(r.released_at) : 'now'} ·{' '}
                    {Number(r.days).toFixed(1)} days
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : null}
    </div>
  )
}
