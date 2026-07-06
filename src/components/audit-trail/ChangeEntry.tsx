'use client'

import { computeFieldDiff } from '@/lib/utils/computeFieldDiff'
import { formatDateTime12h } from '@/lib/utils/formatters'
import type { ActivityLog } from '@/hooks/useActivityLog'

interface ChangeEntryProps {
  entry: ActivityLog
  searchTerm?: string
}

const ACTION_COLORS: Record<string, string> = {
  created: 'bg-emerald-500',
  added: 'bg-emerald-500',
  updated: 'bg-blue-500',
  changed: 'bg-blue-500',
  deleted: 'bg-red-500',
  archived: 'bg-orange-500',
  activated: 'bg-orange-500',
  deactivated: 'bg-orange-500',
  approved: 'bg-orange-500',
}

function getActionColor(action: string): string {
  const lower = action.toLowerCase()
  for (const [key, color] of Object.entries(ACTION_COLORS)) {
    if (lower.includes(key)) return color
  }
  return 'bg-blue-500'
}

function HighlightText({ text, term }: { text: string; term?: string }) {
  if (!term || !text) return <>{text}</>
  const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  const parts = text.split(regex)
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part)
          ? <mark key={i} className="bg-yellow-200/60 dark:bg-yellow-500/30 rounded px-0.5">{part}</mark>
          : part
      )}
    </>
  )
}

export function ChangeEntry({ entry, searchTerm }: ChangeEntryProps) {
  const diffs = computeFieldDiff(
    entry.old_data as Record<string, unknown> | null,
    entry.new_data as Record<string, unknown> | null,
  )

  return (
    <div className="flex gap-3 py-2 pl-2">
      <div className="flex flex-col items-center pt-1.5">
        <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${getActionColor(entry.action)}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-medium">
            <HighlightText text={entry.action} term={searchTerm} />
          </span>
          <span className="text-muted-foreground">by</span>
          <span className="font-medium">
            <HighlightText text={entry.performer_name ?? 'System'} term={searchTerm} />
          </span>
          <span className="text-muted-foreground text-xs">
            — {formatDateTime12h(entry.created_at)}
          </span>
        </div>

        {diffs.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {diffs.map((d) => (
              <div key={d.field} className="text-xs text-muted-foreground font-mono">
                <span className="text-foreground/70">{d.label}:</span>{' '}
                {d.from && d.to ? (
                  <>
                    <span className="line-through text-red-500/70">
                      <HighlightText text={d.from} term={searchTerm} />
                    </span>
                    <span className="mx-1">→</span>
                    <span className="text-emerald-600 dark:text-emerald-400">
                      <HighlightText text={d.to} term={searchTerm} />
                    </span>
                  </>
                ) : d.to ? (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    <HighlightText text={d.to} term={searchTerm} />
                  </span>
                ) : d.from ? (
                  <span className="line-through text-red-500/70">
                    <HighlightText text={d.from} term={searchTerm} />
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
