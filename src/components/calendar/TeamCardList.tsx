'use client'

import { useState } from 'react'
import { TeamCard } from './TeamCard'
import { TeamDaySheet } from './TeamDaySheet'
import type { CalendarVisit } from '@/hooks/useCalendarVisits'
import type { TeamFull } from '@/hooks/useTeams'
import type { DayCapacity } from '@/hooks/useWeekCapacity'

interface TeamCardListProps {
  teams: TeamFull[]
  visitsByTeam: Map<string, CalendarVisit[]>
  capacityByTeam: Map<string, DayCapacity>
  date: string
  canEdit: boolean
  canSwap: boolean
  onEdit: (visit: CalendarVisit) => void
  onSwap: (visit: CalendarVisit) => void
  /** Division slug → hex color, derived from divisions table in CalendarPage */
  divisionColors: Record<string, string>
}

export function TeamCardList({
  teams,
  visitsByTeam,
  capacityByTeam,
  date,
  canEdit,
  canSwap,
  onEdit,
  onSwap,
  divisionColors,
}: TeamCardListProps) {
  const [sheetTeam, setSheetTeam] = useState<TeamFull | null>(null)

  const defaultCapacity: DayCapacity = {
    scheduledMinutes: 0, totalMinutes: 0, percentage: 0,
    overflowMinutes: 0, visitCount: 0, isOff: true,
  }

  return (
    <>
      <div className="flex flex-col gap-2 p-3">
        {teams.map(team => (
          <TeamCard
            key={team.id}
            team={team}
            visits={visitsByTeam.get(team.id) ?? []}
            capacity={capacityByTeam.get(team.id) ?? defaultCapacity}
            divisionColor={divisionColors[(team.division as unknown as string)] ?? '#94a3b8'}
            onOpen={() => setSheetTeam(team)}
          />
        ))}
      </div>

      {sheetTeam && (
        <TeamDaySheet
          team={sheetTeam}
          visits={visitsByTeam.get(sheetTeam.id) ?? []}
          date={date}
          canEdit={canEdit}
          canSwap={canSwap}
          onEdit={onEdit}
          onSwap={onSwap}
          onClose={() => setSheetTeam(null)}
        />
      )}
    </>
  )
}
