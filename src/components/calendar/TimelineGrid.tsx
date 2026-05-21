'use client'

import { useRef, useEffect, useCallback, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { TeamRow, computeTeamRowLayout } from './TeamRow'
import { NowIndicator } from './NowIndicator'
import type { CalendarVisit } from '@/hooks/useCalendarVisits'
import type { TeamFull } from '@/hooks/useTeams'
import type { CalendarSchedule } from '@/hooks/useCalendarSchedule'

const SCROLL_CELL_WIDTH = 60
const FIT_MIN_CELL_WIDTH = 40
const DIVISION_HEADER_H  = 38

const ALL_HOURS = Array.from({ length: 24 }, (_, i) => i)

function formatHourLabel(h: number): string {
  if (h === 0) return '12AM'
  if (h === 12) return '12PM'
  return h < 12 ? `${h}AM` : `${h - 12}PM`
}

function DivisionHeaderRow({
  name,
  scheduleLabel,
}: {
  name: string
  scheduleLabel?: string
}) {
  return (
    <div style={{ height: DIVISION_HEADER_H }}>
      <div
        className="sticky left-0 z-10 flex items-center gap-3 px-4 bg-orange-50/80 border-y border-orange-100"
        style={{ height: DIVISION_HEADER_H, width: '100vw' }}
      >
        <div className="flex-1 h-px bg-orange-300/50" />
        <div className="flex flex-col items-center shrink-0 gap-0.5">
          <span className="text-[11px] font-bold text-orange-600 tracking-widest uppercase">{name}</span>
          {scheduleLabel && (
            <span className="text-[9px] text-orange-400/80">{scheduleLabel}</span>
          )}
        </div>
        <div className="flex-1 h-px bg-orange-300/50" />
      </div>
    </div>
  )
}

interface TimelineGridProps {
  schedule: CalendarSchedule
  /** Per-division schedules — each team is dimmed according to its own division's schedule.
   *  Divisions absent from the map get workStart=0 / workEnd=24 (no dimming). */
  divisionSchedules: Map<string, CalendarSchedule>
  teams: TeamFull[]
  visitsByTeam: Map<string, CalendarVisit[]>
  fitMode: boolean
  date: string
  canEdit: boolean
  canSwap: boolean
  onEdit: (visit: CalendarVisit) => void
  onSwap: (visit: CalendarVisit) => void
  bodyWidth: number
  divisionColors: Record<string, string>
  /** Called when user clicks an empty hour cell — opens order creation. */
  onCellClick?: (teamId: string, hour: number) => void
}

export function TimelineGrid({
  schedule,
  divisionSchedules,
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
  onCellClick,
}: TimelineGridProps) {
  const headerScrollRef = useRef<HTMLDivElement>(null)
  const bodyScrollRef   = useRef<HTMLDivElement>(null)

  const hours     = ALL_HOURS
  const hourCount = hours.length

  const rawFitWidth = bodyWidth > 0 ? Math.floor(bodyWidth / hourCount) : SCROLL_CELL_WIDTH
  const cellWidth   = fitMode
    ? Math.max(rawFitWidth, FIT_MIN_CELL_WIDTH)
    : SCROLL_CELL_WIDTH

  const forceScroll = fitMode && rawFitWidth < FIT_MIN_CELL_WIDTH

  const onBodyScroll = useCallback(() => {
    if (headerScrollRef.current && bodyScrollRef.current) {
      headerScrollRef.current.scrollLeft = bodyScrollRef.current.scrollLeft
    }
  }, [])

  useEffect(() => {
    if (!bodyScrollRef.current) return
    // scroll_to is an absolute hour (0-23); grid always starts at 0
    const scrollHour = schedule.scroll_to
    bodyScrollRef.current.scrollLeft = scrollHour * cellWidth
    if (headerScrollRef.current) {
      headerScrollRef.current.scrollLeft = scrollHour * cellWidth
    }
  }, [schedule.scroll_to, cellWidth])

  const sidebarWidth = 192
  const scrollable   = !fitMode || forceScroll
  const totalWidth   = hours.length * cellWidth

  // Group teams by division, preserving their original order
  const divisionGroups = useMemo(() => {
    const groups = new Map<string, { slug: string; name: string; color: string; teams: TeamFull[] }>()
    for (const team of teams) {
      const div  = (team.division as any)
      const slug = div?.slug ?? '__none__'
      const name = div?.name ?? div?.short_name ?? 'Unassigned'
      if (!groups.has(slug)) {
        groups.set(slug, { slug, name, color: divisionColors[slug] ?? '#94a3b8', teams: [] })
      }
      groups.get(slug)!.teams.push(team)
    }
    return Array.from(groups.values())
  }, [teams, divisionColors])

  // Total grid height for NowIndicator — team rows + one header per division group
  const totalGridHeight = useMemo(() => {
    const teamHeight = teams.reduce((sum, team) => {
      return sum + computeTeamRowLayout(visitsByTeam.get(team.id) ?? []).rowHeight
    }, 0)
    return teamHeight + divisionGroups.length * DIVISION_HEADER_H
  }, [teams, visitsByTeam, divisionGroups])

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
        <div className="shrink-0 border-r bg-background" style={{ width: sidebarWidth, minWidth: 128 }} />
        <div className="flex">
          {hours.map((hour, i) => (
            <div
              key={hour}
              className={cn(
                'shrink-0 border-l px-1 py-1.5 text-[10px] font-medium text-muted-foreground/70',
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
          <NowIndicator
            dayStart={0}
            dayEnd={24}
            cellWidth={cellWidth}
            totalHeight={totalGridHeight}
            displayDate={date}
          />

          {divisionGroups.map(group => {
            const groupSchedule = divisionSchedules.get(group.slug)
            return (
              <div key={group.slug}>
                <DivisionHeaderRow
                  name={group.name}
                  scheduleLabel={groupSchedule?.label}
                />
                {group.teams.map(team => {
                  const teamSchedule = groupSchedule
                  return (
                    <TeamRow
                      key={team.id}
                      team={team}
                      visits={visitsByTeam.get(team.id) ?? []}
                      hours={hours}
                      dayStart={0}
                      workStart={teamSchedule?.day_start ?? 0}
                      workEnd={teamSchedule?.day_end ?? 24}
                      cellWidth={cellWidth}
                      divisionColor={group.color}
                      canEdit={canEdit}
                      canSwap={canSwap}
                      onEdit={onEdit}
                      onSwap={onSwap}
                      onCellClick={onCellClick}
                    />
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
