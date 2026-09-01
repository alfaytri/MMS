'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useActiveDivision } from '@/components/providers/DivisionProvider'
import { useTeamsWithToolCounts } from '@/hooks/useToolAssignments'
import { useSearchToolUnits, useAssignedToolUnits, type ToolUnitSearchRow } from '@/hooks/useToolUnitHistory'
import { useToolUnitCategoryPaths } from '@/hooks/useToolUnitCategoryPaths'
import { ToolUnitTimeline } from './ToolUnitTimeline'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'

const COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function ToolRow({ row, onOpen, categoryPath }: { row: ToolUnitSearchRow; onOpen: (r: ToolUnitSearchRow) => void; categoryPath?: string }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(row)}
      className="w-full text-left p-3 flex items-center justify-between gap-2 hover:bg-accent"
    >
      <span className="min-w-0">
        {categoryPath ? <span className="block text-[10px] text-muted-foreground leading-tight break-words">{categoryPath}</span> : null}
        <span className="block truncate">
          {row.item_name ?? 'Tool'}{' '}
          <span className="font-mono text-xs text-muted-foreground">{row.serial_number}</span>
        </span>
      </span>
      <span className="text-xs text-muted-foreground shrink-0 truncate max-w-[45%]">
        {row.current_team_name ?? 'Unassigned'}
      </span>
    </button>
  )
}

export function HistoryUsageTab() {
  // Top-bar division view filter — empty set = "All divisions".
  const { viewDivisionIds } = useActiveDivision()
  const divisionIds = useMemo(() => Array.from(viewDivisionIds), [viewDivisionIds])

  const [query, setQuery] = useState('')
  const [openUnit, setOpenUnit] = useState<{ id: string; label: string } | null>(null)

  const trimmed = query.trim()
  const searching = trimmed.length > 0

  // Default view = currently-assigned tools (division-scoped). Typing switches to
  // the global serial/name search.
  const search = useSearchToolUnits(query)
  const assigned = useAssignedToolUnits(divisionIds)
  const { data: teams = [] } = useTeamsWithToolCounts(divisionIds.length ? divisionIds : undefined)

  // team_id → division name, used to group the assigned list by division.
  const teamDivision = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of teams) m.set(t.team_id, t.division_name ?? 'Unassigned')
    return m
  }, [teams])

  const assignedByDivision = useMemo(() => {
    const m = new Map<string, ToolUnitSearchRow[]>()
    for (const r of assigned.data ?? []) {
      const division = (r.current_team_id ? teamDivision.get(r.current_team_id) : null) ?? 'Unassigned'
      if (!m.has(division)) m.set(division, [])
      m.get(division)!.push(r)
    }
    for (const list of m.values()) {
      list.sort((a, b) =>
        COLLATOR.compare(a.item_name ?? '', b.item_name ?? '') ||
        COLLATOR.compare(a.serial_number ?? '', b.serial_number ?? ''))
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [assigned.data, teamDivision])

  const searchRows = search.data ?? []
  const assignedCount = (assigned.data ?? []).length
  const error = searching ? search.error : assigned.error

  // Category breadcrumb above each tool name, resolved via the unit id.
  const unitTrees = useToolUnitCategoryPaths([
    ...searchRows.map((r) => r.unit_id),
    ...(assigned.data ?? []).map((r) => r.unit_id),
  ])

  if (openUnit) {
    return <ToolUnitTimeline unit={openUnit} onBack={() => setOpenUnit(null)} />
  }

  const openRow = (r: ToolUnitSearchRow) =>
    setOpenUnit({ id: r.unit_id, label: `${r.item_name ?? 'Tool'}${r.serial_number ? ` (${r.serial_number})` : ''}` })

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

      {searching ? (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground break-words">
            Results for “{trimmed}”
          </h3>
          <div className="rounded-lg border divide-y min-h-[6rem]">
            {search.isFetching && <p className="p-3 text-sm text-muted-foreground">Searching…</p>}
            {!search.isFetching && searchRows.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">No tools match “{trimmed}”.</p>
            )}
            {searchRows.map((r, i) => (
              <div key={r.unit_id} className={STAGGER_IN} style={staggerDelay(i)}>
                <ToolRow row={r} onOpen={openRow} categoryPath={unitTrees.get(r.unit_id)} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground break-words">
              Currently assigned
            </h3>
            {assignedCount > 0 && (
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {assignedCount}{assignedCount === 200 ? '+' : ''} tool{assignedCount === 1 ? '' : 's'}
              </span>
            )}
          </div>

          {assigned.isFetching && (
            <div className="rounded-lg border p-3 text-sm text-muted-foreground">Loading assigned tools…</div>
          )}
          {!assigned.isFetching && assignedCount === 0 && (
            <div className="rounded-lg border p-3 text-sm text-muted-foreground">
              No tools are currently assigned in the selected division(s).
            </div>
          )}

          {assignedByDivision.map(([division, rows]) => (
            <div key={division} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <h4 className="min-w-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground break-words">
                  {division}
                </h4>
                <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                  {rows.length} tool{rows.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="rounded-lg border divide-y">
                {rows.map((r, i) => (
                  <div key={r.unit_id} className={STAGGER_IN} style={staggerDelay(i)}>
                    <ToolRow row={r} onOpen={openRow} categoryPath={unitTrees.get(r.unit_id)} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
