'use client'

import { useState } from 'react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { useTeamActivityLog } from '@/hooks/useTeams'
import { useTeamsPage } from '../TeamsPageContext'

const FILTER_TABS = ['all', 'team', 'employee', 'vehicle', 'schedule'] as const
type FilterTab = (typeof FILTER_TABS)[number]

export function ActivityLogPanel() {
  const { logPanel, closeLogPanel } = useTeamsPage()
  const { open, entityId } = logPanel
  const [filter, setFilter] = useState<FilterTab>('all')

  const { data: logs = [] } = useTeamActivityLog(entityId ?? undefined)

  const visible =
    filter === 'all' ? logs : logs.filter(l => l.entity_type === filter)

  return (
    <Sheet open={open} onOpenChange={o => { if (!o) closeLogPanel() }}>
      <SheetContent side="right" className="w-full sm:w-96 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Activity Log</SheetTitle>
        </SheetHeader>

        <div className="flex gap-1 flex-wrap mt-3 mb-4">
          {FILTER_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              type="button"
              className={`px-2 py-0.5 rounded-full text-xs border capitalize transition-colors ${
                filter === tab
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'hover:bg-muted'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {visible.map(log => (
            <div key={log.id} className="border rounded p-3 space-y-1 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium capitalize">
                  {log.action.replace(/-/g, ' ')}
                </span>
                <Badge variant="secondary" className="text-[10px] capitalize">
                  {log.entity_type ?? '—'}
                </Badge>
              </div>
              {log.actor && (
                <p className="text-xs text-muted-foreground">by {log.actor.full_name}</p>
              )}
              {log.created_at && (
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(parseISO(log.created_at), { addSuffix: true })}
                </p>
              )}
            </div>
          ))}
          {visible.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No activity</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
