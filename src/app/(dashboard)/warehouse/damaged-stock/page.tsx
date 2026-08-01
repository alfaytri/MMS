'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/shared/EmptyState'
import { ReturnFromRepairDialog } from '@/components/warehouse/ReturnFromRepairDialog'
import { SendForRepairDialog } from '@/components/warehouse/SendForRepairDialog'
import {
  useDamagedOnHand, useDamagedMovements, useOutForRepair,
  usePendingRepairAssignments,
  type OutForRepairRow, type PendingRepairAssignmentRow,
} from '@/hooks/useDamagedStockOverview'
import { formatDate, formatDateTime } from '@/lib/utils/formatters'

// Reusing the number formatter throughout — currency intentionally omitted
// because damaged-stock costs are stored plain (no currency column).
const nfInt = new Intl.NumberFormat('en-US')
const nfCost = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

// ─── Movement badge styling ─────────────────────────────────────────────
function movementBadgeClass(t: string): string {
  switch (t) {
    case 'restock_as_damaged_in':
    case 'damaged_return_from_repair_as_good':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
    case 'send_for_repair_out':
      return 'bg-orange-500/15 text-orange-700 dark:text-orange-300'
    case 'return_from_repair_as_writeoff':
      return 'bg-red-500/15 text-red-700 dark:text-red-300'
    default:
      return 'bg-slate-500/15 text-slate-700 dark:text-slate-300'
  }
}

function movementLabel(t: string): string {
  return t.replaceAll('_', ' ')
}

// ─── Page ───────────────────────────────────────────────────────────────
export default function DamagedStockPage() {
  const onHand      = useDamagedOnHand()
  const outRepair   = useOutForRepair()
  const movements   = useDamagedMovements()
  const pending     = usePendingRepairAssignments()

  const [returnDialog, setReturnDialog] = useState<OutForRepairRow | null>(null)
  const [assignDialog, setAssignDialog] = useState<PendingRepairAssignmentRow | null>(null)

  return (
    <PageWrapper>
      <PageHeader
        title="Damaged Stock"
        description="Overview of damaged inventory on-hand, units currently out for repair, and the full damaged-stock movement history."
      />

      <Tabs defaultValue="on-hand" className="flex flex-col gap-4 w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="on-hand">On-hand</TabsTrigger>
          <TabsTrigger value="out-for-repair">Out for Repair</TabsTrigger>
          <TabsTrigger value="movements">Movements</TabsTrigger>
        </TabsList>

        {/* ── On-hand tab ────────────────────────────────────────────── */}
        <TabsContent value="on-hand" className="min-h-[400px]">
          <OnHandTab query={onHand} />
        </TabsContent>

        {/* ── Out for repair tab ─────────────────────────────────────── */}
        <TabsContent value="out-for-repair" className="min-h-[400px] space-y-6">
          <PendingRepairAssignmentSection
            query={pending}
            onAssign={(row) => setAssignDialog(row)}
          />
          <OutForRepairTab
            query={outRepair}
            onReturn={(row) => setReturnDialog(row)}
          />
        </TabsContent>

        {/* ── Movements tab ─────────────────────────────────────────── */}
        <TabsContent value="movements" className="min-h-[400px]">
          <MovementsTab query={movements} />
        </TabsContent>
      </Tabs>

      {returnDialog && (
        <ReturnFromRepairDialog
          open={!!returnDialog}
          onOpenChange={(v) => { if (!v) setReturnDialog(null) }}
          transferId={returnDialog.transfer_id}
          transferNumber={returnDialog.transfer_number}
          itemName={returnDialog.item_name}
          sku={returnDialog.sku}
          qty={returnDialog.qty}
          unitCost={returnDialog.unit_cost}
          warehouseName={returnDialog.from_warehouse_name}
          vendorName={returnDialog.repair_vendor_name}
          onComplete={() => setReturnDialog(null)}
        />
      )}

      {assignDialog && (
        <SendForRepairDialog
          open={!!assignDialog}
          onOpenChange={(v) => { if (!v) setAssignDialog(null) }}
          dispositionId={assignDialog.disposition_id}
          warehouseId={assignDialog.warehouse_id}
          warehouseName={assignDialog.warehouse_name}
          itemName={assignDialog.item_name}
          qty={assignDialog.qty}
          returnId={assignDialog.return_id}
          onComplete={() => setAssignDialog(null)}
        />
      )}
    </PageWrapper>
  )
}

