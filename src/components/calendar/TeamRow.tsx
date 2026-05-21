'use client'

import { cn } from '@/lib/utils'
import { VisitBlock } from './VisitBlock'
import type { CalendarVisit } from '@/hooks/useCalendarVisits'
import type { TeamFull } from '@/hooks/useTeams'

export const TRACK_H = 48   // px per stacking track
export const MIN_ROW_H = TRACK_H  // single track = one visit row height

// ---------------------------------------------------------------------------
// Track scheduling helpers (exported for TimelineGrid to compute total height)
// ---------------------------------------------------------------------------

interface Block { id: string; start: number; end: number }

function assignTracks(blocks: Block[]): Map<string, number> {
  const sorted = [...blocks].sort((a, b) => a.start - b.start)
  const trackEnds: number[] = []
  const result = new Map<string, number>()
  for (const b of sorted) {
    let placed = false
    for (let t = 0; t < trackEnds.length; t++) {
      if (trackEnds[t] <= b.start) {
        trackEnds[t] = b.end; result.set(b.id, t); placed = true; break
      }
    }
    if (!placed) { result.set(b.id, trackEnds.length); trackEnds.push(b.end) }
  }
  return result
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m ?? 0)
}

/** Pure computation — call from both TeamRow and TimelineGrid without side effects. */
export function computeTeamRowLayout(visits: CalendarVisit[]): {
  rowHeight: number
  trackMap: Map<string, number>
} {
  const blocks: Block[] = []
  for (const v of visits) {
    if (!v.start_time || !v.end_time) continue
    const startMin = timeToMinutes(v.start_time)
    const endMin   = timeToMinutes(v.end_time)
    if (endMin <= startMin) continue
    blocks.push({ id: v.id, start: startMin, end: endMin })
  }
  const trackMap = assignTracks(blocks)
  const maxTrack  = blocks.length === 0 ? 0 : Math.max(0, ...Array.from(trackMap.values()))
  const trackCount = blocks.length === 0 ? 1 : maxTrack + 1
  return { rowHeight: trackCount * TRACK_H, trackMap }
}

// ---------------------------------------------------------------------------
// TeamRow
// ---------------------------------------------------------------------------

const OFFHOURS_STYLE = {
  backgroundImage: 'repeating-linear-gradient(-45deg, rgb(0 0 0 / 0.04) 0px, rgb(0 0 0 / 0.04) 2px, transparent 2px, transparent 8px)',
} as const

interface TeamRowProps {
  team: TeamFull
  visits: CalendarVisit[]
  hours: number[]
  dayStart: number
  /** First working hour (inclusive). Cells before this are dimmed. */
  workStart: number
  /** Last working hour (exclusive). Cells from this onward are dimmed. */
  workEnd: number
  cellWidth: number
  divisionColor: string
  canEdit: boolean
  canSwap: boolean
  onEdit: (visit: CalendarVisit) => void
  onSwap: (visit: CalendarVisit) => void
  /** If provided, empty working-hour cells become clickable to create a new order. */
  onCellClick?: (teamId: string, hour: number) => void
}

export function TeamRow({
  team,
  visits,
  hours,
  dayStart,
  workStart,
  workEnd,
  cellWidth,
  divisionColor,
  canEdit,
  canSwap,
  onEdit,
  onSwap,
  onCellClick,
}: TeamRowProps) {
  const { rowHeight, trackMap } = computeTeamRowLayout(visits)
  const totalWidth = hours.length * cellWidth

  return (
    <div className="flex border-b" style={{ height: rowHeight }}>
      {/* Sticky team name sidebar */}
      <div
        className="sticky left-0 flex flex-col justify-center gap-0.5 px-3 border-r bg-background z-10 shrink-0"
        style={{ width: 192, minWidth: 128 }}
      >
        <div className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: divisionColor }}
          />
          <span className="text-xs font-medium truncate">{team.name_en ?? team.name}</span>
        </div>
        {team.division && (
          <span className="ml-3.5 text-[10px] text-muted-foreground/70 truncate">
            {team.division.short_name ?? team.division.name}
          </span>
        )}
      </div>

      {/* Visit blocks + clickable hour cells */}
      <div className="relative flex-1" style={{ width: totalWidth, minWidth: totalWidth }}>
        {/* Hour grid cells */}
        <div className="absolute inset-0 flex z-0">
          {hours.map((hour, i) => {
            const isWorking = hour >= workStart && hour < workEnd
            const clickable  = isWorking && !!onCellClick
            return (
              <div
                key={hour}
                className={cn(
                  'h-full border-l shrink-0',
                  i === 0 && 'border-l-0',
                  isWorking ? 'border-border/40' : 'border-border/20',
                  clickable && 'cursor-pointer group/cell hover:bg-orange-50/60 transition-colors',
                )}
                style={{
                  width: cellWidth,
                  minWidth: cellWidth,
                  ...(!isWorking ? OFFHOURS_STYLE : {}),
                }}
                onClick={() => clickable && onCellClick?.(team.id, hour)}
              >
                {clickable && (
                  <div className="flex h-full items-center justify-center opacity-0 group-hover/cell:opacity-60 transition-opacity pointer-events-none select-none">
                    <span className="text-orange-400 text-xl font-light leading-none">+</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Visit blocks — positioned by track */}
        {visits.map(visit => (
          <VisitBlock
            key={visit.id}
            visit={visit}
            cellWidth={cellWidth}
            dayStart={dayStart}
            workEnd={workEnd}
            track={trackMap.get(visit.id) ?? 0}
            trackHeight={TRACK_H}
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
