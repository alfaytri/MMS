// src/components/sales/SoLineItemsEditor.tsx
'use client'

import { useRef } from 'react'
import type { ElementType } from 'react'
import { Trash2, Plus, ShoppingBag, Cog, Droplets, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { CascadeInventorySelector } from '@/components/purchase/CascadeInventorySelector'
import { ToolAssetLookup, type ToolAssetLookupResult } from '@/components/purchase/ToolAssetLookup'
import type { InventoryLookupResult } from '@/hooks/usePurchaseOrders'
import { formatCurrency } from '@/lib/utils/formatters'
import type { SOLineItemDraft } from '@/hooks/useSaleOrders'

export type SoLineType = 'products' | 'spare-parts' | 'consumables' | 'tools'

export type SoLineItemRow = SOLineItemDraft & {
  _key:      string
  line_type: SoLineType
}

interface TypeConfig { label: string; icon: ElementType; headerClass: string; buttonClass: string }

const TYPE_CONFIG: Record<SoLineType, TypeConfig> = {
  products:      { label: 'Products',       icon: ShoppingBag, headerClass: 'bg-blue-500/10 text-blue-700 border-b border-blue-200',    buttonClass: 'border-blue-300 bg-blue-500/10 text-blue-700 hover:bg-blue-500/20' },
  'spare-parts': { label: 'Spare Parts',    icon: Cog,         headerClass: 'bg-amber-500/10 text-amber-700 border-b border-amber-200', buttonClass: 'border-amber-300 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20' },
  consumables:   { label: 'Consumables',    icon: Droplets,    headerClass: 'bg-green-500/10 text-green-700 border-b border-green-200', buttonClass: 'border-green-300 bg-green-500/10 text-green-700 hover:bg-green-500/20' },
  tools:         { label: 'Tools & Assets', icon: Wrench,      headerClass: 'bg-purple-500/10 text-purple-700 border-b border-purple-200', buttonClass: 'border-purple-300 bg-purple-500/10 text-purple-700 hover:bg-purple-500/20' },
}

const ALL_TYPES: SoLineType[] = ['products', 'spare-parts', 'consumables', 'tools']

function makeRow(line_type: SoLineType): SoLineItemRow {
  return {
    _key: crypto.randomUUID(), line_type,
    item_name: '', sku: '', qty: 1, unit: 'pcs',
    unit_price: 0, total: 0,
    brand_variant_id: null, tool_asset_item_id: null,
    avg_cost: 0,
  }
}

interface SoLineItemsEditorProps {
  value:           SoLineItemRow[]
  onChange:        (rows: SoLineItemRow[]) => void
  currency:        string
  readOnly?:       boolean
  onPriceLoading?: (loading: boolean) => void
}

export function SoLineItemsEditor({
  value,
  onChange,
  currency,
  readOnly = false,
  onPriceLoading,
}: SoLineItemsEditorProps) {
  const priceLoadingKeys = useRef(new Set<string>())

  function handleRowPriceLoading(key: string, loading: boolean) {
    loading ? priceLoadingKeys.current.add(key) : priceLoadingKeys.current.delete(key)
    onPriceLoading?.(priceLoadingKeys.current.size > 0)
  }

  function addRow(line_type: SoLineType) { onChange([...value, makeRow(line_type)]) }
  function removeRow(key: string) { onChange(value.filter((r) => r._key !== key)) }

  function updateRow(key: string, patch: Partial<SoLineItemRow>) {
    onChange(value.map((r) => {
      if (r._key !== key) return r
      const u = { ...r, ...patch }
      if ('qty' in patch || 'unit_price' in patch) u.total = u.qty * u.unit_price
      return u
    }))
  }

  function handleInventorySelect(key: string, item: InventoryLookupResult | null) {
    if (!item) {
      updateRow(key, {
        item_name: '', sku: '', unit: 'pcs',
        unit_price: 0, total: 0,
        brand_variant_id: null, avg_cost: 0,
      })
      return
    }
    const existing = value.find((r) => r._key === key)
    updateRow(key, {
      item_name:          item.item_name,
      sku:                existing?.sku?.trim() ? existing.sku : (item.sku ?? ''),
      unit:               item.unit,
      unit_price:         item.selling_price,        // selling price, not cost
      total:              item.selling_price,
      brand_variant_id:   item.brand_variant_id,
      tool_asset_item_id: null,
      avg_cost:           item.cost_price,           // cost_price is always number
    })
  }

  function handleToolSelect(key: string, item: ToolAssetLookupResult | null) {
    if (!item) {
      updateRow(key, {
        item_name: '', sku: '', unit: 'pcs',
        unit_price: 0, total: 0,
        tool_asset_item_id: null, avg_cost: 0,
      })
      return
    }
    updateRow(key, {
      item_name:          item.item_name,
      tool_asset_item_id: item.tool_asset_item_id,
      brand_variant_id:   null,
    })
  }

  /** Build a minimal InventoryLookupResult to hydrate the selector pill when a row already has a variant */
  function buildInventoryValue(row: SoLineItemRow): InventoryLookupResult | null {
    if (!row.brand_variant_id) return null
    return {
      brand_variant_id: row.brand_variant_id,
      item_name:        row.item_name,
      item_name_ar:     null,
      sku:              row.sku,
      unit:             row.unit,
      cost_price:       row.avg_cost,
      selling_price:    row.unit_price,
      category_name:    null,
      category_name_ar: null,
      brand:            null,
    }
  }

  const groupedTypes = ALL_TYPES.filter((t) => value.some((r) => r.line_type === t))

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            ADD ITEM:
          </span>
          {ALL_TYPES.map((t) => {
            const cfg = TYPE_CONFIG[t]
            const Icon = cfg.icon
            return (
              <Button
                key={t}
                type="button"
                variant="outline"
                size="sm"
                className={`h-7 text-xs gap-1.5 ${cfg.buttonClass}`}
                onClick={() => addRow(t)}
              >
                <Icon className="h-3.5 w-3.5" />
                {cfg.label}
              </Button>
            )
          })}
        </div>
      )}

      {value.length === 0 && (
        <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
          Click one of the buttons above to add a line item
        </div>
      )}

      {groupedTypes.map((lineType) => {
        const cfg = TYPE_CONFIG[lineType]
        const Icon = cfg.icon
        const rows = value.filter((r) => r.line_type === lineType)
        return (
          <div key={lineType} className="border rounded-lg overflow-hidden">
            {/* Section header */}
            <div className={`flex items-center justify-between px-3 py-2 ${cfg.headerClass}`}>
              <div className="flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5" />
                <span className="text-xs font-semibold">{cfg.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[9px] py-0 px-1.5">
                  {rows.length} item{rows.length !== 1 ? 's' : ''}
                </Badge>
                {!readOnly && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => addRow(lineType)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>

            {/* Column labels */}
            <div className="grid grid-cols-[minmax(0,2fr)_80px_65px_60px_85px_70px] gap-2 px-3 py-1.5 bg-muted/30 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              <span>Item Name</span>
              <span>SKU</span>
              <span>Qty *</span>
              <span>Unit</span>
              <span>Unit Price *</span>
              <span>Total</span>
            </div>

            {/* Rows */}
            <div className="divide-y">
              {rows.map((row) => {
                const isInventory = lineType !== 'tools'
                return (
                  <div key={row._key} className="px-3 py-2 space-y-1.5">
                    {/* Selector row */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        {readOnly ? (
                          <div className="h-8 px-2 flex items-center rounded-md border bg-muted/30 text-sm font-medium truncate">
                            {row.item_name || '—'}
                          </div>
                        ) : isInventory ? (
                          <CascadeInventorySelector
                            lineType={lineType}
                            value={buildInventoryValue(row)}
                            onChange={(item) => handleInventorySelect(row._key, item)}
                            onPriceLoading={(loading) => handleRowPriceLoading(row._key, loading)}
                          />
                        ) : (
                          <ToolAssetLookup
                            value={
                              row.tool_asset_item_id
                                ? { tool_asset_item_id: row.tool_asset_item_id, item_name: row.item_name }
                                : null
                            }
                            onChange={(item) => handleToolSelect(row._key, item)}
                          />
                        )}
                      </div>
                      {!readOnly && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive/60 hover:text-destructive shrink-0"
                          onClick={() => removeRow(row._key)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>

                    {/* Field grid */}
                    <div className="grid grid-cols-[minmax(0,2fr)_80px_65px_60px_85px_70px] gap-2 items-center">
                      <div />
                      <Input
                        className="h-7 text-xs"
                        placeholder="SKU"
                        value={row.sku}
                        readOnly={readOnly}
                        onChange={(e) => updateRow(row._key, { sku: e.target.value })}
                      />
                      <Input
                        type="number"
                        min={1}
                        className="h-7 text-xs text-right"
                        value={row.qty}
                        readOnly={readOnly}
                        onChange={(e) => updateRow(row._key, { qty: Math.max(1, Number(e.target.value)) })}
                      />
                      <Input
                        className="h-7 text-xs"
                        placeholder="pcs"
                        value={row.unit}
                        readOnly={readOnly}
                        onChange={(e) => updateRow(row._key, { unit: e.target.value })}
                      />
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        className="h-7 text-xs text-right"
                        value={row.unit_price}
                        readOnly={readOnly}
                        onChange={(e) => updateRow(row._key, { unit_price: Number(e.target.value) })}
                      />
                      <div className="h-7 px-2 flex items-center justify-end rounded-md bg-muted/30 text-xs font-medium tabular-nums">
                        {formatCurrency(row.total, currency)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
