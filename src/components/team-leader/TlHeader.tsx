// src/components/team-leader/TlHeader.tsx
'use client'

import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { TlTeamOption } from '@/types/team-leader'

interface Props {
  teamName: string
  isAdmin: boolean
  allTeams: TlTeamOption[]
  effectiveTeamId: string | null
  onTeamChange: (teamId: string) => void
  todayCount: number
  totalCount: number
  viewMode: 'today' | 'all'
  onViewModeChange: (mode: 'today' | 'all') => void
}

export function TlHeader({
  teamName, isAdmin, allTeams, effectiveTeamId,
  onTeamChange, todayCount, totalCount, viewMode, onViewModeChange,
}: Props) {
  const today = format(new Date(), 'EEEE, MMM d, yyyy')
  const countLabel = viewMode === 'today'
    ? `${todayCount} today`
    : `${totalCount} total`

  return (
    <div className="sticky top-0 z-10 bg-card border-b px-4 py-3 space-y-3">
      {/* Row 1: team name + badges */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold leading-tight">{teamName}</h1>
          <p className="text-xs text-muted-foreground">{today}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isAdmin && (
            <Badge variant="secondary" className="text-xs">Admin</Badge>
          )}
          <Badge variant="outline" className="text-xs">{countLabel}</Badge>
        </div>
      </div>

      {/* Row 2: admin team override */}
      {isAdmin && (
        <Select value={effectiveTeamId ?? ''} onValueChange={(v) => { if (v) onTeamChange(v) }}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="Select team…" />
          </SelectTrigger>
          <SelectContent>
            {allTeams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}{t.division_name ? ` — ${t.division_name}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Row 3: view mode tabs */}
      <Tabs value={viewMode} onValueChange={(v) => onViewModeChange(v as 'today' | 'all')}>
        <TabsList className="w-full h-9">
          <TabsTrigger value="today" className="flex-1 text-sm">
            Today ({todayCount})
          </TabsTrigger>
          <TabsTrigger value="all" className="flex-1 text-sm">
            All Upcoming ({totalCount})
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  )
}