// ─── Pending vendor assignment section ─────────────────────────────────
function PendingRepairAssignmentSection({
  query, onAssign,
}: {
  query: ReturnType<typeof usePendingRepairAssignments>
  onAssign: (r: PendingRepairAssignmentRow) => void
}) {
  const { data = [], isLoading, error } = query
  if (error) return <ErrorLine error={error as Error} />
  if (isLoading) return null           // silent — main table below shows skeleton
  if (data.length === 0) return null   // hide the entire section when empty

  const totalQty = data.reduce((s, r) => s + r.qty, 0)

  return (
    <section className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Pending Vendor Assignment
          </h3>
          <p className="text-xs text-amber-800/80 dark:text-amber-300/70 mt-0.5">
            {data.length} disposition{data.length === 1 ? '' : 's'} · {nfInt.format(totalQty)} unit{totalQty === 1 ? '' : 's'} · pick a repair vendor to open the outbound transfer.
          </p>
        </div>
      </div>
      <div className="rounded-md border border-amber-200/70 dark:border-amber-900/50 bg-background overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Return</th>
              <th className="px-3 py-2 text-left font-medium">Item</th>
              <th className="px-3 py-2 text-right font-medium">Qty</th>
              <th className="hidden md:table-cell px-3 py-2 text-left font-medium">Warehouse</th>
              <th className="hidden md:table-cell px-3 py-2 text-left font-medium">Requested</th>
              <th className="px-3 py-2 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.map((r) => (
              <tr key={r.disposition_id}>
                <td className="px-3 py-2 font-mono text-xs">{r.return_number}</td>
                <td className="px-3 py-2">
                  <div className="truncate max-w-xs">{r.item_name}</div>
                  <div className="text-[11px] text-muted-foreground">{r.sku || '—'}</div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{nfInt.format(r.qty)}</td>
                <td className="hidden md:table-cell px-3 py-2 text-muted-foreground">{r.warehouse_name}</td>
                <td className="hidden md:table-cell px-3 py-2 text-xs text-muted-foreground">{formatDate(r.created_at)}</td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" className="h-8 text-xs" onClick={() => onAssign(r)}>
                    Assign Vendor
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ─── On-hand tab ────────────────────────────────────────────────────────
function OnHandTab({ query }: { query: ReturnType<typeof useDamagedOnHand> }) {
  const { data = [], isLoading, error } = query

  const summary = useMemo(() => {
    const items = data.length
    const totalQty = data.reduce((s, r) => s + r.qty, 0)
    const warehouses = new Set(data.map((r) => r.warehouse_id)).size
    return { items, totalQty, warehouses }
  }, [data])

  if (error) return <ErrorLine error={error as Error} />
  if (isLoading) return <TableSkeleton />

  return (
    <>
      <SummaryLine>
        {summary.items} item{summary.items === 1 ? '' : 's'} ·{' '}
        {nfInt.format(summary.totalQty)} total unit{summary.totalQty === 1 ? '' : 's'} across{' '}
        {summary.warehouses} warehouse{summary.warehouses === 1 ? '' : 's'}
      </SummaryLine>

      {data.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6 text-muted-foreground" />}
          title="No damaged stock on-hand"
          description="When damaged units get restocked into a warehouse, they'll show up here."
        />
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Warehouse</th>
                <th className="hidden md:table-cell px-3 py-2 text-left font-medium">Source Sub-container</th>
                <th className="px-3 py-2 text-left font-medium">Item</th>
                <th className="hidden md:table-cell px-3 py-2 text-left font-medium">SKU</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 text-right font-medium">Weighted Unit Cost</th>
                <th className="hidden md:table-cell px-3 py-2 text-left font-medium">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.map((r) => (
                <tr key={r.key}>
                  <td className="px-3 py-2 font-medium">{r.warehouse_name}</td>
                  <td className="hidden md:table-cell px-3 py-2 text-muted-foreground">{r.source_sub_container_name ?? '—'}</td>
                  <td className="px-3 py-2">
                    <div className="truncate max-w-xs">{r.item_name}</div>
                    <div className="md:hidden text-[11px] text-muted-foreground">{r.sku || '—'}</div>
                  </td>
                  <td className="hidden md:table-cell px-3 py-2 text-muted-foreground">{r.sku || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{nfInt.format(r.qty)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{nfCost.format(r.weighted_unit_cost)}</td>
                  <td className="hidden md:table-cell px-3 py-2 text-xs text-muted-foreground">{formatDate(r.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// ─── Out-for-repair tab ────────────────────────────────────────────────
function OutForRepairTab({
  query, onReturn,
}: {
  query: ReturnType<typeof useOutForRepair>
  onReturn: (r: OutForRepairRow) => void
}) {
  const { data = [], isLoading, error } = query

  const summary = useMemo(() => {
    const transfers = new Set(data.map((r) => r.transfer_id)).size
    const totalQty  = data.reduce((s, r) => s + r.qty, 0)
    return { transfers, totalQty }
  }, [data])

  if (error) return <ErrorLine error={error as Error} />
  if (isLoading) return <TableSkeleton />

  return (
    <>
      <SummaryLine>
        {summary.transfers} open transfer{summary.transfers === 1 ? '' : 's'} ·{' '}
        {nfInt.format(summary.totalQty)} total unit{summary.totalQty === 1 ? '' : 's'}
      </SummaryLine>

      {data.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6 text-muted-foreground" />}
          title="Nothing out for repair"
          description="Damaged units sent to a repair vendor will appear here until you record the return."
        />
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Transfer #</th>
                <th className="px-3 py-2 text-left font-medium">Item</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 text-left font-medium">Vendor</th>
                <th className="hidden md:table-cell px-3 py-2 text-left font-medium">Warehouse</th>
                <th className="hidden md:table-cell px-3 py-2 text-left font-medium">Source Sub-container</th>
                <th className="px-3 py-2 text-left font-medium">Expected Return</th>
                <th className="hidden md:table-cell px-3 py-2 text-left font-medium">Dispatched</th>
                <th className="px-3 py-2 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.map((r) => (
                <tr key={`${r.transfer_id}:${r.brand_variant_id}`}>
                  <td className="px-3 py-2 font-mono text-xs">{r.transfer_number}</td>
                  <td className="px-3 py-2">
                    <div className="truncate max-w-xs">{r.item_name}</div>
                    <div className="text-[11px] text-muted-foreground">{r.sku || '—'}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{nfInt.format(r.qty)}</td>
                  <td className="px-3 py-2">{r.repair_vendor_name}</td>
                  <td className="hidden md:table-cell px-3 py-2 text-muted-foreground">{r.from_warehouse_name}</td>
                  <td className="hidden md:table-cell px-3 py-2 text-muted-foreground">{r.from_sub_container_name ?? '—'}</td>
                  <td className="px-3 py-2 text-xs">{formatDate(r.expected_return_date)}</td>
                  <td className="hidden md:table-cell px-3 py-2 text-xs text-muted-foreground">{formatDateTime(r.dispatched_at)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onReturn(r)}>
                      Return from Repair
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// ─── Movements tab ─────────────────────────────────────────────────────
const MOVEMENTS_PAGE_SIZE = 25

function MovementsTab({ query }: { query: ReturnType<typeof useDamagedMovements> }) {
  const { data = [], isLoading, error } = query
  const [page, setPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(data.length / MOVEMENTS_PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * MOVEMENTS_PAGE_SIZE
  const pageRows = data.slice(pageStart, pageStart + MOVEMENTS_PAGE_SIZE)
  const rangeFrom = data.length === 0 ? 0 : pageStart + 1
  const rangeTo = pageStart + pageRows.length

  if (error) return <ErrorLine error={error as Error} />
  if (isLoading) return <TableSkeleton />

  return (
    <>
      <SummaryLine>
        {data.length === 0
          ? 'No movements'
          : <>Showing {nfInt.format(rangeFrom)}–{nfInt.format(rangeTo)} of {nfInt.format(data.length)} movement{data.length === 1 ? '' : 's'} (last 200)</>}
      </SummaryLine>

      {data.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6 text-muted-foreground" />}
          title="No damaged-stock movements recorded yet"
          description="Every damaged-stock event — restock, send-for-repair, return — will appear in this log."
        />
      ) : (
        <>
          <div className="rounded-lg border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="hidden md:table-cell px-3 py-2 text-left font-medium">Date/Time</th>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-left font-medium">Warehouse</th>
                  <th className="hidden md:table-cell px-3 py-2 text-left font-medium">Source Sub-container</th>
                  <th className="px-3 py-2 text-left font-medium">Item</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                  <th className="px-3 py-2 text-right font-medium">Unit Cost</th>
                  <th className="hidden md:table-cell px-3 py-2 text-left font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pageRows.map((r) => (
                  <tr key={r.id}>
                    <td className="hidden md:table-cell px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(r.created_at)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge className={`${movementBadgeClass(r.movement_type)} hover:${movementBadgeClass(r.movement_type)}`} variant="secondary">
                        {movementLabel(r.movement_type)}
                      </Badge>
                      <div className="md:hidden text-[11px] text-muted-foreground mt-1">
                        {formatDateTime(r.created_at)}
                      </div>
                    </td>
                    <td className="px-3 py-2">{r.warehouse_name}</td>
                    <td className="hidden md:table-cell px-3 py-2 text-muted-foreground">{r.source_sub_container_name ?? '—'}</td>
                    <td className="px-3 py-2">
                      <div className="truncate max-w-xs">{r.item_name}</div>
                      <div className="text-[11px] text-muted-foreground">{r.sku || '—'}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{nfInt.format(r.qty)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{nfCost.format(r.unit_cost)}</td>
                    <td className="hidden md:table-cell px-3 py-2 text-xs text-muted-foreground max-w-sm truncate">
                      {r.notes ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground">
              Page {safePage} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8" disabled={safePage <= 1} onClick={() => setPage(1)}>
                First
              </Button>
              <Button variant="outline" size="sm" className="h-8" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Previous
              </Button>
              <Button variant="outline" size="sm" className="h-8" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                Next
              </Button>
              <Button variant="outline" size="sm" className="h-8" disabled={safePage >= totalPages} onClick={() => setPage(totalPages)}>
                Last
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  )
}

// ─── Shared bits ────────────────────────────────────────────────────────
function SummaryLine({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-xs text-muted-foreground">{children}</p>
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}

function ErrorLine({ error }: { error: Error }) {
  return (
    <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
      Failed to load: {error.message}
    </div>
  )
}
