'use client'

import { LayoutGrid, List, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useTeams } from '@/hooks/useTeams'
import { useTeamsPage } from './TeamsPageContext'
import { TeamCard } from './TeamCard'
import { TeamRow } from './TeamRow'

export function TeamGrid() {
  const { searchQuery, divisionFilter, density, setSearch, setDensity } = useTeamsPage()
  const { data: teams = [], isLoading } = useTeams({
    search: searchQuery,
    divisionId: divisionFilter ?? undefined,
  })

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
        {!isLoading && density === 'card' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {teams.map(t => <TeamCard key={t.id} team={t} />)}
          </div>
        )}
        {!isLoading && density === 'list' && (
          <div className="rounded-lg border overflow-hidden">
            {teams.map(t => <TeamRow key={t.id} team={t} />)}
          </div>
        )}
      </div>
    </div>
  )
}
