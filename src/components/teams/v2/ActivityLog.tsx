'use client'

import { useMemo, useState } from 'react'
import { format, formatDistanceToNow, isToday, isYesterday, parseISO, startOfDay } from 'date-fns'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useTeamActivityLog } from '@/hooks/useTeams'
import { useTeamsPage } from '../TeamsPageContext'
import { formatActivity } from './activitySentences'

const FILTERS = ['all', 'team', 'employee', 'vehicle', 'schedule'] as const
type Filter = (typeof FILTERS)[number]

function dayLabel(d: Date): string {
  if (isToday(d))     return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'MMM d, EEE')
}

export function ActivityLog() {
  const { logPanel, closeLogPanel } = useTeamsPage()
  const { open, entityId } = logPanel
  const [filter, setFilter] = useState<Filter>('all')
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())

  const { data: logs = [] } = useTeamActivityLog(entityId ?? undefined)

  const visible = filter === 'all' ? logs : logs.filter(l => l.entity_type === filter)

  const days = useMemo(() => {
    const map = new Map<string, typeof visible>()
    for (const log of visible) {
      if (!log.created_at) continue
      const key = startOfDay(parseISO(log.created_at)).toISOString()
      const arr = map.get(key) ?? []
      arr.push(log)
      map.set(key, arr)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([iso, items]) => ({ iso, date: new Date(iso), items }))
  }, [visible])

  function toggleDay(iso: string) {
    setExpandedDays(prev => {
      const next = new Set(prev)
      if (next.has(iso)) next.delete(iso)
      else next.add(iso)
      return next
    })
  }

  return (
    <Sheet open={open} onOpenChange={o => { if (!o) closeLogPanel() }}>
      <SheetContent side="right" className="w-full sm:w-[420px] p-0 flex flex-col gap-0">
        <SheetHeader className="px-4 h-12 flex flex-row items-center justify-between border-b border-border/60">
          <SheetTitle className="text-sm font-semibold">Activity</SheetTitle>
        </SheetHeader>

        <div className="flex items-center gap-4 px-4 h-10 border-b border-border/60 text-sm">
          {FILTERS.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setFilter(t)}
              className={cn(
                'capitalize transition-colors',
                filter === t
                  ? 'text-foreground font-medium underline underline-offset-4'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {days.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No activity in this view</p>
          )}
          {days.map(day => {
            const expanded = expandedDays.has(day.iso)
            return (
              <div key={day.iso}>
                <button
                  type="button"
                  onClick={() => toggleDay(day.iso)}
                  className="w-full h-12 px-4 flex items-center justify-between hover:bg-muted/40 border-b border-border/60 transition-colors"
                >
                  <span className="text-sm font-medium">{dayLabel(day.date)}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {day.items.length}
                    {expanded
                      ? <ChevronDown className="h-3.5 w-3.5" />
                      : <ChevronRight className="h-3.5 w-3.5" />}
                  </span>
                </button>
                {expanded && (
                  <div className="relative px-4 py-3 border-b border-border/60">
                    <div className="absolute left-[22px] top-0 bottom-0 w-px bg-border/60" aria-hidden />
                    <div className="space-y-3">
                      {day.items.map(log => <Event key={log.id} log={log} />)}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Event({ log }: { log: Parameters<typeof formatActivity>[0] }) {
  const [showExact, setShowExact] = useState(false)
  if (!log.created_at) return null
  const d = parseISO(log.created_at)
  return (
    <div className="relative pl-8 flex items-start justify-between gap-3">
      <span className="absolute left-1 top-1.5 h-2 w-2 rounded-full bg-muted-foreground/50" aria-hidden />
      <p className="text-sm leading-5 flex-1">{formatActivity(log)}</p>
      <button
        type="button"
        onClick={() => setShowExact(s => !s)}
        className="text-[11px] text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5"
        title={showExact ? 'Click for relative time' : 'Click for exact time'}
      >
        {showExact ? format(d, 'HH:mm') : formatDistanceToNow(d, { addSuffix: true })}
      </button>
    </div>
  )
}
