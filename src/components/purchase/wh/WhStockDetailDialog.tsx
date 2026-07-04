'use client'

import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Layers, Warehouse } from 'lucide-react'
import { ItemTreeCell } from './ItemTreeCell'

const fmtVal = (n: number) => n.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface StockBreakdown {
  totalQty: number
  totalValue: number
  warehouses: { name: string; qty: number; value: number; avgCost?: number }[]
}

interface Props {
  open: boolean
  onClose: () => void
  itemName: string
  category: string | null
  subcategory?: string | null
  itemType: string | null
  brand: string | null
  sku: string | null
  breakdown: StockBreakdown
}

export function WhStockDetailDialog({ open, onClose, itemName, category, subcategory, itemType, brand, sku, breakdown }: Props) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto p-0">
        <div className="px-6 pt-6 pb-4 space-y-4">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Layers className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold">Stock Overview</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Per-warehouse breakdown</p>
            </div>
          </div>

          <Separator />

          {/* Item info */}
          <div className="rounded-lg border bg-muted/20 px-4 py-3">
            <ItemTreeCell
              category={category}
              subcategory={subcategory}
              itemType={itemType}
              itemName={itemName}
              brand={brand}
              sku={sku}
              showSku
            />
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border px-4 py-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Total Stock</p>
              <p className="text-xl font-bold tabular-nums mt-1">{breakdown.totalQty}</p>
            </div>
            <div className="rounded-lg border px-4 py-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Total Value</p>
              <p className="text-xl font-bold tabular-nums mt-1">{fmtVal(breakdown.totalValue)}</p>
            </div>
          </div>

          {/* Per-warehouse breakdown */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Warehouse Breakdown</p>
            <div className="rounded-lg border overflow-hidden">
              <div className="grid grid-cols-[1fr_70px_80px_90px] gap-2 px-4 py-2 bg-muted/30 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Warehouse</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Avg Cost</span>
                <span className="text-right">Value</span>
              </div>
              <div className="max-h-[220px] overflow-y-auto divide-y">
                {breakdown.warehouses.map((w) => (
                  <div key={w.name} className="grid grid-cols-[1fr_70px_80px_90px] gap-2 px-4 py-2.5 items-center">
                    <div className="flex items-center gap-2 min-w-0">
                      <Warehouse className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm font-medium truncate">{w.name}</span>
                    </div>
                    <span className="text-sm text-right tabular-nums">{w.qty}</span>
                    <span className="text-sm text-right tabular-nums">{w.qty > 0 ? fmtVal(w.value / w.qty) : '—'}</span>
                    <span className="text-sm text-right tabular-nums font-medium">{fmtVal(w.value)}</span>
                  </div>
                ))}
                {breakdown.warehouses.length > 1 && (
                  <div className="grid grid-cols-[1fr_70px_80px_90px] gap-2 px-4 py-2.5 items-center bg-muted/30 font-semibold">
                    <span className="text-sm">Total</span>
                    <span className="text-sm text-right tabular-nums">{breakdown.totalQty}</span>
                    <span className="text-sm text-right tabular-nums">
                      {breakdown.totalQty > 0 ? fmtVal(breakdown.totalValue / breakdown.totalQty) : '—'}
                    </span>
                    <span className="text-sm text-right tabular-nums">{fmtVal(breakdown.totalValue)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
