'use client'

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { format, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import { getVisitTypeConfig } from './VisitBlock'
import type { CalendarVisit } from '@/hooks/useCalendarVisits'
import type { TeamFull } from '@/hooks/useTeams'

interface TeamDaySheetProps {
  team: TeamFull
  visits: CalendarVisit[]
  date: string
  canEdit: boolean
  canSwap: boolean
  onEdit: (visit: CalendarVisit) => void
  onSwap: (visit: CalendarVisit) => void
  onClose: () => void
}

export function TeamDaySheet({
  team,
  visits,
  date,
  canEdit,
  canSwap,
  onEdit,
  onSwap,
  onClose,
}: TeamDaySheetProps) {
  const dateLabel = format(parseISO(date), 'EEE, MMM d')
  const sorted = [...visits].sort((a, b) =>
    (a.start_time ?? '').localeCompare(b.start_time ?? '')
  )

  return (
    <Sheet open onOpenChange={open => { if (!open) onClose() }}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-xl flex flex-col">
        <SheetHeader className="pb-2 border-b">
          <SheetTitle className="text-base">{team.name_en ?? team.name}</SheetTitle>
          <p className="text-xs text-muted-foreground">{dateLabel}</p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-2 space-y-2">
          {sorted.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No visits scheduled</p>
          )}
          {sorted.map(visit => {
            const cfg = getVisitTypeConfig(visit.visit_type)
            return (
              <div key={visit.id} className="flex items-start gap-3 p-2 rounded-lg border">
                <div className="shrink-0 text-xs text-muted-foreground w-16 pt-0.5">
                  {visit.start_time ?? '--:--'}
                  {visit.end_time && <span className="block">–{visit.end_time}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge
                      className={cn('text-[10px] h-4 font-normal text-white px-1.5', cfg.color)}
                    >
                      {cfg.label}
                    </Badge>
                    <span className="text-sm font-medium truncate">{visit.customer_name ?? '—'}</span>
                  </div>
                  <p className="text-xs text-muted-foreground capitalize mt-0.5">{visit.status}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  {canEdit && (
                    <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => onEdit(visit)}>
                      Edit
                    </Button>
                  )}
                  {canSwap && (
                    <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => onSwap(visit)}>
                      Swap
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </SheetContent>
    </Sheet>
  )
}
