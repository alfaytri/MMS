'use client'

import { useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InventoryItemLookup, type InventoryLookupResult } from './InventoryItemLookup'
import { formatCurrency } from '@/lib/utils/formatters'
import type { POLineItemDraft } from '@/hooks/usePurchaseOrders'

export type LineItemRow = POLineItemDraft & {
  _key: string // client-only stable key
}

const LINE_TYPES = [
  { value: 'inventory', label: 'Products', emoji: '📦' },
  { value: 'spare_parts', label: 'Spare Parts', emoji: '⚙️' },
  { value: 'consumable', label: 'Consumables', emoji: '💧' },
] as const

interface PoLineItemsEditorProps {
  value: LineItemRow[]
  onChange: (rows: LineItemRow[]) => void
  currency: string
}

export function PoLineItemsEditor({ value, onChange, currency }: PoLineItemsEditorProps) {
  const [lineType, setLineType] = useState<string>('inventory')

  function addRow() {
    onChange([
      ...value,
      {
        _key: crypto.randomUUID(),
        item_name: '',
        sku: '',
        qty: 1,
        unit: 'pcs',
        unit_price: 0,
        total_price: 0,
        brand_variant_id: null,
        free_qty: 0,
      },
    ])
  }

  function removeRow(key: string) {
    onChange(value.filter((r) => r._key !== key))
  }

  function updateRow(key: string, patch: Partial<LineItemRow>) {
    onChange(
      value.map((r) => {
        if (r._key !== key) return r
        const updated = { ...r, ...patch }
        if ('qty' in patch || 'unit_price' in patch) {
          updated.total_price = updated.qty * updated.unit_price
        }
        return updated
      })
    )
  }

  function handleItemSelected(key: string, item: InventoryLookupResult | null) {
    if (!item) {
      updateRow(key, { item_name: '', sku: '', unit: 'pcs', unit_price: 0, total_price: 0, brand_variant_id: null })
      return
    }
    updateRow(key, {
      item_name: item.item_name,
      sku: item.sku ?? '',
      unit: item.unit,
      unit_price: item.cost_price,
      total_price: item.cost_price,
      brand_variant_id: item.brand_variant_id,
    })
  }

  const grandTotal = value.reduce((s, r) => s + r.total_price, 0)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {LINE_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setLineType(t.value)}
            className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              lineType === t.value ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'
            }`}
          >
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {value.map((row, idx) => (
          <div key={row._key} className="grid grid-cols-12 gap-2 items-start rounded-md border p-2">
            <div className="col-span-12 sm:col-span-5">
              <InventoryItemLookup
                value={row.brand_variant_id ? {
                  brand_variant_id: row.brand_variant_id,
                  item_name: row.item_name,
                  item_name_ar: null,
                  sku: row.sku,
                  unit: row.unit,
                  cost_price: row.unit_price,
                  selling_price: 0,
                } : null}
                onChange={(item) => handleItemSelected(row._key, item)}
                placeholder={`Item ${idx + 1}…`}
              />
            </div>
            <div className="col-span-4 sm:col-span-2">
              <Input placeholder="SKU" value={row.sku} onChange={(e) => updateRow(row._key, { sku: e.target.value })} className="text-xs" />
            </div>
            <div className="col-span-3 sm:col-span-1">
              <Input type="number" min="1" value={row.qty} onChange={(e) => updateRow(row._key, { qty: Math.max(1, Number(e.target.value)) })} placeholder="Qty" className="text-xs" />
            </div>
            <div className="col-span-3 sm:col-span-1">
              <Input value={row.unit} onChange={(e) => updateRow(row._key, { unit: e.target.value })} placeholder="Unit" className="text-xs" />
            </div>
            <div className="col-span-5 sm:col-span-2">
              <Input type="number" min="0" step="0.01" value={row.unit_price} onChange={(e) => updateRow(row._key, { unit_price: Number(e.target.value) })} placeholder="Price" className="text-xs" />
            </div>
            <div className="col-span-7 sm:col-span-1 flex items-center justify-between gap-1">
              <span className="text-xs font-medium">{formatCurrency(row.total_price, currency)}</span>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0" onClick={() => removeRow(row._key)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="h-4 w-4 mr-1" /> Add Line
        </Button>
        <div className="text-sm font-semibold">Total: {formatCurrency(grandTotal, currency)}</div>
      </div>
    </div>
  )
}
