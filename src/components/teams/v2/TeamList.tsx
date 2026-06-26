'use client'

import { Plus } from 'lucide-react'
import { useTeams, type TeamFull } from '@/hooks/useTeams'
import { useTeamsPage } from '../TeamsPageContext'
import { TeamListRow } from './TeamListRow'

type DivisionGroup = { divisionName: string; teams: TeamFull[] }
type CompanyGroup  = { companyName: string; divisions: DivisionGroup[] }

function groupTeams(teams: TeamFull[]): CompanyGroup[] {
  const companyMap = new Map<string, Map<string, TeamFull[]>>()
  for (const t of teams) {
    const companyName  = t.division?.company_name ?? 'Unassigned'
    const divisionName = t.division?.name         ?? 'Unassigned'
    if (!companyMap.has(companyName)) companyMap.set(companyName, new Map())
    const divMap = companyMap.get(companyName)!
    if (!divMap.has(divisionName)) divMap.set(divisionName, [])
    divMap.get(divisionName)!.push(t)
  }
  return Array.from(companyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([companyName, divMap]) => ({
      companyName,
      divisions: Array.from(divMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([divisionName, teams]) => ({
          divisionName,
          teams: teams.sort((a, b) => (a.name_en ?? a.name).localeCompare(b.name_en ?? b.name)),
        })),
    }))
}

export function TeamList() {
  const { searchQuery, selectedTeamId, setSelectedTeamId, openTeamDialog } = useTeamsPage()
  const { data: teams = [], isLoading } = useTeams({ search: searchQuery })

  const groups       = groupTeams(teams)
  const multiCompany = groups.length > 1

  return (
    <div className="w-[300px] shrink-0 border-r border-border/60 flex flex-col bg-background">
      <div className="flex-1 overflow-y-auto py-2">
        {isLoading && (
          <p className="text-xs text-muted-foreground px-4 py-6">Loading…</p>
        )}
        {!isLoading && teams.length === 0 && (
          <p className="text-xs text-muted-foreground px-4 py-6">No teams</p>
        )}
        {groups.map(cg => (
          <div key={cg.companyName} className="mb-2">
            {multiCompany && (
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-3 pt-3 pb-1">
                {cg.companyName}
              </p>
            )}
            {cg.divisions.map(dg => (
              <div key={dg.divisionName}>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 px-3 pt-2 pb-1">
                  {dg.divisionName}
                </p>
                {dg.teams.map(t => (
                  <TeamListRow
                    key={t.id}
                    team={t}
                    selected={selectedTeamId === t.id}
                    onSelect={() => setSelectedTeamId(t.id)}
                  />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="border-t border-border/60 p-2">
        <button
          type="button"
          onClick={() => openTeamDialog()}
          className="w-full h-9 flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add team
        </button>
      </div>
    </div>
  )
}
