'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { useWarehouseStock, useReorderPoints, useUpsertReorderPoint } from '@/hooks/useWarehouseOperations'
import { Warehouse } from '@/hooks/useWarehouses'

const fmtVal = (n: number) => n.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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

interface SubcategoryGroup {
  subcategoryName: string
  totalQty: number
  totalValue: number
  items: ItemEntry[]
}

interface CategoryGroup {
  categoryName: string
  itemType: string | null
  totalQty: number
  totalValue: number
  subcategories: SubcategoryGroup[]
  directItems: ItemEntry[]
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
        <div className="px-3 py-1.5 space-y-1 max-h-[300px] overflow-y-auto">
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

// ─── Helper: build items from a brand map ─────────────────────────────────────

function buildItems(itemMap: Map<string, Map<string, BrandEntry>>): ItemEntry[] {
  return Array.from(itemMap.entries()).map(([itemName, brandMap]) => {
    const brands: BrandEntry[] = Array.from(brandMap.values()).map((b) => ({
      ...b, avgCost: b.qty > 0 ? b.totalValue / b.qty : 0,
    }))
    return {
      itemName,
      totalQty: brands.reduce((s, b) => s + b.qty, 0),
      totalValue: brands.reduce((s, b) => s + b.totalValue, 0),
      brands,
    }
  })
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  warehouseId: string
  warehouses: Warehouse[]
}

export function WarehouseStockTree({ warehouseId, warehouses }: Props) {
  const { data: stock = [], isLoading } = useWarehouseStock(warehouseId)

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

  const { data: reorderPoints = [] } = useReorderPoints(warehouseId)
  const upsertRP = useUpsertReorderPoint()
  const rpMap = useMemo(() => new Map(reorderPoints.map(rp => [rp.brand_variant_id, rp.reorder_point])), [reorderPoints])

  const tree = useMemo((): CategoryGroup[] => {
    const catMap = new Map<string, {
      itemType: string | null
      subMap: Map<string, Map<string, Map<string, BrandEntry>>>
      directItemMap: Map<string, Map<string, BrandEntry>>
    }>()

    for (const s of stock) {
      const catKey = s.category_name ?? s.item_name ?? '—'
      if (!catMap.has(catKey)) {
        catMap.set(catKey, { itemType: s.item_type ?? null, subMap: new Map(), directItemMap: new Map() })
      }
      const cat = catMap.get(catKey)!

      const brandEntry: BrandEntry = {
        brand: s.brand, sku: s.sku, brand_variant_id: s.brand_variant_id,
        qty: s.qty ?? 0, avgCost: 0, totalValue: s.total_value ?? 0,
      }

      if (s.subcategory_name) {
        if (!cat.subMap.has(s.subcategory_name)) cat.subMap.set(s.subcategory_name, new Map())
        const itemMap = cat.subMap.get(s.subcategory_name)!
        if (!itemMap.has(s.item_name)) itemMap.set(s.item_name, new Map())
        const brandMap = itemMap.get(s.item_name)!
        if (!brandMap.has(s.brand_variant_id)) {
          brandMap.set(s.brand_variant_id, { ...brandEntry })
        } else {
          const existing = brandMap.get(s.brand_variant_id)!
          existing.qty += brandEntry.qty
          existing.totalValue += brandEntry.totalValue
        }
      } else {
        if (!cat.directItemMap.has(s.item_name)) cat.directItemMap.set(s.item_name, new Map())
        const brandMap = cat.directItemMap.get(s.item_name)!
        if (!brandMap.has(s.brand_variant_id)) {
          brandMap.set(s.brand_variant_id, { ...brandEntry })
        } else {
          const existing = brandMap.get(s.brand_variant_id)!
          existing.qty += brandEntry.qty
          existing.totalValue += brandEntry.totalValue
        }
      }
    }

    return Array.from(catMap.entries()).map(([categoryName, { itemType, subMap, directItemMap }]) => {
      const subcategories: SubcategoryGroup[] = Array.from(subMap.entries()).map(([subcategoryName, itemMap]) => {
        const items = buildItems(itemMap)
        return {
          subcategoryName,
          totalQty: items.reduce((s, i) => s + i.totalQty, 0),
          totalValue: items.reduce((s, i) => s + i.totalValue, 0),
          items,
        }
      })
      const directItems = buildItems(directItemMap)
      const totalQty = subcategories.reduce((s, sc) => s + sc.totalQty, 0) + directItems.reduce((s, i) => s + i.totalQty, 0)
      const totalValue = subcategories.reduce((s, sc) => s + sc.totalValue, 0) + directItems.reduce((s, i) => s + i.totalValue, 0)
      return { categoryName, itemType, totalQty, totalValue, subcategories, directItems }
    })
  }, [stock])

  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = useCallback((key: string) => {
    setExpanded((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }, [])

  if (isLoading) return <p className="text-xs text-muted-foreground py-2 text-center">Loading…</p>
  if (tree.length === 0) return <p className="text-xs text-muted-foreground py-2 text-center">No stock</p>

  function renderBrandRows(brands: BrandEntry[], indent: string) {
    return brands.map((b) => (
      <div
        key={b.brand_variant_id}
        className={`grid grid-cols-[1fr_auto_auto] gap-2 ${indent} pr-3 py-1 bg-muted/5 border-b items-center`}
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          <span>{b.brand ?? '—'}</span>
          {b.sku && <span className="text-[9px] text-primary">{b.sku}</span>}
        </div>
        <div className="text-right w-12">
          <Popover>
            <PopoverTrigger className="text-xs tabular-nums hover:underline underline-offset-2 cursor-pointer">
                {b.qty}
                {rpMap.has(b.brand_variant_id) && b.qty <= (rpMap.get(b.brand_variant_id) ?? 0) && (
                  <span className="ml-1 text-[9px] text-warning">⚠</span>
                )}
            </PopoverTrigger>
            <PopoverContent className="w-48 p-3" side="right">
              <p className="text-xs font-medium mb-2">Reorder Point</p>
              <Input
                type="number"
                className="h-7 text-xs"
                defaultValue={rpMap.get(b.brand_variant_id) ?? 0}
                onBlur={(e) => {
                  const val = parseInt(e.target.value) || 0
                  upsertRP.mutate({
                    warehouseId,
                    brandVariantId: b.brand_variant_id,
                    reorderPoint: val,
                  })
                }}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Alert when stock drops below this qty
              </p>
            </PopoverContent>
          </Popover>
        </div>
        <div className="text-right w-20 text-muted-foreground">{fmtVal(b.totalValue)}</div>
      </div>
    ))
  }

  function renderItemRows(items: ItemEntry[], parentKey: string, indentPl: string, brandIndentPl: string) {
    return items.map((item) => {
      const itemKey = `${parentKey}__${item.itemName}`
      const itemExpanded = expanded.has(itemKey)
      return (
        <React.Fragment key={itemKey}>
          <div
            className={`grid grid-cols-[1fr_auto_auto] gap-2 ${indentPl} pr-3 py-1.5 hover:bg-muted/20 cursor-pointer border-b items-center`}
            onClick={() => toggle(itemKey)}
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
            <div className="text-right w-20">{fmtVal(item.totalValue)}</div>
          </div>
          {itemExpanded && renderBrandRows(item.brands, brandIndentPl)}
        </React.Fragment>
      )
    })
  }

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
          const catExpanded = expanded.has(cat.categoryName)
          const tooltipRows = [
            ...cat.subcategories.map((sc) => ({ label: sc.subcategoryName, qty: sc.totalQty })),
            ...cat.directItems.map((i) => ({ label: i.itemName, qty: i.totalQty })),
          ]
          return (
            <React.Fragment key={cat.categoryName}>
              {/* Category row */}
              <div
                className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-1.5 bg-muted/20 hover:bg-muted/40 cursor-pointer border-b items-center"
                onClick={() => toggle(cat.categoryName)}
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
                  <StockTooltip qty={cat.totalQty} title="Stock Breakdown" rows={tooltipRows} />
                </div>
                <div className="text-right w-20 font-semibold">{fmtVal(cat.totalValue)}</div>
              </div>

              {catExpanded && (
                <>
                  {/* Subcategory rows */}
                  {cat.subcategories.map((sc) => {
                    const scKey = `${cat.categoryName}__sub__${sc.subcategoryName}`
                    const scExpanded = expanded.has(scKey)
                    return (
                      <React.Fragment key={scKey}>
                        <div
                          className="grid grid-cols-[1fr_auto_auto] gap-2 pl-6 pr-3 py-1.5 bg-blue-50/40 dark:bg-blue-950/20 hover:bg-blue-50/70 dark:hover:bg-blue-950/30 cursor-pointer border-b items-center"
                          onClick={() => toggle(scKey)}
                        >
                          <div className="flex items-center gap-1.5 font-semibold text-blue-700 dark:text-blue-400">
                            {scExpanded
                              ? <ChevronDown  className="h-2.5 w-2.5 shrink-0" />
                              : <ChevronRight className="h-2.5 w-2.5 shrink-0" />}
                            <span>{sc.subcategoryName}</span>
                            <span className="text-[9px] font-normal text-muted-foreground italic">{sc.items.length} item{sc.items.length !== 1 ? 's' : ''}</span>
                          </div>
                          <div className="text-right w-12 font-semibold">
                            <StockTooltip
                              qty={sc.totalQty}
                              title="Stock by Item"
                              rows={sc.items.map((i) => ({ label: i.itemName, qty: i.totalQty }))}
                            />
                          </div>
                          <div className="text-right w-20 font-semibold">{fmtVal(sc.totalValue)}</div>
                        </div>
                        {scExpanded && renderItemRows(sc.items, scKey, 'pl-10', 'pl-14')}
                      </React.Fragment>
                    )
                  })}

                  {/* Direct items (no subcategory) */}
                  {renderItemRows(cat.directItems, cat.categoryName, 'pl-6', 'pl-11')}
                </>
              )}
            </React.Fragment>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
