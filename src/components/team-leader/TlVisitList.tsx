// src/components/team-leader/TlVisitList.tsx
'use client'

import { format, isToday, isTomorrow, parseISO } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { TlOrderCard } from './TlOrderCard'
import type { TlVisit } from '@/types/team-leader'

interface Props {
  visits: TlVisit[]
  teamId: string
  startedVisits: Set<string>
  completedVisits: Set<string>
  onStart: (visitId: string) => void
  onTapCard: (visit: TlVisit) => void
}

function dateLabel(dateStr: string): string {
  const d = parseISO(dateStr)
  if (isToday(d))    return 'Today'
  if (isTomorrow(d)) return 'Tomorrow'
  return format(d, 'EEEE, MMM d')
}

export function TlVisitList({
  visits, teamId, startedVisits, completedVisits, onStart, onTapCard,
}: Props) {
  if (visits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-3 py-16 text-center px-6">
        <p className="font-medium">No visits scheduled</p>
        <p className="text-sm text-muted-foreground">Check back later or switch to All Upcoming.</p>
      </div>
    )
  }

  // Group by date
  const groups = new Map<string, TlVisit[]>()
  for (const v of visits) {
    const existing = groups.get(v.date) ?? []
    existing.push(v)
    groups.set(v.date, existing)
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl">
        {Array.from(groups.entries()).map(([date, group]) => (
          <div key={date}>
            {/* Sticky date header */}
            <div className="sticky top-0 z-[5] flex items-center gap-2 bg-muted/80 backdrop-blur-sm px-4 py-2 border-b">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {dateLabel(date)}
              </span>
              <Badge variant="secondary" className="text-xs h-5">{group.length}</Badge>
            </div>

            {/* Visit cards */}
            <div className="space-y-3 p-4">
              {group.map((visit) => (
                <TlOrderCard
                  key={visit.id}
                  visit={visit}
                  teamId={teamId}
                  isStarted={startedVisits.has(visit.id)}
                  isCompleted={completedVisits.has(visit.id)}
                  onStart={onStart}
                  onTapCard={onTapCard}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
