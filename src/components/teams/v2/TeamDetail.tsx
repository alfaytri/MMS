'use client'

import { Phone, Calendar, Wrench, Clock, Pencil } from 'lucide-react'
import { useTeams } from '@/hooks/useTeams'
import { useTeamsPage } from '../TeamsPageContext'
import { LeaderSlot } from '../LeaderSlot'
import { VehicleSlot } from '../VehicleSlot'
import { MembersGrid } from '../MembersGrid'
import { TeamDetailEmpty } from './TeamDetailEmpty'

const BADGE_BASE = 'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border'

export function TeamDetail() {
  const {
    selectedTeamId,
    openTeamDialog,
    openScheduleDialog,
    openLogPanel,
    openToolsSheet,
    teamToolCounts,
  } = useTeamsPage()
  const { data: teams = [] } = useTeams()
  const team = teams.find(t => t.id === selectedTeamId) ?? null

  if (!team) return <TeamDetailEmpty />

  const toolCount = teamToolCounts.get(team.id) ?? 0
  const hasSVO    = team.site_visit_order     ?? false
  const hasSVC    = team.site_visit_quotation ?? false
  const memberCount = team.members.filter(m => m.id !== team.leader_id).length

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[960px] p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold truncate">{team.name_en ?? team.name}</h2>
            {team.name_ar && (
              <p className="text-sm text-muted-foreground truncate" dir="rtl">{team.name_ar}</p>
            )}
            {team.division && (
              <p className="text-xs text-muted-foreground mt-1">
                {team.division.name} · {team.division.company_name}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 shrink-0">
            {!team.is_emergency && !team.is_qc && (
              <span className={`${BADGE_BASE} border-border text-muted-foreground`}>NRM</span>
            )}
            {team.is_emergency && (
              <span className={`${BADGE_BASE} border-red-300 text-red-700`}>EMR</span>
            )}
            {team.is_qc && (
              <span className={`${BADGE_BASE} border-purple-300 text-purple-700`}>QC</span>
            )}
            {hasSVO && (
              <span className={`${BADGE_BASE} border-blue-300 text-blue-700`}>SVO</span>
            )}
            {hasSVC && (
              <span className={`${BADGE_BASE} border-teal-300 text-teal-700`}>SVC</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Vehicle</p>
            <VehicleSlot team={team} />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Leader</p>
            <LeaderSlot team={team} />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <p className="text-xs font-medium text-muted-foreground">Members ({memberCount})</p>
            <p className="text-[10px] text-muted-foreground">Drag here to add</p>
          </div>
          <MembersGrid team={team} />
        </div>

        <div className="flex items-center gap-1 pt-4 border-t border-border/60">
          {team.phone && (
            <button
              type="button"
              className="h-8 px-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground rounded hover:bg-muted/40"
              title={team.phone}
            >
              <Phone className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{team.phone}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => openScheduleDialog(team.id)}
            className="h-8 px-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground rounded hover:bg-muted/40"
          >
            <Calendar className="h-3.5 w-3.5" />
            <span className="truncate max-w-[10rem]">{team.schedule?.name ?? 'Schedule'}</span>
          </button>
          <button
            type="button"
            onClick={() => openToolsSheet(team.id, team.name_en ?? team.name)}
            className="h-8 px-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground rounded hover:bg-muted/40"
          >
            <Wrench className="h-3.5 w-3.5" />
            <span>Tools {toolCount > 0 ? `(${toolCount})` : ''}</span>
          </button>
          <button
            type="button"
            onClick={() => openLogPanel(team.id, 'team')}
            className="h-8 px-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground rounded hover:bg-muted/40"
          >
            <Clock className="h-3.5 w-3.5" />
            <span>Activity</span>
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => openTeamDialog(team)}
            className="h-8 px-3 inline-flex items-center gap-1.5 text-xs hover:bg-muted/40 rounded"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        </div>
      </div>
    </div>
  )
}
