'use client'

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { format, parseISO } from 'date-fns'
import { Phone, ClipboardList } from 'lucide-react'
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

/** "14:30" → "2:30 PM" */
function fmt12(t: string): string {
  const [hStr, mStr] = t.split(':')
  const h = parseInt(hStr)
  const m = mStr ?? '00'
  const period = h < 12 ? 'AM' : 'PM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${m} ${period}`
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
            const timeLabel = visit.start_time
              ? visit.end_time
                ? `${fmt12(visit.start_time)} – ${fmt12(visit.end_time)}`
                : fmt12(visit.start_time)
              : null
            return (
              <div key={visit.id} className="rounded-lg border p-3 space-y-2">
                {/* Row 1: order number + time + status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {visit.order_number && (
                      <p className="text-[11px] font-mono font-medium text-slate-700 truncate">
                        {visit.order_number}
                      </p>
                    )}
                    {timeLabel && (
                      <p className="text-[11px] text-muted-foreground">{timeLabel}</p>
                    )}
                  </div>
                  <Badge
                    className={cn(
                      'shrink-0 text-[10px] font-semibold uppercase px-2 py-0.5',
                      visit.status === 'scheduled'   && 'bg-orange-100 text-orange-700 border-orange-200',
                      visit.status === 'confirmed'   && 'bg-green-100 text-green-700 border-green-200',
                      visit.status === 'completed'   && 'bg-slate-100 text-slate-600 border-slate-200',
                      visit.status === 'in-progress' && 'bg-blue-100 text-blue-700 border-blue-200',
                      visit.status === 'cancelled'   && 'bg-red-100 text-red-700 border-red-200',
                    )}
                    variant="outline"
                  >
                    {visit.status}
                  </Badge>
                </div>

                {/* Row 2: phone */}
                {visit.customer_phone && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-600">
                    <Phone className="h-3 w-3 shrink-0 text-slate-400" />
                    <span className="font-medium">{visit.customer_phone}</span>
                  </div>
                )}

                {/* Row 3: services */}
                {visit.services_summary && (
                  <div className="flex items-start gap-1.5 text-xs text-slate-600">
                    <ClipboardList className="h-3 w-3 shrink-0 mt-0.5 text-slate-400" />
                    <span className="leading-snug">{visit.services_summary}</span>
                  </div>
                )}

                {/* Row 4: visit type + actions */}
                <div className="flex items-center gap-2 pt-0.5">
                  <Badge className={cn('text-[10px] h-5 font-normal text-white px-1.5', cfg.color)}>
                    {cfg.label}
                  </Badge>
                  <div className="flex gap-1 ml-auto">
                    {canEdit && (
                      <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => onEdit(visit)}>
                        Edit
                      </Button>
                    )}
                    {canSwap && visit.source_type === 'order' && (
                      <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => onSwap(visit)}>
                        Swap
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </SheetContent>
    </Sheet>
  )
}
