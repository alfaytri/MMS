'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { Search, ChevronLeft, ChevronRight as ChevronRightIcon, Gift } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/shared/EmptyState'
import { ItemTreeCell } from './ItemTreeCell'
import { WhMovementRefDialog } from './WhMovementRefDialog'
import { WhStockDetailDialog } from './WhStockDetailDialog'
import { WarehouseReportButton } from './WarehouseReportButton'
import { useStockMovements, useWarehouseStock, StockMovement } from '@/hooks/useWarehouseOperations'
import { useWarehouseSubContainers, shortenSubContainerName, useDivisionScopedVisibility } from '@/hooks/useWarehouseSubContainers'
import { Warehouse } from '@/hooks/useWarehouses'
import { format } from 'date-fns'

const fmtVal = (n: number) => n.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const MOVEMENT_STYLES: Record<string, string> = {
  adjustment:                  'bg-primary/10 text-primary',
  cost_adjustment:             'bg-primary/10 text-primary',
  free_receival:               'bg-success/10 text-success',
  purchase_receival:           'bg-success/10 text-success',
  purchase_return:             'bg-warning/10 text-warning',
  purchase_return_cancelled:   'bg-muted text-muted-foreground',
  receival_edit:               'bg-primary/10 text-primary',
  sale_delivery:               'bg-destructive/10 text-destructive',
  sale_return:                 'bg-primary/10 text-primary',
  sale_return_damaged:         'bg-destructive/10 text-destructive',
  transfer_in:                 'bg-accent/10 text-accent-foreground',
  transfer_out:                'bg-secondary text-secondary-foreground',
  transfer_shrinkage:          'bg-destructive/10 text-destructive',
  // D.13 — damaged-side types
  damaged_return_from_repair_as_good: 'bg-success/10 text-success',
  restock_as_damaged_in:              'bg-destructive/10 text-destructive',
  send_for_repair_out:                'bg-warning/10 text-warning',
  return_from_repair_as_writeoff:     'bg-destructive/10 text-destructive',
  damaged_write_off:                  'bg-destructive/10 text-destructive',
  damaged_adjust:                     'bg-primary/10 text-primary',
}

const MOVEMENT_LABELS: Record<string, string> = {
  adjustment:                'Adjustment',
  cost_adjustment:           'Cost Adjustment',
  free_receival:             'Free Receival',
  purchase_receival:         'Purchase Receival',
  purchase_return:           'Purchase Return',
  purchase_return_cancelled: 'Purchase Return (Cancelled)',
  receival_edit:             'Receival Edit',
  sale_delivery:             'Sale Delivery',
  sale_return:               'Sale Return',
  sale_return_damaged:       'Sale Return — Damaged / Write-off',
  transfer_in:               'Transfer In',
  transfer_out:              'Transfer Out',
  transfer_shrinkage:        'Transfer Shrinkage',
  // D.13 — damaged-side types
  damaged_return_from_repair_as_good: 'Return from Repair (Good)',
  restock_as_damaged_in:              'Restock as Damaged',
  send_for_repair_out:                'Send for Repair',
  return_from_repair_as_writeoff:     'Return from Repair (Write-off)',
  damaged_write_off:                  'Damaged Write-off',
  damaged_adjust:                     'Damaged Adjustment',
}

// Filter dropdown, grouped by stream (good-stock types first, then
// damaged-side types) so the operator can eyeball what belongs where.
const GOOD_MOVEMENT_TYPES = [
  'adjustment',
  'free_receival',
  'purchase_receival',
  'purchase_return',
  'sale_delivery',
  'sale_return',
  'sale_return_damaged',
  'transfer_in',
  'transfer_out',
  'damaged_return_from_repair_as_good',
]
const DAMAGED_MOVEMENT_TYPES = [
  'restock_as_damaged_in',
  'send_for_repair_out',
  'return_from_repair_as_writeoff',
  'damaged_write_off',
  'damaged_adjust',
]

