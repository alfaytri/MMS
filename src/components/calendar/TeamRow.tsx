'use client'

import { cn } from '@/lib/utils'
import { VisitBlock } from './VisitBlock'
import type { CalendarVisit } from '@/hooks/useCalendarVisits'
import type { TeamFull } from '@/hooks/useTeams'

export const ROW_HEIGHT = 56 // px — each team row

interface TeamRowProps {
  team: TeamFull
  visits: CalendarVisit[]
  hours: number[]
  dayStart: number
  cellWidth: number
  /** Hex color for the division dot, derived from divisions table in CalendarPage */
  divisionColor: string
  canEdit: boolean
  canSwap: boolean
  onEdit: (visit: CalendarVisit) => void
  onSwap: (visit: CalendarVisit) => void
}

export function TeamRow({
  team,
  visits,
  hours,
  dayStart,
  cellWidth,
  divisionColor,
  canEdit,
  canSwap,
  onEdit,
  onSwap,
}: TeamRowProps) {
  const totalWidth = hours.length * cellWidth

  return (
    <div className="flex border-b" style={{ height: ROW_HEIGHT }}>
      {/* Sticky team name sidebar */}
      <div
        className="sticky left-0 flex items-center gap-2 px-2 border-r bg-background z-10 shrink-0"
        style={{ width: 192, minWidth: 128 }}
      >
        <span
          className="h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: divisionColor }}
        />
        <span className="text-xs font-medium truncate">{team.name_en ?? team.name}</span>
      </div>

      {/* Visit blocks area — positioned relative for absolute children */}
      <div className="relative flex-1" style={{ width: totalWidth, minWidth: totalWidth }}>
        {/* Vertical hour grid lines */}
        <div className="absolute inset-0 flex pointer-events-none">
          {hours.map((_, i) => (
            <div
              key={i}
              className={cn('h-full border-l border-border/40 shrink-0', i === 0 && 'border-l-0')}
              style={{ width: cellWidth, minWidth: cellWidth }}
            />
          ))}
        </div>

        {/* Visit blocks */}
        {visits.map(visit => (
          <VisitBlock
            key={visit.id}
            visit={visit}
            cellWidth={cellWidth}
            dayStart={dayStart}
            canEdit={canEdit}
            canSwap={canSwap}
            onEdit={onEdit}
            onSwap={onSwap}
          />
        ))}
      </div>
    </div>
  )
}
