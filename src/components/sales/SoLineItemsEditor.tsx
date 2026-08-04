// src/components/sales/SoLineItemsEditor.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import type { ElementType } from 'react'
import { toast } from 'sonner'
import { Trash2, Plus, ShoppingBag, Cog, Droplets, Wrench, ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CascadeInventorySelector } from '@/components/purchase/CascadeInventorySelector'
import { ProductAttributePicker } from '@/components/shared/ProductAttributePicker'
import { createClient } from '@/lib/supabase/client'
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

// Tools & Assets intentionally excluded from SO line-item creation — tools are
// company-owned equipment tracked as serialized assets, not sold to customers.
const ALL_TYPES: SoLineType[] = ['products', 'consumables', 'spare-parts']

function makeRow(line_type: SoLineType): SoLineItemRow {
  return {
    _key: crypto.randomUUID(), line_type,
    item_name: '', sku: '', qty: 1, unit: 'pcs',
    unit_price: 0, total: 0,
    brand_variant_id: null,
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

  // Picker mode — Browse (CascadeInventorySelector, default) vs Guided
  // (ProductAttributePicker). Persisted per project convention.
  const [pickerMode, setPickerMode] = useState<'browse' | 'guided'>(() => {
    if (typeof window === 'undefined') return 'browse'
    const stored = window.localStorage.getItem('so.pickerMode')
    return stored === 'guided' ? 'guided' : 'browse'
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('so.pickerMode', pickerMode)
  }, [pickerMode])

  // Which row's guided picker is open (by row _key). null when no picker open.
  const [guidedForKey, setGuidedForKey] = useState<string | null>(null)

  function handleRowPriceLoading(key: string, loading: boolean) {
    if (loading) { priceLoadingKeys.current.add(key) } else { priceLoadingKeys.current.delete(key) }
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

  /**
   * Resolve a brand_variant_id into an InventoryLookupResult so the guided
   * picker's minimal (itemId, brandVariantId) output can feed the same
   * handleInventorySelect path as the cascade selector. Uses selling_price
   * and average_cost off the brand-variant, item metadata off inventory_items,
   * and category names via the FK.
   */
  async function resolveLookupByBrandVariant(brandVariantId: string): Promise<InventoryLookupResult | null> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('inventory_item_brand_variants')
      .select(`
        id, brand, average_cost, selling_price,
        inventory_items!inner(
          name_en, name_ar, sku, unit,
          inventory_categories!inner(name_en, name_ar)
        )
      `)
      .eq('id', brandVariantId)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    const item = data.inventory_items as unknown as {
      name_en: string
      name_ar: string | null
      sku: string
      unit: string
      inventory_categories: { name_en: string; name_ar: string | null }
    }
    return {
      brand_variant_id: data.id,
      item_name:        item.name_en,
      item_name_ar:     item.name_ar,
      sku:              item.sku,
      unit:             item.unit,
      cost_price:       Number(data.average_cost ?? 0),
      selling_price:    Number(data.selling_price ?? 0),
      category_name:    item.inventory_categories?.name_en ?? null,
      category_name_ar: item.inventory_categories?.name_ar ?? null,
      brand:            data.brand ?? null,
    }
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
      avg_cost:           item.cost_price,           // cost_price is always number
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
        <div className="flex flex-wrap items-center gap-2 justify-between">
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
          <div className="inline-flex rounded-md border p-0.5 bg-muted/40 shrink-0" title="Choose how to find items">
            <button
              type="button"
              onClick={() => setPickerMode('browse')}
              className={`px-2 h-6 text-[10px] rounded transition ${
                pickerMode === 'browse'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Browse
            </button>
            <button
              type="button"
              onClick={() => setPickerMode('guided')}
              className={`px-2 h-6 text-[10px] rounded transition ${
                pickerMode === 'guided'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Guided
            </button>
          </div>
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

            {/* Rows */}
            <div className="divide-y">
              {rows.map((row) => {
                return (
                  <div key={row._key} className="px-3 py-2.5 space-y-2">
                    {/* Row 1: item picker + delete */}
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        {readOnly ? (
                          <div className="h-9 px-2 flex items-center rounded-md border bg-muted/30 text-sm font-medium truncate">
                            {row.item_name || '—'}
                          </div>
                        ) : pickerMode === 'browse' ? (
                          <CascadeInventorySelector
                            lineType={lineType}
                            value={buildInventoryValue(row)}
                            onChange={(item) => handleInventorySelect(row._key, item)}
                            onPriceLoading={(loading) => handleRowPriceLoading(row._key, loading)}
                            filterByActiveDivision
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setGuidedForKey(row._key)}
                            className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm hover:bg-accent/50"
                          >
                            {row.item_name ? (
                              <span className="truncate">
                                <span className="font-medium">{row.item_name}</span>
                                {row.sku && (
                                  <span className="text-muted-foreground text-[11px] ml-1.5">{row.sku}</span>
                                )}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Pick by attribute…</span>
                            )}
                            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50 ml-2" />
                          </button>
                        )}
                      </div>
                      {!readOnly && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-destructive/60 hover:text-destructive shrink-0"
                          onClick={() => removeRow(row._key)}
                          aria-label="Remove line"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    {/* Row 2: field grid */}
                    <div className="flex flex-wrap gap-3 pl-1">
                      <div className="space-y-0.5 w-[110px]">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">SKU</label>
                        <Input
                          className="h-9 text-sm"
                          placeholder="SKU"
                          value={row.sku}
                          readOnly={readOnly}
                          onChange={(e) => updateRow(row._key, { sku: e.target.value })}
                        />
                      </div>
                      <div className="space-y-0.5 w-[70px]">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Qty *</label>
                        <Input
                          type="number"
                          min={1}
                          className="h-9 text-sm text-right tabular-nums"
                          value={row.qty}
                          readOnly={readOnly}
                          onChange={(e) => updateRow(row._key, { qty: Math.max(1, Number(e.target.value)) })}
                        />
                      </div>
                      <div className="space-y-0.5 w-[70px]">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Unit</label>
                        <Input
                          className="h-9 text-sm"
                          placeholder="pcs"
                          value={row.unit}
                          readOnly={readOnly}
                          onChange={(e) => updateRow(row._key, { unit: e.target.value })}
                        />
                      </div>
                      <div className="space-y-0.5 w-[115px]">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                          Unit Cost <span aria-hidden className="text-muted-foreground/60">🔒</span>
                        </label>
                        <div
                          className="h-9 px-3 flex items-center justify-end rounded-md border bg-muted/30 text-sm tabular-nums text-muted-foreground"
                          title="Cost basis — always in QAR (inventory average cost)"
                        >
                          {formatCurrency(row.avg_cost ?? 0, 'QAR')}
                        </div>
                      </div>
                      <div className="space-y-0.5 w-[115px]">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Sale Price *</label>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          className="h-9 text-sm text-right tabular-nums"
                          value={row.unit_price}
                          readOnly={readOnly}
                          onChange={(e) => updateRow(row._key, { unit_price: Number(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-0.5 flex-1 min-w-[130px]">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Total</label>
                        <div className="h-9 px-3 flex items-center justify-end rounded-md border bg-muted/30 text-sm font-semibold tabular-nums">
                          {formatCurrency(row.total, currency)}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Guided picker sub-dialog. Resolves the picker's (itemId, brandVariantId)
          output into a full InventoryLookupResult so the browse-mode path and
          guided-mode path both flow through handleInventorySelect. */}
      <Dialog
        open={pickerMode === 'guided' && guidedForKey !== null}
        onOpenChange={(o) => { if (!o) setGuidedForKey(null) }}
      >
        <DialogContent className="w-full h-full rounded-none sm:rounded-lg sm:w-[46rem] sm:h-[90vh] sm:max-w-[95vw] flex flex-col overflow-hidden">
          <DialogHeader className="border-b pb-3">
            <DialogTitle>Guided item pick</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-3 pr-1">
            {guidedForKey !== null && (
              <ProductAttributePicker
                key={`so-guided-${guidedForKey}`}
                onPick={async (_itemId, brandVariantId) => {
                  const targetKey = guidedForKey
                  if (!targetKey) return
                  // Same-line reselect: allow. Cross-line duplicate: block.
                  const currentRow = value.find((r) => r._key === targetKey)
                  const conflict = value.some((r) => r._key !== targetKey && r.brand_variant_id === brandVariantId)
                  if (conflict) {
                    toast.error('That variant is already on another line.')
                    return
                  }
                  if (currentRow?.brand_variant_id === brandVariantId) {
                    setGuidedForKey(null)
                    return
                  }
                  try {
                    const lookup = await resolveLookupByBrandVariant(brandVariantId)
                    if (!lookup) {
                      toast.error('Could not resolve item details — try Browse mode.')
                      return
                    }
                    handleInventorySelect(targetKey, lookup)
                    setGuidedForKey(null)
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'Failed to load item details')
                  }
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
