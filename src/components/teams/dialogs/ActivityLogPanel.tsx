'use client'

import { useState } from 'react'
import { formatDistanceToNow, format, parseISO } from 'date-fns'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { useTeamActivityLog } from '@/hooks/useTeams'
import { useTeamsPage } from '../TeamsPageContext'

const FILTER_TABS = ['all', 'team', 'employee', 'vehicle', 'schedule'] as const
type FilterTab = (typeof FILTER_TABS)[number]

// Human-readable action labels
const ACTION_LABELS: Record<string, string> = {
  'team-created':      'Team Created',
  'team-edited':       'Team Updated',
  'team-archived':     'Team Archived',
  'employee-created':  'Employee Added',
  'employee-edited':   'Employee Updated',
  'employee-archived': 'Employee Archived',
  'employee-disabled': 'Employee Disabled',
  'employee-enabled':  'Employee Re-enabled',
  'employee-removed':  'Employee Removed',
  'vehicle-created':   'Vehicle Created',
  'vehicle-edited':    'Vehicle Updated',
  'vehicle-archived':  'Vehicle Archived',
  'vehicle-assigned':  'Vehicle Assigned',
  'vehicle-removed':   'Vehicle Unassigned',
  'tool-assigned':     'Tool Assigned',
  'tool-removed':      'Tool Removed',
}

function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Pull 2-3 meaningful fields from a data object — skips ID columns and UUID values
function dataSummary(data: Record<string, unknown> | null | undefined): string | null {
  if (!data) return null
  const pairs = Object.entries(data)
    .filter(([k, v]) => {
      if (k === 'id' || k.endsWith('_id') || k.endsWith('_at')) return false
      if (v === null || v === undefined || v === '') return false
      if (typeof v === 'string' && UUID_RE.test(v)) return false
      return true
    })
    .slice(0, 3)
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${String(v)}`)
  return pairs.length ? pairs.join(' · ') : null
}

function Timestamp({ iso }: { iso: string }) {
  const [showExact, setShowExact] = useState(false)
  const date = parseISO(iso)
  return (
    <button
      type="button"
      onClick={() => setShowExact(s => !s)}
      className="text-xs text-muted-foreground hover:text-foreground transition-colors text-left"
      title={showExact ? 'Click for relative time' : 'Click for exact time'}
    >
      {showExact
        ? format(date, 'MMM d, yyyy · h:mm a')
        : formatDistanceToNow(date, { addSuffix: true })}
    </button>
  )
}

export function ActivityLogPanel() {
  const { logPanel, closeLogPanel } = useTeamsPage()
  const { open, entityId } = logPanel
  const [filter, setFilter] = useState<FilterTab>('all')

  const { data: logs = [] } = useTeamActivityLog(entityId ?? undefined)

  const visible = filter === 'all' ? logs : logs.filter(l => l.entity_type === filter)

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
          {visible.map(log => {
            const after  = dataSummary(log.after_data)
            const before = dataSummary(log.before_data)
            return (
              <div key={log.id} className="border rounded p-3 space-y-1.5 text-sm">
                {/* Action + entity type */}
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{actionLabel(log.action)}</span>
                  <Badge variant="secondary" className="text-[10px] capitalize shrink-0">
                    {log.entity_type ?? '—'}
                  </Badge>
                </div>

                {/* Who */}
                {log.actor && (
                  <p className="text-xs text-muted-foreground">
                    by <span className="font-medium text-foreground">{log.actor.full_name}</span>
                  </p>
                )}

                {/* Data summary */}
                {after && (
                  <p className="text-xs text-muted-foreground truncate" title={after}>
                    {after}
                  </p>
                )}
                {!after && before && (
                  <p className="text-xs text-muted-foreground truncate" title={before}>
                    was: {before}
                  </p>
                )}

                {/* Timestamp — click to toggle relative ↔ exact */}
                {log.created_at && <Timestamp iso={log.created_at} />}
              </div>
            )
          })}
          {visible.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No activity</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
