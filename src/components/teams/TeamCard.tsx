'use client'

import { Phone, Calendar, Wrench, Clock, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTeamsPage } from './TeamsPageContext'
import { VehicleSlot } from './VehicleSlot'
import { LeaderSlot } from './LeaderSlot'
import { MembersGrid } from './MembersGrid'
import type { TeamFull } from '@/hooks/useTeams'

export function TeamCard({ team }: { team: TeamFull }) {
  const { openTeamDialog, openScheduleDialog, openLogPanel, teamToolCounts } = useTeamsPage()
  const toolCount = teamToolCounts.get(team.id) ?? 0
  const hasSVO = team.members.some(m => m.site_visit_order)
  const hasSVC = team.members.some(m => m.site_visit_quotation)

  return (
    <div className="rounded-lg border bg-card shadow-sm flex flex-col gap-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate text-sm">{team.name_en}</p>
          {team.name_ar && (
            <p className="text-xs text-muted-foreground truncate" dir="rtl">{team.name_ar}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-1 shrink-0">
          {!team.is_emergency && !team.is_qc && (
            <Badge variant="secondary" className="text-[10px] px-1">NRM</Badge>
          )}
          {team.is_emergency && (
            <Badge className="text-[10px] px-1 bg-red-100 text-red-700 hover:bg-red-100">EMR</Badge>
          )}
          {team.is_qc && (
            <Badge className="text-[10px] px-1 bg-purple-100 text-purple-700 hover:bg-purple-100">QC</Badge>
          )}
          {hasSVO && (
            <Badge className="text-[10px] px-1 bg-blue-100 text-blue-700 hover:bg-blue-100">SVO</Badge>
          )}
          {hasSVC && (
            <Badge className="text-[10px] px-1 bg-teal-100 text-teal-700 hover:bg-teal-100">SVC</Badge>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 text-muted-foreground">
        {team.phone && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="p-1 hover:text-foreground" type="button">
                <Phone className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{team.phone}</TooltipContent>
          </Tooltip>
        )}
        <button
          onClick={() => openScheduleDialog(team.id)}
          className="p-1 hover:text-foreground flex items-center gap-1 text-xs"
          type="button"
        >
          <Calendar className="h-3.5 w-3.5" />
          {team.schedule?.name && (
            <span className="hidden sm:inline truncate max-w-[6rem]">{team.schedule.name}</span>
          )}
        </button>
        {toolCount > 0 && (
          <span className="p-1 flex items-center gap-0.5 text-xs">
            <Wrench className="h-3.5 w-3.5" />{toolCount}
          </span>
        )}
        <button
          onClick={() => openLogPanel(team.id, 'team')}
          className="p-1 hover:text-foreground ml-auto"
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

      <VehicleSlot team={team} />
      <LeaderSlot  team={team} />
      <MembersGrid team={team} />
    </div>
  )
}
