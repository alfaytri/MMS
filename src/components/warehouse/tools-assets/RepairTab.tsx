'use client'

import { useMemo, useState } from 'react'
import { CalendarClock, PackageCheck, Trash2, Truck, UserRound, Wrench } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useActiveDivision } from '@/components/providers/DivisionProvider'
import { useRepairBucket } from '@/hooks/useToolInspections'
import { useToolsOutForRepair } from '@/hooks/useToolRepair'
import { useToolUnitItemMeta } from '@/hooks/useToolUnitCategoryPaths'
import { ItemLabel } from '@/components/shared/ItemLabel'
import { ToolLifecycleBadge } from './ToolBadges'
import { ScrapToolDialog } from './ScrapToolDialog'
import { SendToolForRepairDialog } from './SendToolForRepairDialog'
import { ReturnToolFromRepairDialog } from './ReturnToolFromRepairDialog'
import { cn } from '@/lib/utils'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'

const COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
const GRID = 'grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'

function SectionHeader({ icon: Icon, title, count }: { icon: typeof Wrench; title: string; count: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-amber-600" /> {title}
      </h3>
      <span className="text-[11px] text-muted-foreground">({count})</span>
    </div>
  )
}

export function RepairTab() {
  // Top-bar division view filter — empty set = "All divisions".
  const { viewDivisionIds } = useActiveDivision()
  const divisionIds = useMemo(() => Array.from(viewDivisionIds), [viewDivisionIds])
  const { data: bucket = [], isLoading: bucketLoading, error } = useRepairBucket(divisionIds.length ? divisionIds : undefined)
  const { data: outAll = [], isLoading: outLoading } = useToolsOutForRepair()

  const [scrapUnit, setScrapUnit] = useState<{ id: string; label: string } | null>(null)
  const [sendUnit, setSendUnit] = useState<{ id: string; label: string } | null>(null)
  const [returnTransfer, setReturnTransfer] = useState<{ id: string; label: string } | null>(null)

  // Out-for-repair scoped to the top-bar division view (empty set = all).
  const out = useMemo(() => {
    if (!divisionIds.length) return outAll
    const set = new Set(divisionIds)
    return outAll.filter((t) => t.division_id && set.has(t.division_id))
  }, [outAll, divisionIds])

  const bucketSorted = useMemo(() => [...bucket].sort((a, b) => COLLATOR.compare(a.item_name ?? '', b.item_name ?? '')), [bucket])
  const outSorted = useMemo(() => [...out].sort((a, b) => COLLATOR.compare(a.item_name ?? '', b.item_name ?? '')), [out])

  // Category breadcrumb above each tool name, resolved via the unit id.
  const unitMeta = useToolUnitItemMeta([
    ...bucketSorted.map((u) => u.unit_id),
    ...outSorted.map((t) => t.unit_id),
  ])

  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>

  if (bucketLoading || outLoading) {
    return (
      <div className={GRID}>
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 w-full" />)}
      </div>
    )
  }

  if (bucketSorted.length === 0 && outSorted.length === 0) {
    return (
      <EmptyState
        icon={<Wrench className="h-6 w-6 text-muted-foreground" />}
        title="Nothing in repair"
        description="Tools sent for repair from a team collect here — send them to a vendor, or scrap the ones that are beyond repair."
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Awaiting vendor — collected, not yet at a repair shop */}
      {bucketSorted.length > 0 && (
        <section className="space-y-2">
          <SectionHeader icon={Wrench} title="Awaiting vendor" count={bucketSorted.length} />
          <div className={GRID}>
            {bucketSorted.map((u, i) => {
              const label = `${u.item_name ?? 'Tool'}${u.serial_number ? ` (${u.serial_number})` : ''}`
              return (
                <div key={u.unit_id} className={cn('rounded-lg border bg-card shadow-sm p-4 min-h-[9.5rem] min-w-0 flex flex-col gap-1', STAGGER_IN)} style={staggerDelay(i)}>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Wrench className="h-4 w-4 text-amber-600 shrink-0" />
                    <ItemLabel
                      meta={unitMeta.get(u.unit_id)}
                      name={<span className="font-semibold text-sm truncate block" title={u.item_name ?? undefined}>{u.item_name ?? 'Tool'}</span>}
                    />
                  </div>
                  <div className="font-mono text-xs text-muted-foreground truncate">{u.serial_number ?? '—'}</div>
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground min-w-0">
                    <UserRound className="h-3 w-3 shrink-0" />
                    <span className="truncate">{u.current_team_name ?? 'Unassigned'}</span>
                    <span className="ml-auto flex items-center gap-1 shrink-0">
                      <ToolLifecycleBadge type={u.lifecycle_type} />
                      <Badge variant="outline" className="text-[10px] h-4 px-1 font-normal">{u.condition}</Badge>
                    </span>
                  </div>
                  <div className="mt-auto flex items-center gap-1 pt-2">
                    {u.pending_scrap ? (
                      <div
                        className="flex-1 flex items-center justify-center gap-1.5 h-11 sm:h-8 rounded-md border border-amber-200 bg-amber-50 text-amber-700 text-xs font-medium dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-400"
                        title="A scrap write-off for this tool is awaiting warehouse approval — it can't be sent, scrapped again, or moved until then."
                      >
                        <CalendarClock className="h-3.5 w-3.5 shrink-0" /> Pending scrap approval
                      </div>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" className="h-11 sm:h-8 flex-1 min-w-0 justify-center gap-1 text-xs" onClick={() => setSendUnit({ id: u.unit_id, label })}>
                          <Truck className="h-4 w-4 shrink-0" /> Send for repair
                        </Button>
                        <Button size="sm" variant="ghost" className="h-11 sm:h-8 flex-1 min-w-0 justify-center gap-1 text-xs text-destructive hover:text-destructive" onClick={() => setScrapUnit({ id: u.unit_id, label })}>
                          <Trash2 className="h-4 w-4 shrink-0" /> Scrap
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Out for repair — at a vendor, awaiting return */}
      {outSorted.length > 0 && (
        <section className="space-y-2">
          <SectionHeader icon={Truck} title="Out for repair" count={outSorted.length} />
          <div className={GRID}>
            {outSorted.map((t, i) => {
              const label = `${t.item_name ?? 'Tool'}${t.serial_number ? ` (${t.serial_number})` : ''}`
              return (
                <div key={t.transfer_id} className={cn('rounded-lg border bg-card shadow-sm p-4 min-h-[9.5rem] min-w-0 flex flex-col gap-1', STAGGER_IN)} style={staggerDelay(i)}>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Truck className="h-4 w-4 text-sky-600 shrink-0" />
                    <ItemLabel
                      meta={unitMeta.get(t.unit_id)}
                      name={<span className="font-semibold text-sm truncate block" title={t.item_name ?? undefined}>{t.item_name ?? 'Tool'}</span>}
                    />
                  </div>
                  <div className="font-mono text-xs text-muted-foreground truncate">{t.serial_number ?? '—'}</div>
                  <div className="text-[11px] text-muted-foreground truncate">Vendor: {t.vendor_name ?? '—'}</div>
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <CalendarClock className="h-3 w-3 shrink-0" />
                    {t.expected_return_date ? `Expected ${new Date(t.expected_return_date).toLocaleDateString()}` : 'No expected date'}
                  </div>
                  <div className="mt-auto flex items-center pt-2">
                    <Button size="sm" variant="ghost" className="h-11 sm:h-8 w-full justify-center gap-1 text-xs" onClick={() => setReturnTransfer({ id: t.transfer_id, label })}>
                      <PackageCheck className="h-4 w-4 shrink-0" /> Return from repair
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {scrapUnit && <ScrapToolDialog unit={scrapUnit} onClose={() => setScrapUnit(null)} />}
      {sendUnit && <SendToolForRepairDialog unit={sendUnit} onClose={() => setSendUnit(null)} />}
      {returnTransfer && <ReturnToolFromRepairDialog transfer={returnTransfer} onClose={() => setReturnTransfer(null)} />}
    </div>
  )
}
