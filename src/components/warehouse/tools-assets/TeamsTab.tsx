'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, ClipboardCheck, UserRound, Users2, Wrench } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { useActiveDivision } from '@/components/providers/DivisionProvider'
import { useTeamsWithToolCounts, type TeamToolCount } from '@/hooks/useToolAssignments'
import { TeamToolsDetail } from './TeamToolsDetail'

// Natural/numeric collation so "Team 2" sorts before "Team 10".
const COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export function TeamsTab({ onStartCheck }: { onStartCheck?: (divisionId: string) => void }) {
  // Top-bar division view filter — empty set = "All divisions".
  const { viewDivisionIds } = useActiveDivision()
  const divisionIds = useMemo(() => Array.from(viewDivisionIds), [viewDivisionIds])
  const { data: teams = [], isLoading, error } = useTeamsWithToolCounts(divisionIds.length ? divisionIds : undefined)
  const [selected, setSelected] = useState<TeamToolCount | null>(null)
  // Division sections default expanded; a name in this set is collapsed.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // Group teams by division (sorted by division name); teams numeric-sorted within each.
  const grouped = useMemo(() => {
    const map = new Map<string, TeamToolCount[]>()
    for (const t of teams) {
      const key = t.division_name ?? 'Unassigned'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
    }
    for (const list of map.values()) list.sort((a, b) => COLLATOR.compare(a.team_name, b.team_name))
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [teams])

  function toggle(name: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }

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

  if (grouped.length === 0) {
    return (
      <EmptyState
        icon={<Users2 className="h-6 w-6 text-muted-foreground" />}
        title="No teams in view"
        description="No custody teams in the division selected in the top bar. Switch division (or pick “All”), or create a team in Master Data → Custody Locations."
      />
    )
  }

  return (
    <div className="space-y-6">
      {grouped.map(([divisionName, group]) => {
        const open = !collapsed.has(divisionName)
        const divisionId = group[0]?.division_id ?? null
        return (
          <div key={divisionName} className="space-y-2">
            <div className="flex items-center gap-2 min-h-11 sm:min-h-0 sm:py-1">
              <button
                type="button"
                onClick={() => toggle(divisionName)}
                className="flex flex-1 min-w-0 items-center gap-1.5 text-left"
              >
                {open
                  ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                <h3 className="min-w-0 text-sm font-semibold text-muted-foreground uppercase tracking-wide break-words">{divisionName}</h3>
                <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                  {group.length} team{group.length === 1 ? '' : 's'}
                </span>
              </button>
              {onStartCheck && divisionId && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-11 sm:h-8 gap-1.5 shrink-0"
                  onClick={() => onStartCheck(divisionId)}
                >
                  <ClipboardCheck className="h-3.5 w-3.5" /> Monthly check
                </Button>
              )}
            </div>

            {open && (
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {group.map((t) => (
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
            )}
          </div>
        )
      })}
    </div>
  )
}
