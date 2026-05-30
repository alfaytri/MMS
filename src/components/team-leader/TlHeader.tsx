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
  showTeamSelector?: boolean
  allTeams: TlTeamOption[]
  effectiveTeamId: string | null
  onTeamChange: (teamId: string) => void
  todayCount: number
  totalCount: number
  viewMode: 'today' | 'all'
  onViewModeChange: (mode: 'today' | 'all') => void
}

export function TlHeader({
  teamName, isAdmin, showTeamSelector, allTeams, effectiveTeamId,
  onTeamChange, todayCount, totalCount, viewMode, onViewModeChange,
}: Props) {
  const today = format(new Date(), 'EEEE, MMM d, yyyy')
  const countLabel = viewMode === 'today'
    ? `${todayCount} today`
    : `${totalCount} total`

  // Derive unique division names from the loaded teams
  const divisionNames = Array.from(new Set(allTeams.map((t) => t.division_name).filter(Boolean)))
  const hasManyDivisions = divisionNames.length > 1

  return (
    <div className="sticky top-0 z-10 bg-card border-b">
    <div className="max-w-2xl px-4 py-3 space-y-3">
      {/* Row 1: title + date + badges — fixed height to prevent layout shift */}
      <div className="flex items-center justify-between gap-2 min-h-[44px]">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold leading-tight truncate">{teamName}</h1>
          <p className="text-xs text-muted-foreground">{today}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isAdmin && (
            <Badge variant="secondary" className="text-xs">Admin</Badge>
          )}
          <Badge variant="outline" className="text-xs">{countLabel}</Badge>
        </div>
      </div>

      {/* Row 2: team selector (admin sees all, managers see their division teams) */}
      {(showTeamSelector ?? isAdmin) && (
        <Select value={effectiveTeamId ?? ''} onValueChange={(v) => { if (v) onTeamChange(v) }}>
          <SelectTrigger className="h-9 text-sm w-full">
            <SelectValue placeholder="Select team…" />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} side="bottom">
            {allTeams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}{hasManyDivisions && t.division_name ? ` — ${t.division_name}` : ''}
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
    </div>
  )
}