// ─── Reference type → human label + optional route ──────────────────────────

const REF_CONFIG: Record<string, { label: string }> = {
  sale_delivery:    { label: 'Sale Delivery' },
  receival:         { label: 'PO Receival' },
  po_return:        { label: 'Purchase Return' },
  return:           { label: 'Sale Return' },
  sale_return:      { label: 'Sale Return' },
  transfer:         { label: 'Stock Transfer' },
  adjustment:       { label: 'Adjustment' },
  landed_cost:      { label: 'Landed Cost' },
  inventory_check:  { label: 'Inv. Check' },
  cost_adjustment:  { label: 'Cost Adjustment' },
  free_receival:    { label: 'Free Receival' },
  consumption:      { label: 'Consumption' },
}

// ─── Component ──────────────────────────────────────────────────────────────

interface Props {
  warehouses: Warehouse[]
}

export const WhMovementsTab = React.memo(function WhMovementsTab({ warehouses }: Props) {
  const [search, setSearch] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState('all')
  const [subContainerFilter, setSubContainerFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  // D.13 — stream filter: 'all' | 'good' | 'damaged'. The Warehouses →
  // Movements tab is the single unified movement view now (Damaged Stock
  // page's Movements tab was dropped).
  const [streamFilter, setStreamFilter] = useState<'all' | 'good' | 'damaged'>('all')

  // Sub-containers for the picked warehouse (for the optional filter dropdown)
  const subWhId = warehouseFilter !== 'all' ? warehouseFilter : null
  const { data: subs = [] } = useWarehouseSubContainers(subWhId)
  const activeSubs = useMemo(() => subs.filter((sc) => sc.is_active), [subs])
  const subWhName = useMemo(() => warehouses.find((w) => w.id === subWhId)?.name ?? '', [warehouses, subWhId])

  useEffect(() => {
    // Reset sub-container filter whenever the warehouse changes; a stale sub
    // id from a previously picked warehouse would otherwise hide every row.
    setSubContainerFilter('all')
  }, [warehouseFilter])
  const [refDialog, setRefDialog] = useState<{ type: string; id: string; subContainer: string | null } | null>(null)
  const [stockDialog, setStockDialog] = useState<{
    brandVariantId: string; itemName: string; category: string | null; subcategory: string | null; itemType: string | null
    brand: string | null; origin: string | null; sku: string | null
    breakdown: { totalQty: number; totalValue: number; warehouses: { name: string; subContainer: string | null; qty: number; value: number }[] }
  } | null>(null)

  const { data: movements = [] } = useStockMovements({ limit: 200 })
  const { data: fullStock = [] } = useWarehouseStock()
  const divVisible = useDivisionScopedVisibility()

  const warehouseMap = useMemo(() => new Map(warehouses.map(w => [w.id, w.name])), [warehouses])

  const variantMeta = useMemo(() => {
    const map = new Map<string, { categoryName: string | null; subcategoryName: string | null; itemType: string | null; itemName: string; brand: string | null; origin: string | null }>()
    for (const s of fullStock) {
      if (!map.has(s.brand_variant_id)) {
        map.set(s.brand_variant_id, { categoryName: s.category_name ?? null, subcategoryName: s.subcategory_name ?? null, itemType: s.item_type ?? null, itemName: s.item_name, brand: s.brand ?? null, origin: s.country_name ?? null })
      }
    }
    return map
  }, [fullStock])

  // Per-variant warehouse breakdown for stock qty & value tooltips.
  // warehouse_stock_view is grouped by (warehouse, sub_container, variant), so
  // each row is a distinct (warehouse, sub-container) slice — carry the
  // sub-container name so the breakdown popup can show it.
  const variantStockBreakdown = useMemo(() => {
    const map = new Map<string, { totalQty: number; totalValue: number; warehouses: { name: string; subContainer: string | null; qty: number; value: number }[] }>()
    for (const s of fullStock) {
      if (!map.has(s.brand_variant_id)) {
        map.set(s.brand_variant_id, { totalQty: 0, totalValue: 0, warehouses: [] })
      }
      const entry = map.get(s.brand_variant_id)!
      entry.totalQty   += s.qty
      entry.totalValue += s.total_value
      const whName = warehouseMap.get(s.warehouse_id) ?? 'Unknown'
      entry.warehouses.push({ name: whName, subContainer: s.sub_container_name, qty: s.qty, value: s.total_value })
    }
    return map
  }, [fullStock, warehouseMap])

  const filtered = useMemo(() => {
    return movements.filter((m: StockMovement) => {
      const q = search.toLowerCase()
      const matchSearch = !q ||
        m.item_name?.toLowerCase().includes(q) ||
        m.sku?.toLowerCase().includes(q)
      const matchWh = warehouseFilter === 'all' || m.warehouse_id === warehouseFilter
      const matchSub = subContainerFilter === 'all' || m.sub_container_id === subContainerFilter
      const matchType = typeFilter === 'all' || m.movement_type === typeFilter
      const matchStream = streamFilter === 'all' || m.stream === streamFilter
      const matchDiv = divVisible(m.sub_container_id)
      return matchSearch && matchWh && matchSub && matchType && matchStream && matchDiv
    })
  }, [movements, search, warehouseFilter, subContainerFilter, typeFilter, streamFilter, divVisible])

  const [page, setPage] = useState(1)
  const PAGE_SIZE = 25
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  useEffect(() => { setPage(1) }, [search, warehouseFilter, subContainerFilter, typeFilter, streamFilter])
  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="h-8 min-h-11 md:min-h-0 text-xs pl-8"
            placeholder="Search item / SKU…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={warehouseFilter} onValueChange={v => setWarehouseFilter(v ?? 'all')}>
          <SelectTrigger className="min-w-[160px] h-8 text-xs">
            <SelectValue placeholder="All Warehouses" />
          </SelectTrigger>
          <SelectContent className="max-h-60 overflow-y-auto">
            <SelectItem value="all" className="text-xs">All Warehouses</SelectItem>
            {warehouses.map(wh => (
              <SelectItem key={wh.id} value={wh.id} className="text-xs">{wh.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {activeSubs.length > 1 && (
          <Select value={subContainerFilter} onValueChange={v => setSubContainerFilter(v ?? 'all')}>
            <SelectTrigger className="min-w-[160px] h-8 text-xs">
              <SelectValue placeholder="All Sub-containers" />
            </SelectTrigger>
            <SelectContent className="max-h-60 overflow-y-auto">
              <SelectItem value="all" className="text-xs">All Sub-containers</SelectItem>
              {activeSubs.map((sc) => (
                <SelectItem key={sc.id} value={sc.id} className="text-xs">
                  {shortenSubContainerName(sc.name, subWhName)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={streamFilter} onValueChange={v => setStreamFilter((v ?? 'all') as 'all' | 'good' | 'damaged')}>
          <SelectTrigger className="min-w-[140px] h-8 text-xs">
            <SelectValue placeholder="All Streams" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Streams</SelectItem>
            <SelectItem value="good" className="text-xs">Good stock</SelectItem>
            <SelectItem value="damaged" className="text-xs">Damaged stock</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={v => setTypeFilter(v ?? 'all')}>
          <SelectTrigger className="min-w-[160px] h-8 text-xs">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent className="max-h-60 overflow-y-auto">
            <SelectItem value="all" className="text-xs">All Types</SelectItem>
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Good stock</div>
            {GOOD_MOVEMENT_TYPES.map(t => (
              <SelectItem key={t} value={t} className="text-xs">{MOVEMENT_LABELS[t]}</SelectItem>
            ))}
            <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-t mt-1">Damaged stock</div>
            {DAMAGED_MOVEMENT_TYPES.map(t => (
              <SelectItem key={t} value={t} className="text-xs">{MOVEMENT_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <WarehouseReportButton reportType="movements" warehouseId={warehouseFilter === 'all' ? undefined : warehouseFilter} label="Report" />
      </div>

      {/* ── Mobile card list (< md) ─────────────────────────────────── */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 ? (
          <EmptyState title="No movements found" />
        ) : paged.map((m: StockMovement) => {
          const meta = variantMeta.get(m.brand_variant_id)
          const refCfg = REF_CONFIG[m.reference_type ?? '']
          return (
            <div
              key={m.id}
              className="bg-card border rounded-md p-3 min-h-11"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <ItemTreeCell
                    category={meta?.categoryName}
                    subcategory={meta?.subcategoryName}
                    itemType={meta?.itemType}
                    itemName={meta?.itemName ?? m.item_name}
                    brand={meta?.brand}
                    origin={meta?.origin ?? m.country_name ?? null}
                    sku={m.sku}
                    showSku
                  />
                </div>
                <span className="text-lg font-bold tabular-nums shrink-0 leading-none pt-0.5">{m.qty}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <Badge className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0 ${MOVEMENT_STYLES[m.movement_type] ?? 'bg-muted text-muted-foreground'}`}>
                  {m.movement_type === 'free_receival' && <Gift className="h-3 w-3" />}
                  {MOVEMENT_LABELS[m.movement_type] ?? m.movement_type?.replace(/_/g, ' ')}
                </Badge>
                {m.stream === 'damaged' && (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-destructive/40 text-destructive">
                    Damaged
                  </Badge>
                )}
                {refCfg && m.reference_id ? (
                  <span
                    className="text-[10px] text-primary hover:underline cursor-pointer"
                    onClick={() => setRefDialog({ type: m.reference_type!, id: m.reference_id!, subContainer: m.sub_container_name })}
                  >
                    {refCfg.label}
                  </span>
                ) : refCfg ? (
                  <span className="text-[10px] text-muted-foreground">{refCfg.label}</span>
                ) : null}
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {m.created_at ? format(new Date(m.created_at), 'dd MMM yy') : '—'}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Desktop table (md+) ───────────────────────────────────── */}
      <div className="rounded-md border overflow-x-auto hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs w-[22%]">Item</TableHead>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs text-right">Qty</TableHead>
              <TableHead className="text-xs text-right">Unit Cost</TableHead>
              <TableHead className="text-xs text-right">Total</TableHead>
              <TableHead className="text-xs text-right">Stock</TableHead>
              <TableHead className="text-xs text-right hidden lg:table-cell">Stock Value</TableHead>
              <TableHead className="text-xs hidden lg:table-cell">Warehouse</TableHead>
              <TableHead className="text-xs hidden xl:table-cell">Sub-container</TableHead>
              <TableHead className="text-xs">Ref</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="p-0">
                  <EmptyState title="No movements found" />
                </TableCell>
              </TableRow>
            ) : (
              paged.map((m: StockMovement) => {
                const meta = variantMeta.get(m.brand_variant_id)
                const stockInfo = variantStockBreakdown.get(m.brand_variant_id)
                const refCfg = REF_CONFIG[m.reference_type ?? '']

                return (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {m.created_at ? format(new Date(m.created_at), 'dd MMM yy') : '—'}
                    </TableCell>
                    <TableCell className="text-xs py-2.5">
                      <ItemTreeCell
                        category={meta?.categoryName}
                        subcategory={meta?.subcategoryName}
                        itemType={meta?.itemType}
                        itemName={meta?.itemName ?? m.item_name}
                        brand={meta?.brand}
                        origin={meta?.origin ?? m.country_name ?? null}
                        sku={m.sku}
                        showSku
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 flex-wrap">
                        <Badge className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0 ${MOVEMENT_STYLES[m.movement_type] ?? 'bg-muted text-muted-foreground'}`}>
                          {m.movement_type === 'free_receival' && <Gift className="h-3 w-3" />}
                          {MOVEMENT_LABELS[m.movement_type] ?? m.movement_type?.replace(/_/g, ' ')}
                        </Badge>
                        {m.stream === 'damaged' && (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-destructive/40 text-destructive">
                            Damaged
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums">{m.qty}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">{m.unit_cost != null ? fmtVal(m.unit_cost) : '—'}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">
                      {m.unit_cost != null && m.qty != null ? fmtVal(m.unit_cost * m.qty) : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums">
                      {stockInfo ? (
                        <span
                          className="cursor-pointer underline decoration-dashed underline-offset-2 hover:text-primary"
                          onClick={() => setStockDialog({
                            brandVariantId: m.brand_variant_id,
                            itemName: meta?.itemName ?? m.item_name,
                            category: meta?.categoryName ?? null,
                            subcategory: meta?.subcategoryName ?? null,
                            itemType: meta?.itemType ?? null,
                            brand: meta?.brand ?? null,
                            origin: meta?.origin ?? m.country_name ?? null,
                            sku: m.sku,
                            breakdown: stockInfo,
                          })}
                        >
                          {stockInfo.totalQty}
                        </span>
                      ) : (
                        <span>—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums hidden lg:table-cell">
                      {stockInfo ? (
                        <span
                          className="cursor-pointer underline decoration-dashed underline-offset-2 hover:text-primary"
                          onClick={() => setStockDialog({
                            brandVariantId: m.brand_variant_id,
                            itemName: meta?.itemName ?? m.item_name,
                            category: meta?.categoryName ?? null,
                            subcategory: meta?.subcategoryName ?? null,
                            itemType: meta?.itemType ?? null,
                            brand: meta?.brand ?? null,
                            origin: meta?.origin ?? m.country_name ?? null,
                            sku: m.sku,
                            breakdown: stockInfo,
                          })}
                        >
                          {fmtVal(stockInfo.totalValue)}
                        </span>
                      ) : (
                        <span>—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs hidden lg:table-cell">{warehouseMap.get(m.warehouse_id) ?? '—'}</TableCell>
                    <TableCell className="text-xs hidden xl:table-cell">
                      {m.sub_container_name
                        ? shortenSubContainerName(m.sub_container_name, warehouseMap.get(m.warehouse_id) ?? '')
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {refCfg ? (
                        m.reference_id ? (
                          <span
                            className="text-primary hover:underline cursor-pointer"
                            onClick={() => setRefDialog({ type: m.reference_type!, id: m.reference_id!, subContainer: m.sub_container_name })}
                          >
                            {refCfg.label}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{refCfg.label}</span>
                        )
                      ) : (
                        <span className="text-muted-foreground">{m.reference_type?.replace(/_/g, ' ') ?? '—'}</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {filtered.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>{filtered.length} movement{filtered.length !== 1 ? 's' : ''}</span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" className="h-7 w-7 p-0 min-h-11 min-w-11 md:min-h-0 md:min-w-0" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Previous page">
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="tabular-nums min-w-[80px] text-center">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0 min-h-11 min-w-11 md:min-h-0 md:min-w-0" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} aria-label="Next page">
                <ChevronRightIcon className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Reference detail dialog */}
      {refDialog && (
        <WhMovementRefDialog
          referenceType={refDialog.type}
          referenceId={refDialog.id}
          subContainerName={refDialog.subContainer}
          open={!!refDialog}
          onClose={() => setRefDialog(null)}
        />
      )}

      {/* Stock detail dialog */}
      {stockDialog && (
        <WhStockDetailDialog
          open={!!stockDialog}
          onClose={() => setStockDialog(null)}
          itemName={stockDialog.itemName}
          category={stockDialog.category}
          subcategory={stockDialog.subcategory}
          itemType={stockDialog.itemType}
          brand={stockDialog.brand}
          origin={stockDialog.origin}
          sku={stockDialog.sku}
          breakdown={stockDialog.breakdown}
        />
      )}
    </div>
  )
})
