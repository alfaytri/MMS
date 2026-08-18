'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, Trash2, UserRound, Wrench } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useActiveDivision } from '@/components/providers/DivisionProvider'
import { useRepairBucket, type RepairUnit } from '@/hooks/useToolInspections'
import { useResolveRepair } from '@/hooks/useToolRepair'
import { ScrapToolDialog } from './ScrapToolDialog'

const COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export function RepairTab() {
  // Top-bar division view filter — empty set = "All divisions".
  const { viewDivisionIds } = useActiveDivision()
  const divisionIds = useMemo(() => Array.from(viewDivisionIds), [viewDivisionIds])
  const { data: units = [], isLoading, error } = useRepairBucket(divisionIds.length ? divisionIds : undefined)
  const repaired = useResolveRepair()
  const [scrapUnit, setScrapUnit] = useState<{ id: string; label: string } | null>(null)

  // Group by division (mirrors the Teams tab).
  const grouped = useMemo(() => {
    const map = new Map<string, RepairUnit[]>()
    for (const u of units) {
      const key = u.division_name ?? 'Unassigned'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(u)
    }
    for (const list of map.values()) {
      list.sort((a, b) => COLLATOR.compare(a.item_name ?? '', b.item_name ?? ''))
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [units])

  async function markRepaired(u: RepairUnit) {
    const label = `${u.item_name ?? 'Tool'}${u.serial_number ? ` (${u.serial_number})` : ''}`
    try {
      await repaired.mutateAsync({ unitId: u.unit_id, outcome: 'repaired' })
      toast.success(`Repaired ${label}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark repaired')
    }
  }

  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>

  if (isLoading) {
    return (
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 w-full" />)}
      </div>
    )
  }

  if (grouped.length === 0) {
    return (
      <EmptyState
        icon={<Wrench className="h-6 w-6 text-muted-foreground" />}
        title="Nothing under repair"
        description="Tools marked “Under-repair” on a team’s condition check collect here to be Repaired or Scrapped."
      />
    )
  }

  return (
    <div className="space-y-6">
      {grouped.map(([divisionName, group]) => (
        <div key={divisionName} className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide truncate">{divisionName}</h3>
            <span className="text-[11px] text-muted-foreground">
              {group.length} under repair
            </span>
          </div>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {group.map((u) => {
              const label = `${u.item_name ?? 'Tool'}${u.serial_number ? ` (${u.serial_number})` : ''}`
              return (
                <div key={u.unit_id} className="rounded-lg border bg-card shadow-sm p-4 min-h-[9rem] min-w-0 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Wrench className="h-4 w-4 text-amber-600 shrink-0" />
                    <span className="font-semibold text-sm truncate">{u.item_name ?? 'Tool'}</span>
                  </div>
                  <div className="font-mono text-xs text-muted-foreground truncate">{u.serial_number ?? '—'}</div>
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground min-w-0">
                    <UserRound className="h-3 w-3 shrink-0" />
                    <span className="truncate">{u.current_team_name ?? 'Unassigned'}</span>
                    <Badge variant="outline" className="ml-auto text-[10px] h-4 px-1 font-normal shrink-0">{u.condition}</Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Last checked {u.last_inspected_at ? new Date(u.last_inspected_at).toLocaleDateString() : '—'}
                  </div>
                  <div className="mt-auto flex items-center gap-1 pt-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-11 sm:h-8 flex-1 min-w-0 justify-center gap-1 text-xs"
                      onClick={() => markRepaired(u)}
                      disabled={repaired.isPending}
                    >
                      <CheckCircle2 className="h-4 w-4 shrink-0" /> Repaired
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-11 sm:h-8 flex-1 min-w-0 justify-center gap-1 text-xs text-destructive hover:text-destructive"
                      onClick={() => setScrapUnit({ id: u.unit_id, label })}
                    >
                      <Trash2 className="h-4 w-4 shrink-0" /> Scrap
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {scrapUnit && <ScrapToolDialog unit={scrapUnit} onClose={() => setScrapUnit(null)} />}
    </div>
  )
}
