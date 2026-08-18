'use client'

import { useMemo, useState } from 'react'
import { UserRound, Users2, Wrench } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { useActiveDivision } from '@/components/providers/DivisionProvider'
import { useTeamsWithToolCounts, type TeamToolCount } from '@/hooks/useToolAssignments'
import { TeamToolsDetail } from './TeamToolsDetail'

// Natural/numeric collation so "Team 2" sorts before "Team 10".
const COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export function TeamsTab() {
  // Top-bar division view filter — empty set = "All divisions".
  const { viewDivisionIds } = useActiveDivision()
  const divisionIds = useMemo(() => Array.from(viewDivisionIds), [viewDivisionIds])
  const { data: teams = [], isLoading, error } = useTeamsWithToolCounts(divisionIds.length ? divisionIds : undefined)
  const [selected, setSelected] = useState<TeamToolCount | null>(null)

  const sorted = useMemo(
    () => [...teams].sort((a, b) => COLLATOR.compare(a.team_name, b.team_name)),
    [teams],
  )

  if (selected) {
    return (
      <TeamToolsDetail
        team={{
          id: selected.team_id,
          name: selected.team_name,
          divisionId: selected.division_id,
          divisionName: selected.division_name,
        }}
        onBack={() => setSelected(null)}
      />
    )
  }

  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>

  if (isLoading) {
    return (
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
      </div>
    )
  }

  if (sorted.length === 0) {
    return (
      <EmptyState
        icon={<Users2 className="h-6 w-6 text-muted-foreground" />}
        title="No teams in view"
        description="No custody teams in the division selected in the top bar. Switch division (or pick “All”), or create a team in Master Data → Custody Locations."
      />
    )
  }

  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {sorted.map((t) => (
        <button
          key={t.team_id}
          type="button"
          onClick={() => setSelected(t)}
          className="text-left rounded-lg border bg-card shadow-sm p-4 min-h-[7rem] min-w-0 flex flex-col gap-1 hover:bg-accent transition-colors"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <Users2 className="h-4 w-4 text-primary shrink-0" />
            <span className="font-semibold text-sm truncate">{t.team_name}</span>
          </div>
          <span className="text-[11px] text-muted-foreground truncate">{t.division_name ?? 'Unassigned'}</span>
          <div className="mt-1 flex items-center gap-1 text-sm">
            <Wrench className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="tabular-nums">{t.held_count}</span>
            <span className="text-muted-foreground">tool{t.held_count === 1 ? '' : 's'}</span>
          </div>
          {t.responsible_person_name && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground min-w-0">
              <UserRound className="h-3 w-3 shrink-0" />
              <span className="truncate">{t.responsible_person_name}</span>
            </div>
          )}
        </button>
      ))}
    </div>
  )
}
