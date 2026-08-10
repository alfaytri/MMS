'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { useWarehouseStock, useReorderPoints, useUpsertReorderPoint } from '@/hooks/useWarehouseOperations'
import { brandOriginText } from '@/lib/inventory/variantPickerLabel'
import { useWarehouseSubContainers, shortenSubContainerName } from '@/hooks/useWarehouseSubContainers'
import { Warehouse } from '@/hooks/useWarehouses'

const fmtVal = (n: number) => n.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ─── Types ────────────────────────────────────────────────────────────────────

interface BrandEntry {
  brand: string | null
  country_name: string | null
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

type StockRow = {
  warehouse_id: string
  sub_container_id: string | null
  brand_variant_id: string
  item_name: string
  brand: string | null
  country_name: string | null
  sku: string | null
  qty: number | null
  total_value: number | null
  category_name: string | null
  subcategory_name: string | null
  item_type: string | null
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

// ─── Helper: build category tree from a set of stock rows ─────────────────────

function buildCategoryTree(stock: StockRow[]): CategoryGroup[] {
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
      brand: s.brand, country_name: s.country_name ?? null, sku: s.sku, brand_variant_id: s.brand_variant_id,
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
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  warehouseId: string
  warehouses: Warehouse[]
  subContainerId?: string | null
}

export function WarehouseStockTree({ warehouseId, warehouses, subContainerId }: Props) {
  const { data: stock = [], isLoading } = useWarehouseStock(warehouseId, subContainerId ?? null)

  const { data: fullStock = [] } = useWarehouseStock()
  const { data: subContainers = [] } = useWarehouseSubContainers(warehouseId)

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

  const subContainerNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const sc of subContainers) m.set(sc.id, shortenSubContainerName(sc.name, warehouses.find((w) => w.id === warehouseId)?.name ?? ''))
    return m
  }, [subContainers, warehouses, warehouseId])

  // Group stock rows by sub_container_id. When the caller has already scoped
  // to a single sub (subContainerId prop), or the warehouse only contains one
  // sub_container's worth of stock, we render a flat tree. Otherwise we split
  // the tree into per-sub-container sections so the operator can see WHERE
  // stock lives, not just aggregated totals.
  const subGroups = useMemo(() => {
    const bySub = new Map<string, StockRow[]>()
    for (const s of stock) {
      const key = s.sub_container_id ?? '__none__'
      if (!bySub.has(key)) bySub.set(key, [])
      bySub.get(key)!.push(s as StockRow)
    }
    return bySub
  }, [stock])

  const showSubGroups = !subContainerId && subGroups.size > 1

  const flatTree = useMemo(() => buildCategoryTree(stock as StockRow[]), [stock])

  const groupedTrees = useMemo(() => {
    if (!showSubGroups) return []
    return Array.from(subGroups.entries())
      .map(([subId, rows]) => ({
        subId,
        subName: subContainerNameById.get(subId) ?? 'Unassigned',
        tree: buildCategoryTree(rows),
        totalQty: rows.reduce((s, r) => s + (r.qty ?? 0), 0),
        totalValue: rows.reduce((s, r) => s + (r.total_value ?? 0), 0),
      }))
      .sort((a, b) => b.totalValue - a.totalValue)
  }, [subGroups, subContainerNameById, showSubGroups])

  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = useCallback((key: string) => {
    setExpanded((prev) => { const n = new Set(prev); if (n.has(key)) { n.delete(key) } else { n.add(key) } return n })
  }, [])

  if (isLoading) return <p className="text-xs text-muted-foreground py-2 text-center">Loading…</p>
  if (stock.length === 0) return <p className="text-xs text-muted-foreground py-2 text-center">No stock</p>

  function renderBrandRows(brands: BrandEntry[], indent: string) {
    return brands.map((b) => (
      <div
        key={b.brand_variant_id}
        className={`grid grid-cols-[1fr_auto_auto] gap-2 ${indent} pr-3 py-1 bg-muted/5 border-b items-center`}
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          <span>{brandOriginText(b.brand, b.country_name) ?? '—'}</span>
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
      const hasMultipleBrands = item.brands.length > 1
      const soleVariant = item.brands.length === 1 ? item.brands[0] : null
      const soleLabel = soleVariant ? brandOriginText(soleVariant.brand, soleVariant.country_name) : null
      return (
        <React.Fragment key={itemKey}>
          <div
            className={`grid grid-cols-[1fr_auto_auto] gap-2 ${indentPl} pr-3 py-1.5 hover:bg-muted/20 border-b items-center ${hasMultipleBrands ? 'cursor-pointer' : ''}`}
            onClick={hasMultipleBrands ? () => toggle(itemKey) : undefined}
          >
            <div className="flex items-center gap-1.5 font-medium">
              {hasMultipleBrands
                ? (itemExpanded
                    ? <ChevronDown  className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                    : <ChevronRight className="h-2.5 w-2.5 text-muted-foreground shrink-0" />)
                : <span className="inline-block w-2.5 shrink-0" />}
              <span>{item.itemName}</span>
              {soleLabel && (
                <span className="text-[9px] text-muted-foreground">— {soleLabel}</span>
              )}
              {item.brands.length === 1 && item.brands[0].sku && (
                <span className="text-[9px] text-primary">{item.brands[0].sku}</span>
              )}
              {hasMultipleBrands && (
                <span className="text-[9px] text-muted-foreground italic">{item.brands.length} variants</span>
              )}
            </div>
            <div className="text-right w-12 font-medium">
              <StockTooltip
                qty={item.totalQty}
                title={hasMultipleBrands ? 'Stock by Brand' : 'Stock by Warehouse'}
                rows={hasMultipleBrands
                  ? item.brands.map((b) => ({ label: brandOriginText(b.brand, b.country_name) ?? '—', qty: b.qty }))
                  : (warehouseBreakdown.get(item.brands[0]?.brand_variant_id) ?? [])}
              />
            </div>
            <div className="text-right w-20">{fmtVal(item.totalValue)}</div>
          </div>
          {hasMultipleBrands && itemExpanded && renderBrandRows(item.brands, brandIndentPl)}
        </React.Fragment>
      )
    })
  }

  function renderTree(tree: CategoryGroup[], keyPrefix: string) {
    return tree.map((cat) => {
      const catKey = `${keyPrefix}__${cat.categoryName}`
      const catExpanded = expanded.has(catKey)
      const tooltipRows = [
        ...cat.subcategories.map((sc) => ({ label: sc.subcategoryName, qty: sc.totalQty })),
        ...cat.directItems.map((i) => ({ label: i.itemName, qty: i.totalQty })),
      ]
      return (
        <React.Fragment key={catKey}>
          <div
            className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-1.5 bg-muted/20 hover:bg-muted/40 cursor-pointer border-b items-center"
            onClick={() => toggle(catKey)}
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
              {cat.subcategories.map((sc) => {
                const scKey = `${catKey}__sub__${sc.subcategoryName}`
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
              {renderItemRows(cat.directItems, catKey, 'pl-6', 'pl-11')}
            </>
          )}
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

        {showSubGroups
          ? groupedTrees.map((g) => {
              const groupKey = `__sub__${g.subId}`
              const groupExpanded = expanded.has(groupKey)
              return (
                <React.Fragment key={g.subId}>
                  <div
                    className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-2 bg-primary/10 hover:bg-primary/20 cursor-pointer border-b items-center"
                    onClick={() => toggle(groupKey)}
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-primary">
                      {groupExpanded
                        ? <ChevronDown  className="h-3 w-3 shrink-0" />
                        : <ChevronRight className="h-3 w-3 shrink-0" />}
                      <span>{g.subName}</span>
                      <span className="text-[9px] font-normal text-muted-foreground italic">{g.tree.length} categor{g.tree.length === 1 ? 'y' : 'ies'}</span>
                    </div>
                    <div className="text-right w-12 font-semibold text-primary tabular-nums">{g.totalQty}</div>
                    <div className="text-right w-20 font-semibold text-primary tabular-nums">{fmtVal(g.totalValue)}</div>
                  </div>
                  {groupExpanded && renderTree(g.tree, groupKey)}
                </React.Fragment>
              )
            })
          : renderTree(flatTree, '')}
      </div>
    </TooltipProvider>
  )
}
