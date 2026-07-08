'use client'

import React, { useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/shared/EmptyState'
import { ItemTreeCell } from './ItemTreeCell'
import { WhMovementRefDialog } from './WhMovementRefDialog'
import { WhStockDetailDialog } from './WhStockDetailDialog'
import { WarehouseReportButton } from './WarehouseReportButton'
import { useStockMovements, useWarehouseStock, StockMovement } from '@/hooks/useWarehouseOperations'
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
  sale_return_damaged:       'Sale Return (Damaged)',
  transfer_in:               'Transfer In',
  transfer_out:              'Transfer Out',
  transfer_shrinkage:        'Transfer Shrinkage',
}

// Only user-facing types in the filter dropdown (A→Z)
const MOVEMENT_TYPES = [
  'adjustment',
  'free_receival',
  'purchase_receival',
  'purchase_return',
  'sale_delivery',
  'sale_return',
  'transfer_in',
  'transfer_out',
]

// ─── Reference type → human label + optional route ──────────────────────────

const REF_CONFIG: Record<string, { label: string }> = {
  sale_delivery:    { label: 'Sale Delivery' },
  receival:         { label: 'PO Receival' },
  po_return:        { label: 'Purchase Return' },
  return:           { label: 'Sale Return' },
  transfer:         { label: 'Stock Transfer' },
  adjustment:       { label: 'Adjustment' },
  landed_cost:      { label: 'Landed Cost' },
  inventory_check:  { label: 'Inv. Check' },
  cost_adjustment:  { label: 'Cost Adjustment' },
  free_receival:    { label: 'Free Receival' },
}

// ─── Component ──────────────────────────────────────────────────────────────

interface Props {
  warehouses: Warehouse[]
}

export const WhMovementsTab = React.memo(function WhMovementsTab({ warehouses }: Props) {
  const [search, setSearch] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [refDialog, setRefDialog] = useState<{ type: string; id: string } | null>(null)
  const [stockDialog, setStockDialog] = useState<{
    brandVariantId: string; itemName: string; category: string | null; subcategory: string | null; itemType: string | null
    brand: string | null; sku: string | null
    breakdown: { totalQty: number; totalValue: number; warehouses: { name: string; qty: number; value: number }[] }
  } | null>(null)

  const { data: movements = [] } = useStockMovements({ limit: 200 })
  const { data: fullStock = [] } = useWarehouseStock()

  const warehouseMap = useMemo(() => new Map(warehouses.map(w => [w.id, w.name])), [warehouses])

  const variantMeta = useMemo(() => {
    const map = new Map<string, { categoryName: string | null; subcategoryName: string | null; itemType: string | null; itemName: string; brand: string | null }>()
    for (const s of fullStock) {
      if (!map.has(s.brand_variant_id)) {
        map.set(s.brand_variant_id, { categoryName: s.category_name ?? null, subcategoryName: s.subcategory_name ?? null, itemType: s.item_type ?? null, itemName: s.item_name, brand: s.brand ?? null })
      }
    }
    return map
  }, [fullStock])

  // Per-variant warehouse breakdown for stock qty & value tooltips
  const variantStockBreakdown = useMemo(() => {
    const map = new Map<string, { totalQty: number; totalValue: number; warehouses: { name: string; qty: number; value: number }[] }>()
    for (const s of fullStock) {
      if (!map.has(s.brand_variant_id)) {
        map.set(s.brand_variant_id, { totalQty: 0, totalValue: 0, warehouses: [] })
      }
      const entry = map.get(s.brand_variant_id)!
      entry.totalQty   += s.qty
      entry.totalValue += s.total_value
      const whName = warehouseMap.get(s.warehouse_id) ?? 'Unknown'
      entry.warehouses.push({ name: whName, qty: s.qty, value: s.total_value })
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
      const matchType = typeFilter === 'all' || m.movement_type === typeFilter
      return matchSearch && matchWh && matchType
    })
  }, [movements, search, warehouseFilter, typeFilter])

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="h-8 text-xs pl-8"
            placeholder="Search item / SKU…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={warehouseFilter} onValueChange={v => setWarehouseFilter(v ?? 'all')}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="All Warehouses" />
          </SelectTrigger>
          <SelectContent className="max-h-60 overflow-y-auto">
            <SelectItem value="all" className="text-xs">All Warehouses</SelectItem>
            {warehouses.map(wh => (
              <SelectItem key={wh.id} value={wh.id} className="text-xs">{wh.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={v => setTypeFilter(v ?? 'all')}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent className="max-h-60 overflow-y-auto">
            <SelectItem value="all" className="text-xs">All Types</SelectItem>
            {MOVEMENT_TYPES.map(t => (
              <SelectItem key={t} value={t} className="text-xs">{MOVEMENT_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <WarehouseReportButton reportType="movements" warehouseId={warehouseFilter === 'all' ? undefined : warehouseFilter} label="Report" />
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
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
              <TableHead className="text-xs text-right">Stock Value</TableHead>
              <TableHead className="text-xs">Warehouse</TableHead>
              <TableHead className="text-xs">Ref</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="p-0">
                  <EmptyState title="No movements found" />
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((m: StockMovement) => {
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
                        sku={m.sku}
                        showSku
                      />
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] px-1.5 py-0 ${MOVEMENT_STYLES[m.movement_type] ?? 'bg-muted text-muted-foreground'}`}>
                        {MOVEMENT_LABELS[m.movement_type] ?? m.movement_type?.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>

                    {/* Movement Qty */}
                    <TableCell className="text-xs text-right tabular-nums">{m.qty}</TableCell>

                    {/* Unit Cost */}
                    <TableCell className="text-xs text-right tabular-nums">{m.unit_cost != null ? fmtVal(m.unit_cost) : '—'}</TableCell>

                    {/* Movement Total */}
                    <TableCell className="text-xs text-right tabular-nums">
                      {m.unit_cost != null && m.qty != null ? fmtVal(m.unit_cost * m.qty) : '—'}
                    </TableCell>

                    {/* Stock Qty — clickable to open stock detail dialog */}
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

                    {/* Stock Value — clickable to open stock detail dialog */}
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

                    {/* Warehouse */}
                    <TableCell className="text-xs">{warehouseMap.get(m.warehouse_id) ?? '—'}</TableCell>

                    {/* Ref — clickable to open detail dialog */}
                    <TableCell className="text-xs">
                      {refCfg ? (
                        m.reference_id ? (
                          <span
                            className="text-primary hover:underline cursor-pointer"
                            onClick={() => setRefDialog({ type: m.reference_type!, id: m.reference_id! })}
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

      {/* Reference detail dialog */}
      {refDialog && (
        <WhMovementRefDialog
          referenceType={refDialog.type}
          referenceId={refDialog.id}
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
          sku={stockDialog.sku}
          breakdown={stockDialog.breakdown}
        />
      )}
    </div>
  )
})
