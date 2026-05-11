'use client'

import { LayoutGrid, List, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useTeams, type TeamFull } from '@/hooks/useTeams'
import { useTeamsPage } from './TeamsPageContext'
import { TeamCard } from './TeamCard'
import { TeamRow } from './TeamRow'

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

  return Array.from(companyMap.entries()).map(([companyName, divMap]) => ({
    companyName,
    divisions: Array.from(divMap.entries()).map(([divisionName, teams]) => ({ divisionName, teams })),
  }))
}

export function TeamGrid() {
  const { searchQuery, divisionFilter, density, setSearch, setDensity } = useTeamsPage()
  const { data: teams = [], isLoading } = useTeams({
    search: searchQuery,
    divisionId: divisionFilter ?? undefined,
  })

  const groups         = groupTeams(teams)
  const multiCompany   = groups.length > 1

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search teams..."
            className="pl-8 h-8"
            value={searchQuery}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center border rounded-md overflow-hidden">
          <Button
            variant={density === 'card' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-8 w-8 rounded-none"
            onClick={() => setDensity('card')}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={density === 'list' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-8 w-8 rounded-none"
            onClick={() => setDensity('list')}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading && (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            Loading...
          </div>
        )}
        {!isLoading && teams.length === 0 && (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            No teams found
          </div>
        )}

        {!isLoading && teams.length > 0 && groups.map(cg => (
          <div key={cg.companyName} className="mb-6">
            {multiCompany && (
              <h2 className="text-base font-semibold text-foreground mb-3 pb-1 border-b">
                {cg.companyName}
              </h2>
            )}

            {cg.divisions.map(dg => (
              <div key={dg.divisionName} className="mb-4">
                <h3 className={`text-sm font-medium text-muted-foreground mb-2 ${multiCompany ? 'pl-2' : ''}`}>
                  {dg.divisionName}
                </h3>

                {density === 'card' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {dg.teams.map(t => <TeamCard key={t.id} team={t} />)}
                  </div>
                )}
                {density === 'list' && (
                  <div className="rounded-lg border overflow-hidden">
                    {dg.teams.map(t => <TeamRow key={t.id} team={t} />)}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
