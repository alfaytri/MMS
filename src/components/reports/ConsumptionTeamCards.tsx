'use client'

import { useMemo } from 'react'
import type { ProjectConsumptionRow } from '@/hooks/reports/useProjectConsumptionReport'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'

const QAR = new Intl.NumberFormat('en-QA', { style: 'currency', currency: 'QAR', maximumFractionDigits: 2 })
const NUM = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

type DayGroup = { date: string; items: ProjectConsumptionRow[]; total: number; qty: number }
type TeamGroup = { id: string; name: string; days: DayGroup[]; total: number; qty: number }

/** Team → day → items. Teams sort naturally ("Team 2" before "Team 10"); days ascending. */
function groupTeams(rows: ProjectConsumptionRow[]): TeamGroup[] {
  const byTeam = new Map<string, ProjectConsumptionRow[]>()
  for (const r of rows) {
    const arr = byTeam.get(r.consumer_id) ?? []
    arr.push(r)
    byTeam.set(r.consumer_id, arr)
  }
  return [...byTeam.entries()]
    .map(([id, teamRows]) => {
      const byDay = new Map<string, ProjectConsumptionRow[]>()
      for (const r of teamRows) {
        const arr = byDay.get(r.consumed_on) ?? []
        arr.push(r)
        byDay.set(r.consumed_on, arr)
      }
      const days: DayGroup[] = [...byDay.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, items]) => ({
          date,
          items,
          total: items.reduce((s, x) => s + (x.total_cost ?? 0), 0),
          qty: items.reduce((s, x) => s + (x.qty ?? 0), 0),
        }))
      return {
        id,
        name: teamRows[0]?.consumer_name ?? '—',
        days,
        total: teamRows.reduce((s, x) => s + (x.total_cost ?? 0), 0),
        qty: teamRows.reduce((s, x) => s + (x.qty ?? 0), 0),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
}

function DayCard({ day }: { day: DayGroup }) {
  return (
    <div className="flex flex-col rounded-lg border bg-card">
      <div className="flex items-baseline justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <span className="text-xs font-semibold tabular-nums 2xl:text-sm">{day.date}</span>
        <span className="text-xs font-semibold tabular-nums 2xl:text-sm">{QAR.format(day.total)}</span>
      </div>
      <ul className="divide-y">
        {day.items.map((it, i) => (
          <li key={i} className="flex items-start justify-between gap-3 px-3 py-2">
            <span className="min-w-0 break-words text-xs leading-snug 2xl:text-sm">{it.item_name ?? '—'}</span>
            <span className="flex shrink-0 items-baseline gap-2.5 text-xs tabular-nums 2xl:text-sm">
              <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                ×{NUM.format(it.qty)}
              </span>
              <span className="w-20 text-right font-medium 2xl:w-24">{QAR.format(it.total_cost)}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-auto flex items-center justify-between border-t px-3 py-1.5 text-[11px] text-muted-foreground 2xl:text-xs">
        <span>{day.items.length} item{day.items.length === 1 ? '' : 's'}</span>
        <span className="tabular-nums">{NUM.format(day.qty)} qty</span>
      </div>
    </div>
  )
}

/**
 * Picture-book view of team consumption: one card per day, that day's items
 * stacked inside, grouped under each team. Replaces the tabular Teams view —
 * teams carry no discipline/milestone, so the day is the only axis that matters.
 */
export function ConsumptionTeamCards({
  rows, isLoading, emptyText = 'No team consumption in the selected period.',
}: {
  rows: ProjectConsumptionRow[]
  isLoading?: boolean
  emptyText?: string
}) {
  const teams = useMemo(() => groupTeams(rows), [rows])
  const grand = useMemo(
    () => ({
      total: rows.reduce((s, x) => s + (x.total_cost ?? 0), 0),
      qty: rows.reduce((s, x) => s + (x.qty ?? 0), 0),
    }),
    [rows],
  )

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-lg border bg-muted/40" />
        ))}
      </div>
    )
  }

  if (teams.length === 0) {
    return (
      <div className="rounded-lg border bg-card px-3 py-10 text-center text-sm text-muted-foreground">
        {emptyText}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {teams.map((team) => (
        <div key={team.id} className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b pb-1.5">
            <h3 className="text-sm font-semibold 2xl:text-base">{team.name}</h3>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums 2xl:text-sm">
              {NUM.format(team.qty)} qty · <span className="font-semibold text-foreground">{QAR.format(team.total)}</span>
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {team.days.map((day, i) => (
              <div key={day.date} className={STAGGER_IN} style={staggerDelay(i)}>
                <DayCard day={day} />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between gap-3 rounded-lg border border-foreground/15 bg-primary/5 px-3 py-2.5 text-sm font-semibold">
        <span>All teams</span>
        <span className="tabular-nums">
          {NUM.format(grand.qty)} qty · {QAR.format(grand.total)}
        </span>
      </div>
    </div>
  )
}
