'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useWarehouseStock } from '@/hooks/useWarehouseOperations'
import { Warehouse } from '@/hooks/useWarehouses'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BrandEntry {
  brand: string | null
  sku: string | null
  brand_variant_id: string
  qty: number
  avgCost: number
  totalValue: number
}

interface ItemEntry {
  itemName: string
  totalQty: number
  totalValue: number
  brands: BrandEntry[]
}

interface CategoryGroup {
  categoryName: string
  itemType: string | null
  totalQty: number
  totalValue: number
  items: ItemEntry[]
}

const TYPE_SHORT_LABEL: Record<string, string> = {
  'products':    'Products',
  'spare-parts': 'Spare Parts',
  'consumables': 'Consumables',
  'tools':       'Tools',
}

// ─── Small tooltip ────────────────────────────────────────────────────────────

function StockTooltip({ qty, title, rows }: {
  qty: number
  title: string
  rows: { label: string; qty: number }[]
}) {
  if (rows.length <= 1) return <span>{qty}</span>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-default underline decoration-dashed underline-offset-2">{qty}</span>
      </TooltipTrigger>
      <TooltipContent side="left" className="bg-popover text-popover-foreground border shadow-md p-0 min-w-[180px]">
        <div className="px-3 py-1.5 border-b">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        </div>
        <div className="px-3 py-1.5 space-y-1">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-4 text-xs">
              <span className="text-muted-foreground">{r.label}</span>
              <span className={`font-semibold tabular-nums ${r.qty > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>{r.qty}</span>
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  warehouseId: string
  warehouses: Warehouse[]
}

export function WarehouseStockTree({ warehouseId, warehouses }: Props) {
  const { data: stock = [], isLoading } = useWarehouseStock(warehouseId)

  // Full stock (all warehouses) for warehouse breakdown tooltip on brand rows
  const { data: fullStock = [] } = useWarehouseStock()

  const warehouseBreakdown = useMemo(() => {
    const map = new Map<string, { label: string; qty: number }[]>()
    for (const item of fullStock) {
      if (!map.has(item.brand_variant_id)) map.set(item.brand_variant_id, [])
      const wh = warehouses.find((w) => w.id === item.warehouse_id)
      map.get(item.brand_variant_id)!.push({ label: wh?.name ?? 'Unknown', qty: item.qty })
    }
    return map
  }, [fullStock, warehouses])

  const tree = useMemo((): CategoryGroup[] => {
    const catMap = new Map<string, { itemType: string | null; itemMap: Map<string, Map<string, BrandEntry>> }>()

    for (const s of stock) {
      const catKey = s.category_name ?? s.item_name ?? '—'
      if (!catMap.has(catKey)) catMap.set(catKey, { itemType: s.item_type ?? null, itemMap: new Map() })
      const { itemMap } = catMap.get(catKey)!

      if (!itemMap.has(s.item_name)) itemMap.set(s.item_name, new Map())
      const brandMap = itemMap.get(s.item_name)!

      if (!brandMap.has(s.brand_variant_id)) {
        brandMap.set(s.brand_variant_id, { brand: s.brand, sku: s.sku, brand_variant_id: s.brand_variant_id, qty: 0, avgCost: 0, totalValue: 0 })
      }
      const entry = brandMap.get(s.brand_variant_id)!
      entry.qty        += s.qty ?? 0
      entry.totalValue += s.total_value ?? 0
    }

    return Array.from(catMap.entries()).map(([categoryName, { itemType, itemMap }]) => {
      const items: ItemEntry[] = Array.from(itemMap.entries()).map(([itemName, brandMap]) => {
        const brands: BrandEntry[] = Array.from(brandMap.values()).map((b) => ({
          ...b, avgCost: b.qty > 0 ? b.totalValue / b.qty : 0,
        }))
        return { itemName, totalQty: brands.reduce((s, b) => s + b.qty, 0), totalValue: brands.reduce((s, b) => s + b.totalValue, 0), brands }
      })
      return { categoryName, itemType, totalQty: items.reduce((s, i) => s + i.totalQty, 0), totalValue: items.reduce((s, i) => s + i.totalValue, 0), items }
    })
  }, [stock])

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())

  const toggleCategory = useCallback((key: string) => {
    setExpandedCategories((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }, [])

  const toggleItem = useCallback((key: string) => {
    setExpandedItems((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }, [])

  if (isLoading) return <p className="text-xs text-muted-foreground py-2 text-center">Loading…</p>
  if (tree.length === 0) return <p className="text-xs text-muted-foreground py-2 text-center">No stock</p>

  return (
    <TooltipProvider delayDuration={150}>
      <div className="border rounded-md overflow-hidden text-xs">
        {/* Header */}
        <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-1.5 bg-muted/30 border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Item</span>
          <span className="text-right w-12">Stock</span>
          <span className="text-right w-20">Value (QR)</span>
        </div>

        {tree.map((cat) => {
          const catExpanded = expandedCategories.has(cat.categoryName)
          return (
            <React.Fragment key={cat.categoryName}>
              {/* Category row */}
              <div
                className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-1.5 bg-muted/20 hover:bg-muted/40 cursor-pointer border-b items-center"
                onClick={() => toggleCategory(cat.categoryName)}
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  {catExpanded
                    ? <ChevronDown  className="h-3 w-3 text-muted-foreground shrink-0" />
                    : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
                  <span>{cat.categoryName}</span>
                  {cat.itemType && TYPE_SHORT_LABEL[cat.itemType] && (
                    <span className="text-[9px] font-normal text-muted-foreground border border-border rounded px-1 py-0.5">
                      {TYPE_SHORT_LABEL[cat.itemType]}
                    </span>
                  )}
                </div>
                <div className="text-right w-12 font-semibold">
                  <StockTooltip
                    qty={cat.totalQty}
                    title="Stock by Item"
                    rows={cat.items.map((i) => ({ label: i.itemName, qty: i.totalQty }))}
                  />
                </div>
                <div className="text-right w-20 font-semibold">{cat.totalValue.toFixed(2)}</div>
              </div>

              {/* Item rows */}
              {catExpanded && cat.items.map((item) => {
                const itemKey = `${cat.categoryName}__${item.itemName}`
                const itemExpanded = expandedItems.has(itemKey)
                return (
                  <React.Fragment key={itemKey}>
                    <div
                      className="grid grid-cols-[1fr_auto_auto] gap-2 pl-6 pr-3 py-1.5 hover:bg-muted/20 cursor-pointer border-b items-center"
                      onClick={() => toggleItem(itemKey)}
                    >
                      <div className="flex items-center gap-1.5 font-medium">
                        {itemExpanded
                          ? <ChevronDown  className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                          : <ChevronRight className="h-2.5 w-2.5 text-muted-foreground shrink-0" />}
                        <span>{item.itemName}</span>
                        {item.brands.length > 1 && (
                          <span className="text-[9px] text-muted-foreground italic">{item.brands.length} brands</span>
                        )}
                      </div>
                      <div className="text-right w-12 font-medium">
                        <StockTooltip
                          qty={item.totalQty}
                          title="Stock by Brand"
                          rows={item.brands.map((b) => ({ label: b.brand ?? '—', qty: b.qty }))}
                        />
                      </div>
                      <div className="text-right w-20">{item.totalValue.toFixed(2)}</div>
                    </div>

                    {/* Brand rows */}
                    {itemExpanded && item.brands.map((b) => (
                      <div
                        key={b.brand_variant_id}
                        className="grid grid-cols-[1fr_auto_auto] gap-2 pl-11 pr-3 py-1 bg-muted/5 border-b items-center"
                      >
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <span>{b.brand ?? '—'}</span>
                          {b.sku && <span className="text-[9px] text-primary">{b.sku}</span>}
                        </div>
                        <div className="text-right w-12">
                          <StockTooltip
                            qty={b.qty}
                            title="Stock by Warehouse"
                            rows={warehouseBreakdown.get(b.brand_variant_id) ?? []}
                          />
                        </div>
                        <div className="text-right w-20 text-muted-foreground">{b.totalValue.toFixed(2)}</div>
                      </div>
                    ))}
                  </React.Fragment>
                )
              })}
            </React.Fragment>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
