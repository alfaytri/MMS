'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, Wrench, XCircle } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/shared/EmptyState'
import { ItemLabel } from '@/components/shared/ItemLabel'
import { ReturnFromRepairDialog } from '@/components/warehouse/ReturnFromRepairDialog'
import { SendForRepairDialog } from '@/components/warehouse/SendForRepairDialog'
import { SendDamagedStockForRepairDialog } from '@/components/warehouse/SendDamagedStockForRepairDialog'
import { WriteOffDamagedStockDialog } from '@/components/warehouse/WriteOffDamagedStockDialog'
import {
  useDamagedOnHand, useOutForRepair,
  usePendingRepairAssignments,
  type DamagedOnHandRow,
  type OutForRepairRow, type PendingRepairAssignmentRow,
} from '@/hooks/useDamagedStockOverview'
import { useHasPermission, useHasEditPermission } from '@/hooks/usePermissions'
import { useDivisionScopedVisibility } from '@/hooks/useWarehouseSubContainers'
import { useActiveDivision } from '@/components/providers/DivisionProvider'
import { useVariantItemMeta } from '@/hooks/useVariantCategoryPaths'
import { formatDate, formatDateTime } from '@/lib/utils/formatters'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'
// formatDateTime is used by the Out-for-Repair table row's dispatched-at
// column. Badge / movementBadgeClass / movementLabel were removed with the
// Damaged Stock → Movements tab in D.13 — that history now lives at
// /master-data/warehouses → Movements as one unified stream.

// Reusing the number formatter throughout — currency intentionally omitted
// because damaged-stock costs are stored plain (no currency column).
const nfInt = new Intl.NumberFormat('en-US')
const nfCost = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

// ─── Page ───────────────────────────────────────────────────────────────
export default function DamagedStockPage() {
  const onHand      = useDamagedOnHand()
  const outRepair   = useOutForRepair()
  const pending     = usePendingRepairAssignments()

  const [returnDialog, setReturnDialog] = useState<OutForRepairRow | null>(null)
  const [assignDialog, setAssignDialog] = useState<PendingRepairAssignmentRow | null>(null)
  const [sendFromOnHand, setSendFromOnHand] = useState<DamagedOnHandRow | null>(null)
  const [writeOffFromOnHand, setWriteOffFromOnHand] = useState<DamagedOnHandRow | null>(null)

  const canSeeOnHand    = useHasPermission('damaged_stock.on_hand.view')
  const canSeeOutRepair = useHasPermission('damaged_stock.out_for_repair.view')
  const canEditOnHand    = useHasEditPermission('damaged_stock.on_hand')
  const canEditOutRepair = useHasEditPermission('damaged_stock.out_for_repair')
  const canSeeCost       = useHasPermission('damaged_stock.cost.view')
  const defaultTab = canSeeOnHand ? 'on-hand' : canSeeOutRepair ? 'out-for-repair' : 'on-hand'

  return (
    <PageWrapper>
      <PageHeader
        title="Damaged Stock"
        description="Damaged inventory on-hand + units currently out for repair. The full movement history (good + damaged) lives on Warehouses → Movements."
        actions={
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/master-data/warehouses?tab=movements&stream=damaged">
              View damaged movements
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        }
      />

      <Tabs defaultValue={defaultTab} className="flex flex-col gap-4 w-full">
        <TabsList className="mb-4">
          {canSeeOnHand && <TabsTrigger value="on-hand">On-hand</TabsTrigger>}
          {canSeeOutRepair && <TabsTrigger value="out-for-repair">Out for Repair</TabsTrigger>}
        </TabsList>

        {/* ── On-hand tab ────────────────────────────────────────────── */}
        {canSeeOnHand && (
          <TabsContent value="on-hand" className="min-h-[400px]">
            <OnHandTab
              query={onHand}
              canEdit={canEditOnHand}
              canSeeCost={canSeeCost}
              onSendForRepair={(row) => setSendFromOnHand(row)}
              onWriteOff={(row) => setWriteOffFromOnHand(row)}
            />
          </TabsContent>
        )}

        {/* ── Out for repair tab ─────────────────────────────────────── */}
        {canSeeOutRepair && (
          <TabsContent value="out-for-repair" className="min-h-[400px] space-y-6">
            <PendingRepairAssignmentSection
              query={pending}
              canEdit={canEditOutRepair}
              onAssign={(row) => setAssignDialog(row)}
            />
            <OutForRepairTab
              query={outRepair}
              canEdit={canEditOutRepair}
              onReturn={(row) => setReturnDialog(row)}
            />
          </TabsContent>
        )}
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

      {sendFromOnHand && (
        <SendDamagedStockForRepairDialog
          open={!!sendFromOnHand}
          onOpenChange={(v) => { if (!v) setSendFromOnHand(null) }}
          warehouseId={sendFromOnHand.warehouse_id}
          warehouseName={sendFromOnHand.warehouse_name}
          brandVariantId={sendFromOnHand.brand_variant_id}
          itemName={sendFromOnHand.item_name}
          sku={sendFromOnHand.sku}
          onHandQty={sendFromOnHand.qty}
          onComplete={() => setSendFromOnHand(null)}
        />
      )}

      {writeOffFromOnHand && (
        <WriteOffDamagedStockDialog
          open={!!writeOffFromOnHand}
          onOpenChange={(v) => { if (!v) setWriteOffFromOnHand(null) }}
          warehouseId={writeOffFromOnHand.warehouse_id}
          warehouseName={writeOffFromOnHand.warehouse_name}
          brandVariantId={writeOffFromOnHand.brand_variant_id}
          itemName={writeOffFromOnHand.item_name}
          sku={writeOffFromOnHand.sku}
          onHandQty={writeOffFromOnHand.qty}
          onComplete={() => setWriteOffFromOnHand(null)}
        />
      )}
    </PageWrapper>
  )
}

