'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useSearchToolUnits } from '@/hooks/useToolUnitHistory'
import { ToolUnitTimeline } from './ToolUnitTimeline'

export function HistoryUsageTab() {
  const [query, setQuery] = useState('')
  const { data: results = [], isFetching, error } = useSearchToolUnits(query)
  const [openUnit, setOpenUnit] = useState<{ id: string; label: string } | null>(null)

  if (openUnit) {
    return <ToolUnitTimeline unit={openUnit} onBack={() => setOpenUnit(null)} />
  }

  return (
    <div className="space-y-3">
      <div className="relative sm:max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by serial number or item name…"
          className="h-10 pl-9"
        />
      </div>

      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

      {query.trim().length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Type a serial number or item name to find a tool and see its full team history.
        </p>
      ) : (
        <div className="rounded-lg border divide-y min-h-[6rem]">
          {isFetching && <p className="p-3 text-sm text-muted-foreground">Searching…</p>}
          {!isFetching && results.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">No tools match “{query}”.</p>
          )}
          {results.map((r) => (
            <button
              key={r.unit_id}
              type="button"
              onClick={() =>
                setOpenUnit({
                  id: r.unit_id,
                  label: `${r.item_name ?? 'Tool'}${r.serial_number ? ` (${r.serial_number})` : ''}`,
                })
              }
              className="w-full text-left p-3 flex items-center justify-between gap-2 hover:bg-accent"
            >
              <span className="min-w-0 truncate">
                {r.item_name ?? 'Tool'}{' '}
                <span className="font-mono text-xs text-muted-foreground">{r.serial_number}</span>
              </span>
              <span className="text-xs text-muted-foreground shrink-0 truncate max-w-[45%]">
                {r.current_team_name ?? 'Unassigned'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
