'use client'

import { Calendar, Wrench, Clock, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useTeamsPage } from './TeamsPageContext'
import { VehicleSlot } from './VehicleSlot'
import { LeaderSlot } from './LeaderSlot'
import { MembersGrid } from './MembersGrid'
import type { TeamFull } from '@/hooks/useTeams'

export function TeamRow({ team }: { team: TeamFull }) {
  const { openTeamDialog, openScheduleDialog, openLogPanel, teamToolCounts } = useTeamsPage()
  const toolCount = teamToolCounts.get(team.id) ?? 0

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2 border-b hover:bg-muted/30 text-sm">
      <div className="w-36 shrink-0 font-medium truncate">{team.name_en ?? team.name}</div>
      <div className="flex gap-1 shrink-0">
        {team.is_emergency && (
          <Badge className="text-[10px] px-1 bg-red-100 text-red-700 hover:bg-red-100">EMR</Badge>
        )}
        {team.is_qc && (
          <Badge className="text-[10px] px-1 bg-purple-100 text-purple-700 hover:bg-purple-100">QC</Badge>
        )}
      </div>
      <div className="flex-1 min-w-0"><VehicleSlot team={team} /></div>
      <div className="flex-1 min-w-0"><LeaderSlot  team={team} /></div>
      <div className="flex-1 min-w-0"><MembersGrid team={team} /></div>
      <div className="flex items-center gap-1 text-muted-foreground shrink-0">
        <button
          onClick={() => openScheduleDialog(team.id)}
          className="p-1 hover:text-foreground"
          type="button"
        >
          <Calendar className="h-3.5 w-3.5" />
        </button>
        {toolCount > 0 && (
          <span className="flex items-center gap-0.5 text-xs">
            <Wrench className="h-3.5 w-3.5" />{toolCount}
          </span>
        )}
        <button
          onClick={() => openLogPanel(team.id, 'team')}
          className="p-1 hover:text-foreground"
          type="button"
        >
          <Clock className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => openTeamDialog(team)}
          className="p-1 hover:text-foreground"
          type="button"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
