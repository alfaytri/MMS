'use client'

import { Trash2, Plus, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InventoryItemLookup, type InventoryLookupResult } from '@/components/purchase/InventoryItemLookup'
import { formatCurrency } from '@/lib/utils/formatters'
import type { SOLineItemDraft } from '@/hooks/useSaleOrders'

export type SOLineItemRow = SOLineItemDraft & { _key: string }

interface SoLineItemsEditorProps {
  value: SOLineItemRow[]
  onChange: (rows: SOLineItemRow[]) => void
}

export function SoLineItemsEditor({ value, onChange }: SoLineItemsEditorProps) {
  function addRow() {
    onChange([
      ...value,
      {
        _key: crypto.randomUUID(),
        item_name: '',
        sku: '',
        qty: 1,
        unit_price: 0,
        total: 0,
        brand_variant_id: null,
        avg_cost: undefined,
      },
    ])
  }

  function removeRow(key: string) {
    onChange(value.filter((r) => r._key !== key))
  }

  function updateRow(key: string, patch: Partial<SOLineItemRow>) {
    onChange(
      value.map((r) => {
        if (r._key !== key) return r
        const updated = { ...r, ...patch }
        if ('qty' in patch || 'unit_price' in patch) {
          updated.total = updated.qty * updated.unit_price
        }
        return updated
      })
    )
  }

  function handleItemSelected(key: string, item: InventoryLookupResult | null) {
    if (!item) {
      updateRow(key, { item_name: '', sku: '', unit_price: 0, total: 0, brand_variant_id: null, avg_cost: undefined })
      return
    }
    updateRow(key, {
      item_name: item.item_name,
      sku: item.sku ?? '',
      unit_price: item.selling_price || item.cost_price,
      total: (item.selling_price || item.cost_price) * (value.find((r) => r._key === key)?.qty ?? 1),
      brand_variant_id: item.brand_variant_id,
      avg_cost: item.cost_price,
    })
  }

  const grandTotal = value.reduce((s, r) => s + r.total, 0)

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {value.map((row, idx) => {
          const hasNegativeMargin = row.avg_cost !== undefined && row.unit_price < row.avg_cost && row.unit_price > 0
          return (
            <div key={row._key} className="grid grid-cols-12 gap-2 items-start rounded-md border p-2">
              {/* Item lookup */}
              <div className="col-span-12 sm:col-span-5">
                <InventoryItemLookup
                  value={row.brand_variant_id ? {
                    brand_variant_id: row.brand_variant_id,
                    item_name: row.item_name,
                    item_name_ar: null,
                    sku: row.sku,
                    unit: 'pcs',
                    cost_price: row.avg_cost ?? 0,
                    selling_price: row.unit_price,
                  } : null}
                  onChange={(item) => handleItemSelected(row._key, item)}
                  placeholder={`Item ${idx + 1}…`}
                />
              </div>

              {/* SKU */}
              <div className="col-span-4 sm:col-span-2">
                <Input
                  placeholder="SKU"
                  value={row.sku}
                  onChange={(e) => updateRow(row._key, { sku: e.target.value })}
                  className="text-xs"
                />
              </div>

              {/* Qty */}
              <div className="col-span-2 sm:col-span-1">
                <Input
                  type="number"
                  min="1"
                  value={row.qty}
                  onChange={(e) => updateRow(row._key, { qty: Math.max(1, Number(e.target.value)) })}
                  placeholder="Qty"
                  className="text-xs"
                />
              </div>

              {/* Unit Price */}
              <div className="col-span-4 sm:col-span-2">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.unit_price}
                  onChange={(e) => updateRow(row._key, { unit_price: Number(e.target.value) })}
                  placeholder="Price"
                  className={`text-xs ${hasNegativeMargin ? 'border-warning text-warning' : ''}`}
                />
              </div>

              {/* Total + Margin warning + Delete */}
              <div className="col-span-12 sm:col-span-2 flex items-center justify-between gap-1">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-medium">{formatCurrency(row.total, 'QAR')}</span>
                  {hasNegativeMargin && (
                    <span title={`Below cost (${formatCurrency(row.avg_cost!, 'QAR')})`}>
                      <AlertTriangle className="h-3 w-3 text-warning shrink-0" />
                    </span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => removeRow(row._key)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="h-4 w-4 mr-1" />
          Add Item
        </Button>
        <div className="text-sm font-semibold">
          Subtotal: {formatCurrency(grandTotal, 'QAR')}
        </div>
      </div>
    </div>
  )
}