// ─── Pending vendor assignment section ─────────────────────────────────
function PendingRepairAssignmentSection({
  query, onAssign, canEdit,
}: {
  query: ReturnType<typeof usePendingRepairAssignments>
  onAssign: (r: PendingRepairAssignmentRow) => void
  canEdit: boolean
}) {
  const { data: rawData = [], isLoading, error } = query
  // Scope to the active-division view by the return's division (null = unscoped → show).
  const { viewDivisionIds } = useActiveDivision()
  const data = useMemo(
    () => viewDivisionIds.size === 0
      ? rawData
      : rawData.filter((r) => r.division_id == null || viewDivisionIds.has(r.division_id)),
    [rawData, viewDivisionIds],
  )
  const variantMeta = useVariantItemMeta(data.map((r) => r.brand_variant_id).filter((v): v is string => !!v))
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
      <div className="hidden md:block rounded-md border border-amber-200/70 dark:border-amber-900/50 bg-background overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Return</th>
              <th className="px-3 py-2 text-left font-medium">Item</th>
              <th className="px-3 py-2 text-right font-medium">Qty</th>
              <th className="hidden md:table-cell px-3 py-2 text-left font-medium">Warehouse</th>
              <th className="hidden md:table-cell px-3 py-2 text-left font-medium">Requested</th>
              {canEdit && <th className="px-3 py-2 text-right font-medium">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.map((r, i) => (
              <tr key={r.disposition_id} className={STAGGER_IN} style={staggerDelay(i)}>
                <td className="px-3 py-2 font-mono text-xs">{r.return_number}</td>
                <td className="px-3 py-2">
                  <ItemLabel meta={r.brand_variant_id ? variantMeta.get(r.brand_variant_id) : undefined} name={r.item_name} nameClassName="truncate max-w-xs block" className="max-w-xs" />
                  <div className="text-[11px] text-muted-foreground">{r.sku || '—'}</div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{nfInt.format(r.qty)}</td>
                <td className="hidden md:table-cell px-3 py-2 text-muted-foreground">{r.warehouse_name}</td>
                <td className="hidden md:table-cell px-3 py-2 text-xs text-muted-foreground">{formatDate(r.created_at)}</td>
                {canEdit && (
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" className="h-11 sm:h-8 text-xs" onClick={() => onAssign(r)}>
                      Assign Vendor
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {data.map((r) => (
          <div key={r.disposition_id} className="bg-card border rounded-md p-3 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <ItemLabel meta={r.brand_variant_id ? variantMeta.get(r.brand_variant_id) : undefined} name={r.item_name} nameClassName="text-sm font-medium block truncate" />
              <span className="text-sm font-semibold tabular-nums shrink-0">
                {nfInt.format(r.qty)} <span className="text-[10px] font-normal text-muted-foreground">units</span>
              </span>
            </div>
            <CardLine label="Return" value={<span className="font-mono">{r.return_number}</span>} />
            <CardLine label="SKU" value={r.sku || '—'} />
            <CardLine label="Warehouse" value={r.warehouse_name} />
            <CardLine label="Requested" value={formatDate(r.created_at)} />
            {canEdit && (
              <Button size="sm" className="w-full min-h-11 text-xs" onClick={() => onAssign(r)}>
                Assign Vendor
              </Button>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── On-hand tab ────────────────────────────────────────────────────────
function OnHandTab({
  query, onSendForRepair, onWriteOff, canEdit, canSeeCost,
}: {
  query:            ReturnType<typeof useDamagedOnHand>
  onSendForRepair:  (row: DamagedOnHandRow) => void
  onWriteOff:       (row: DamagedOnHandRow) => void
  canEdit:          boolean
  canSeeCost:       boolean
}) {
  const { data = [], isLoading, error } = query

  const summary = useMemo(() => {
    const items = data.length
    const totalQty = data.reduce((s, r) => s + r.qty, 0)
    const warehouses = new Set(data.map((r) => r.warehouse_id)).size
    return { items, totalQty, warehouses }
  }, [data])

  const variantMeta = useVariantItemMeta(data.map((r) => r.brand_variant_id).filter((v): v is string => !!v))

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
        <>
        <div className="hidden md:block rounded-lg border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Warehouse</th>
                <th className="hidden md:table-cell px-3 py-2 text-left font-medium">Source Sub-container</th>
                <th className="px-3 py-2 text-left font-medium">Item</th>
                <th className="hidden md:table-cell px-3 py-2 text-left font-medium">SKU</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                {canSeeCost && <th className="px-3 py-2 text-right font-medium">Weighted Unit Cost</th>}
                <th className="hidden md:table-cell px-3 py-2 text-left font-medium">Last Updated</th>
                {canEdit && <th className="px-3 py-2 text-right font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.map((r, i) => (
                <tr key={r.key} className={STAGGER_IN} style={staggerDelay(i)}>
                  <td className="px-3 py-2 font-medium">{r.warehouse_name}</td>
                  <td className="hidden md:table-cell px-3 py-2 text-muted-foreground">{r.source_sub_container_name ?? '—'}</td>
                  <td className="px-3 py-2">
                    <ItemLabel meta={r.brand_variant_id ? variantMeta.get(r.brand_variant_id) : undefined} name={r.item_name} nameClassName="truncate max-w-xs block" className="max-w-xs" />
                    <div className="md:hidden text-[11px] text-muted-foreground">{r.sku || '—'}</div>
                  </td>
                  <td className="hidden md:table-cell px-3 py-2 text-muted-foreground">{r.sku || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{nfInt.format(r.qty)}</td>
                  {canSeeCost && <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{nfCost.format(r.weighted_unit_cost)}</td>}
                  <td className="hidden md:table-cell px-3 py-2 text-xs text-muted-foreground">{formatDate(r.updated_at)}</td>
                  {canEdit && (
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-11 w-11 sm:h-8 sm:w-8 p-0 text-orange-600 hover:bg-orange-50 hover:text-orange-700 dark:hover:bg-orange-950"
                          onClick={() => onSendForRepair(r)}
                          title="Send for repair"
                        >
                          <Wrench className="h-4 w-4" />
                          <span className="sr-only">Send for repair</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-11 w-11 sm:h-8 sm:w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                          onClick={() => onWriteOff(r)}
                          title="Write off"
                        >
                          <XCircle className="h-4 w-4" />
                          <span className="sr-only">Write off</span>
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-2">
          {data.map((r) => (
            <div key={r.key} className="bg-card border rounded-md p-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <ItemLabel meta={r.brand_variant_id ? variantMeta.get(r.brand_variant_id) : undefined} name={r.item_name} nameClassName="text-sm font-medium block truncate" />
                <span className="text-sm font-semibold tabular-nums shrink-0">
                  {nfInt.format(r.qty)} <span className="text-[10px] font-normal text-muted-foreground">units</span>
                </span>
              </div>
              <CardLine label="SKU" value={r.sku || '—'} />
              <CardLine label="Warehouse" value={r.warehouse_name} />
              <CardLine label="Source" value={r.source_sub_container_name ?? '—'} />
              {canSeeCost && <CardLine label="Weighted Cost" value={nfCost.format(r.weighted_unit_cost)} />}
              <CardLine label="Updated" value={formatDate(r.updated_at)} />
              {canEdit && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 min-h-11 gap-1.5 text-xs text-orange-600 hover:bg-orange-50 hover:text-orange-700 dark:hover:bg-orange-950"
                    onClick={() => onSendForRepair(r)}
                  >
                    <Wrench className="h-4 w-4" /> Send for Repair
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 min-h-11 gap-1.5 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                    onClick={() => onWriteOff(r)}
                  >
                    <XCircle className="h-4 w-4" /> Write Off
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
        </>
      )}
    </>
  )
}

// ─── Out-for-repair tab ────────────────────────────────────────────────
function OutForRepairTab({
  query, onReturn, canEdit,
}: {
  query: ReturnType<typeof useOutForRepair>
  onReturn: (r: OutForRepairRow) => void
  canEdit: boolean
}) {
  const { data: rawData = [], isLoading, error } = query
  // Scope repair transfers to the active-division view via their source sub-container.
  const divVisible = useDivisionScopedVisibility()
  const data = useMemo(() => rawData.filter((r) => divVisible(r.from_sub_container_id)), [rawData, divVisible])

  const summary = useMemo(() => {
    const transfers = new Set(data.map((r) => r.transfer_id)).size
    const totalQty  = data.reduce((s, r) => s + r.qty, 0)
    return { transfers, totalQty }
  }, [data])

  const variantMeta = useVariantItemMeta(data.map((r) => r.brand_variant_id).filter((v): v is string => !!v))

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
        <>
        <div className="hidden md:block rounded-lg border bg-card overflow-x-auto">
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
                {canEdit && <th className="px-3 py-2 text-right font-medium">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.map((r, i) => (
                <tr key={`${r.transfer_id}:${r.brand_variant_id}`} className={STAGGER_IN} style={staggerDelay(i)}>
                  <td className="px-3 py-2 font-mono text-xs">{r.transfer_number}</td>
                  <td className="px-3 py-2">
                    <ItemLabel meta={r.brand_variant_id ? variantMeta.get(r.brand_variant_id) : undefined} name={r.item_name} nameClassName="truncate max-w-xs block" className="max-w-xs" />
                    <div className="text-[11px] text-muted-foreground">{r.sku || '—'}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{nfInt.format(r.qty)}</td>
                  <td className="px-3 py-2">{r.repair_vendor_name}</td>
                  <td className="hidden md:table-cell px-3 py-2 text-muted-foreground">{r.from_warehouse_name}</td>
                  <td className="hidden md:table-cell px-3 py-2 text-muted-foreground">{r.from_sub_container_name ?? '—'}</td>
                  <td className="px-3 py-2 text-xs">{formatDate(r.expected_return_date)}</td>
                  <td className="hidden md:table-cell px-3 py-2 text-xs text-muted-foreground">{formatDateTime(r.dispatched_at)}</td>
                  {canEdit && (
                    <td className="px-3 py-2 text-right">
                      <Button variant="outline" size="sm" className="h-11 sm:h-8 text-xs" onClick={() => onReturn(r)}>
                        Return from Repair
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-2">
          {data.map((r) => (
            <div key={`${r.transfer_id}:${r.brand_variant_id}`} className="bg-card border rounded-md p-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <ItemLabel meta={r.brand_variant_id ? variantMeta.get(r.brand_variant_id) : undefined} name={r.item_name} nameClassName="text-sm font-medium block truncate" />
                <span className="text-sm font-semibold tabular-nums shrink-0">
                  {nfInt.format(r.qty)} <span className="text-[10px] font-normal text-muted-foreground">units</span>
                </span>
              </div>
              <CardLine label="Transfer" value={<span className="font-mono">{r.transfer_number}</span>} />
              <CardLine label="SKU" value={r.sku || '—'} />
              <CardLine label="Vendor" value={r.repair_vendor_name} />
              <CardLine label="Warehouse" value={r.from_warehouse_name} />
              <CardLine label="Source" value={r.from_sub_container_name ?? '—'} />
              <CardLine label="Expected Return" value={formatDate(r.expected_return_date)} />
              <CardLine label="Dispatched" value={formatDateTime(r.dispatched_at)} />
              {canEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full min-h-11 text-xs"
                  onClick={() => onReturn(r)}
                >
                  Return from Repair
                </Button>
              )}
            </div>
          ))}
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

// One label:value line inside a mobile card. Label muted, value legible.
// Mobile-only helper — the desktop tables are untouched.
function CardLine({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[11px] text-muted-foreground">
      <span className="shrink-0">{label}</span>
      <span className="min-w-0 truncate text-right text-foreground">{value}</span>
    </div>
  )
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
