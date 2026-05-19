'use client'

import { useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { TeamRow, ROW_HEIGHT } from './TeamRow'
import { NowIndicator } from './NowIndicator'
import type { CalendarVisit } from '@/hooks/useCalendarVisits'
import type { TeamFull } from '@/hooks/useTeams'
import type { CalendarSchedule } from '@/hooks/useCalendarSchedule'

const SCROLL_CELL_WIDTH = 60   // px per hour in Scroll mode
const FIT_MIN_CELL_WIDTH = 40  // minimum px per hour in Fit mode

function buildHoursArray(dayStart: number, dayEnd: number): number[] {
  const hours: number[] = []
  for (let h = dayStart; h < dayEnd; h++) hours.push(h)
  return hours
}

function formatHourLabel(h: number): string {
  if (h === 0 || h === 24) return '12a'
  if (h === 12) return '12p'
  return h < 12 ? `${h}a` : `${h - 12}p`
}

interface TimelineGridProps {
  schedule: CalendarSchedule
  teams: TeamFull[]
  visitsByTeam: Map<string, CalendarVisit[]>
  fitMode: boolean
  date: string
  canEdit: boolean
  canSwap: boolean
  onEdit: (visit: CalendarVisit) => void
  onSwap: (visit: CalendarVisit) => void
  /** Available viewport width for the grid body (px) */
  bodyWidth: number
  /** Division slug → hex color, derived from useDivisions() in CalendarPage */
  divisionColors: Record<string, string>
}

export function TimelineGrid({
  schedule,
  teams,
  visitsByTeam,
  fitMode,
  date,
  canEdit,
  canSwap,
  onEdit,
  onSwap,
  bodyWidth,
  divisionColors,
}: TimelineGridProps) {
  const headerScrollRef = useRef<HTMLDivElement>(null)
  const bodyScrollRef = useRef<HTMLDivElement>(null)

  const hours = buildHoursArray(schedule.day_start, schedule.day_end)
  const hourCount = hours.length

  // Cell width: fit mode divides available body width, but never below 40px
  const rawFitWidth = bodyWidth > 0 ? Math.floor(bodyWidth / hourCount) : SCROLL_CELL_WIDTH
  const cellWidth = fitMode
    ? Math.max(rawFitWidth, FIT_MIN_CELL_WIDTH)
    : SCROLL_CELL_WIDTH

  // Force scroll in fit mode if cells are at minimum (viewport too narrow)
  const forceScroll = fitMode && rawFitWidth < FIT_MIN_CELL_WIDTH

  // Sync horizontal scroll between header and body
  const onBodyScroll = useCallback(() => {
    if (headerScrollRef.current && bodyScrollRef.current) {
      headerScrollRef.current.scrollLeft = bodyScrollRef.current.scrollLeft
    }
  }, [])

  // Auto-scroll to schedule.scroll_to hour on mount
  useEffect(() => {
    if (!bodyScrollRef.current) return
    const scrollHour = schedule.scroll_to - schedule.day_start
    bodyScrollRef.current.scrollLeft = scrollHour * cellWidth
    if (headerScrollRef.current) {
      headerScrollRef.current.scrollLeft = scrollHour * cellWidth
    }
  }, [schedule.scroll_to, schedule.day_start, cellWidth])

  const sidebarWidth = 192 // w-48 in px
  const scrollable = !fitMode || forceScroll

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Hour ruler */}
      <div
        ref={headerScrollRef}
        className={cn(
          'flex border-b bg-background z-10 sticky top-0',
          !scrollable ? 'overflow-hidden' : 'overflow-x-hidden pointer-events-none',
        )}
      >
        {/* Spacer for sidebar */}
        <div className="shrink-0 border-r bg-background" style={{ width: sidebarWidth, minWidth: 128 }} />
        {/* Hour labels */}
        <div className="flex">
          {hours.map((hour, i) => (
            <div
              key={hour}
              className={cn(
                'shrink-0 border-l px-1 py-1 text-[10px] text-muted-foreground',
                i === 0 && 'border-l-0',
              )}
              style={{ width: cellWidth, minWidth: cellWidth }}
            >
              {formatHourLabel(hour)}
            </div>
          ))}
        </div>
      </div>

      {/* Grid body */}
      <div
        ref={bodyScrollRef}
        onScroll={onBodyScroll}
        className={cn(
          'flex-1 overflow-y-auto',
          scrollable ? 'overflow-x-auto' : 'overflow-x-hidden',
        )}
      >
        <div className="relative">
          {/* Now indicator */}
          <NowIndicator
            dayStart={schedule.day_start}
            dayEnd={schedule.day_end}
            cellWidth={cellWidth}
            rowHeight={ROW_HEIGHT}
            rowCount={teams.length}
            displayDate={date}
          />

          {teams.map(team => (
            <TeamRow
              key={team.id}
              team={team}
              visits={visitsByTeam.get(team.id) ?? []}
              hours={hours}
              dayStart={schedule.day_start}
              cellWidth={cellWidth}
              divisionColor={divisionColors[(team.division as unknown as string)] ?? '#94a3b8'}
              canEdit={canEdit}
              canSwap={canSwap}
              onEdit={onEdit}
              onSwap={onSwap}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
