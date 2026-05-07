'use client'

import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getBarColor } from './WeekCapacityStrip'
import { getVisitTypeConfig } from './VisitBlock'
import type { CalendarVisit } from '@/hooks/useCalendarVisits'
import type { TeamFull } from '@/hooks/useTeams'
import type { DayCapacity } from '@/hooks/useWeekCapacity'

interface TeamCardProps {
  team: TeamFull
  visits: CalendarVisit[]
  capacity: DayCapacity
  /** Hex color for the division dot, derived from divisions table in CalendarPage */
  divisionColor: string
  onOpen: () => void
}

export function TeamCard({ team, visits, capacity, divisionColor, onOpen }: TeamCardProps) {
  const barColor = getBarColor(capacity.percentage)
  const preview = visits.slice(0, 2)
  const remaining = visits.length - 2

  return (
    <button
      onClick={onOpen}
      className="w-full text-left rounded-lg border p-3 hover:bg-muted/30 transition-colors space-y-2"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: divisionColor }} />
          <span className="text-sm font-medium truncate">{team.name_en ?? team.name}</span>
        </div>
        <span className={cn('text-xs font-mono shrink-0', capacity.isOff && 'text-muted-foreground')}>
          {capacity.isOff ? 'Off' : `${capacity.percentage}%`}
        </span>
      </div>

      {/* Mini capacity bar */}
      <div className="relative h-1.5 w-full bg-muted rounded-full overflow-hidden">
        {capacity.isOff ? (
          <div className="absolute inset-0 border border-dashed border-muted-foreground/30 rounded-full" />
        ) : (
          <div
            className={cn('absolute left-0 top-0 h-full rounded-full', barColor)}
            style={{ width: `${Math.min(capacity.percentage, 100)}%` }}
          />
        )}
      </div>

      {/* Visit preview rows */}
      {visits.length === 0 ? (
        <p className="text-xs text-muted-foreground">No visits scheduled</p>
      ) : (
        <div className="space-y-1">
          {preview.map(v => {
            const cfg = getVisitTypeConfig(v.visit_type)
            return (
              <div key={v.id} className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground w-10 shrink-0">{v.start_time ?? '--:--'}</span>
                <span className={cn('rounded px-1 py-0.5 text-[10px] text-white shrink-0', cfg.color)}>
                  {cfg.label}
                </span>
                <span className="truncate text-muted-foreground">{v.customer_name ?? '—'}</span>
              </div>
            )
          })}
          {remaining > 0 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-0.5">
              <span>+{remaining} more visits</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </div>
          )}
        </div>
      )}
    </button>
  )
}
