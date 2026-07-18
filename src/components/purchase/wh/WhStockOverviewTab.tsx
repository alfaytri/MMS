'use client'

import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { Layers, Package, DollarSign, Search, X, ChevronRight, ChevronDown, ChevronLeft } from 'lucide-react'
import { WarehouseReportButton } from './WarehouseReportButton'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useWarehouseStock } from '@/hooks/useWarehouseOperations'
import { Warehouse } from '@/hooks/useWarehouses'
import { cn } from '@/lib/utils'

const fmtVal = (n: number) => n.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface Props {
  warehouses: Warehouse[]
  initialWarehouseId?: string
}

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

// ─── Item-type tab config (mirrors Master Data tabs) ─────────────────────────

const ITEM_TYPE_TABS = [
  { value: '__all__',      label: 'All',                      short: 'All'         },
  { value: 'products',     label: 'Products (Installation)',   short: 'Products'    },
  { value: 'spare-parts',  label: 'Spare Parts (Sales)',       short: 'Spare Parts' },
  { value: 'consumables',  label: 'Consumables (Internal)',    short: 'Consumables' },
  { value: 'tools',        label: 'Tools & Assets',            short: 'Tools'       },
] as const

const TYPE_SHORT_LABEL: Record<string, string> = {
  'products':    'Products',
  'spare-parts': 'Spare Parts',
  'consumables': 'Consumables',
  'tools':       'Tools',
}

type ItemTypeValue = typeof ITEM_TYPE_TABS[number]['value']

// ─── Reusable stock tooltip ───────────────────────────────────────────────────

function StockTooltip({
  qty,
  title,
  rows,
}: {
  qty: number
  title: string
  rows: { label: string; qty: number }[]
}) {
  if (rows.length === 0) return <span>{qty}</span>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-default underline decoration-dashed underline-offset-2">
          {qty}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="left"
        className="bg-popover text-popover-foreground border shadow-md p-0 min-w-[200px]"
      >
        <div className="px-3 py-2 border-b">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
        </div>
        <div className="px-3 py-2 space-y-1.5 max-h-[300px] overflow-y-auto">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-6 text-xs">
              <span className="text-muted-foreground">{r.label}</span>
              <span className={`font-semibold tabular-nums ${r.qty > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                {r.qty}
              </span>
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

function addToBrandMap(
  itemMap: Map<string, Map<string, BrandEntry>>,
  itemName: string,
  entry: BrandEntry,
) {
  if (!itemMap.has(itemName)) itemMap.set(itemName, new Map())
  const brandMap = itemMap.get(itemName)!
  if (!brandMap.has(entry.brand_variant_id)) {
    brandMap.set(entry.brand_variant_id, { ...entry })
  } else {
    const existing = brandMap.get(entry.brand_variant_id)!
    existing.qty += entry.qty
    existing.totalValue += entry.totalValue
  }
}

// ─── Collect all expand keys for expand-all ───────────────────────────────────

function collectAllKeys(tree: CategoryGroup[]) {
  const cats = new Set<string>()
  const subs = new Set<string>()
  const items = new Set<string>()
  for (const cat of tree) {
    cats.add(cat.categoryName)
    for (const sc of cat.subcategories) {
      const scKey = `${cat.categoryName}__sub__${sc.subcategoryName}`
      subs.add(scKey)
      for (const item of sc.items) {
        items.add(`${scKey}__${item.itemName}`)
      }
    }
    for (const item of cat.directItems) {
      items.add(`${cat.categoryName}__${item.itemName}`)
    }
  }
  return { cats, subs, items, all: new Set([...cats, ...subs, ...items]) }
}

// ─── Main component ───────────────────────────────────────────────────────────

export const WhStockOverviewTab = React.memo(function WhStockOverviewTab({
  warehouses,
  initialWarehouseId,
}: Props) {
  const [search, setSearch] = useState('')
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | undefined>(
    initialWarehouseId,
  )
  const [activeType, setActiveType] = useState<ItemTypeValue>('__all__')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)

  useEffect(() => {
    setSelectedWarehouseId(initialWarehouseId)
  }, [initialWarehouseId])

  useEffect(() => {
    setExpanded(new Set())
  }, [activeType])

  const { data: allStock = [] } = useWarehouseStock(selectedWarehouseId)
  const { data: fullStock = [] } = useWarehouseStock()

  const warehouseBreakdown = useMemo(() => {
    const map = new Map<string, { label: string; qty: number }[]>()
    for (const item of fullStock) {
      if (!map.has(item.brand_variant_id)) map.set(item.brand_variant_id, [])
      const wh = warehouses.find((w) => w.id === item.warehouse_id)
      map.get(item.brand_variant_id)!.push({
        label: wh?.name ?? 'Unknown Warehouse',
        qty: item.qty,
      })
    }
    return map
  }, [fullStock, warehouses])

  const byType = useMemo(() => {
    if (activeType === '__all__') return allStock
    return allStock.filter((s) => s.item_type === activeType)
  }, [allStock, activeType])

  const filtered = useMemo(() => {
    if (!search) return byType
    const q = search.toLowerCase()
    return byType.filter(
      (s) =>
        s.item_name?.toLowerCase().includes(q) ||
        (s.brand ?? '').toLowerCase().includes(q) ||
        (s.sku ?? '').toLowerCase().includes(q) ||
        (s.category_name ?? '').toLowerCase().includes(q) ||
        (s.subcategory_name ?? '').toLowerCase().includes(q),
    )
  }, [byType, search])

  // Build 4-level tree: category → subcategory → item → brand
  const tree = useMemo((): CategoryGroup[] => {
    const catMap = new Map<string, {
      itemType: string | null
      subMap: Map<string, Map<string, Map<string, BrandEntry>>>
      directItemMap: Map<string, Map<string, BrandEntry>>
    }>()

    for (const s of filtered) {
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
        addToBrandMap(cat.subMap.get(s.subcategory_name)!, s.item_name, brandEntry)
      } else {
        addToBrandMap(cat.directItemMap, s.item_name, brandEntry)
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
  }, [filtered])

  const totalItemCount = useMemo(() => {
    return tree.reduce((s, c) => {
      const subItems = c.subcategories.reduce((ss, sc) => ss + sc.items.length, 0)
      return s + subItems + c.directItems.length
    }, 0)
  }, [tree])
  const totalQty   = useMemo(() => tree.reduce((s, c) => s + c.totalQty, 0), [tree])
  const totalValue = useMemo(() => tree.reduce((s, c) => s + c.totalValue, 0), [tree])

  const PAGE_SIZE = 25
  const totalPages = Math.max(1, Math.ceil(tree.length / PAGE_SIZE))

  useEffect(() => { setPage(1) }, [search, selectedWarehouseId, activeType])

  const pagedTree = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return tree.slice(start, start + PAGE_SIZE)
  }, [tree, page])

  useEffect(() => {
    if (!search) return
    const keys = collectAllKeys(tree)
    setExpanded(keys.all)
  }, [search, tree])

  const selectedWarehouse = warehouses.find((w) => w.id === selectedWarehouseId)

  const toggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    setExpanded(collectAllKeys(tree).all)
  }, [tree])

  const collapseAll = useCallback(() => {
    setExpanded(new Set())
  }, [])

  const allKeys = useMemo(() => collectAllKeys(tree), [tree])
  const allExpanded = tree.length > 0 && expanded.size >= allKeys.all.size

  // ─── Render helpers ──────────────────────────────────────────────────────────

  function renderBrandRows(brands: BrandEntry[], indentClass: string) {
    return brands.map((b) => (
      <TableRow key={b.brand_variant_id} className="bg-muted/5 hover:bg-muted/10">
        <TableCell className={`py-1.5 ${indentClass} text-xs text-muted-foreground`} />
        <TableCell className="text-xs py-1.5 font-medium hidden sm:table-cell">{b.brand ?? '—'}</TableCell>
        <TableCell className="text-xs py-1.5 text-primary hidden sm:table-cell">{b.sku ?? '—'}</TableCell>
        <TableCell className="text-xs text-right py-1.5 font-medium">
          <StockTooltip
            qty={b.qty}
            title="Stock by Warehouse"
            rows={warehouseBreakdown.get(b.brand_variant_id) ?? []}
          />
        </TableCell>
        <TableCell className="text-xs text-right py-1.5 hidden md:table-cell">{fmtVal(b.avgCost)}</TableCell>
        <TableCell className="text-xs text-right py-1.5">{fmtVal(b.totalValue)}</TableCell>
      </TableRow>
    ))
  }

  function renderItemRows(items: ItemEntry[], parentKey: string, indentClass: string, brandIndentClass: string) {
    return items.map((item) => {
      const itemKey = `${parentKey}__${item.itemName}`
      const itemExpanded = expanded.has(itemKey)
      const hasMultipleBrands = item.brands.length > 1
      return (
        <React.Fragment key={itemKey}>
          <TableRow
            className={cn(hasMultipleBrands ? 'cursor-pointer' : '', 'bg-background hover:bg-muted/20')}
            onClick={hasMultipleBrands ? () => toggle(itemKey) : undefined}
          >
            <TableCell className={`text-xs font-semibold py-2 ${indentClass}`}>
              <div className="flex items-center gap-1.5">
                {hasMultipleBrands
                  ? (itemExpanded
                      ? <ChevronDown  className="h-3 w-3 text-muted-foreground shrink-0" />
                      : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />)
                  : <span className="inline-block w-3 shrink-0" />}
                {item.itemName}
              </div>
            </TableCell>
            <TableCell className="text-xs text-muted-foreground py-2 hidden sm:table-cell">
              {item.brands.length === 1
                ? (item.brands[0].brand ?? '—')
                : <span className="text-[10px] italic">{item.brands.length} brands</span>}
            </TableCell>
            <TableCell className="text-xs text-primary py-2 hidden sm:table-cell">
              {item.brands.length === 1 ? (item.brands[0].sku ?? '—') : '—'}
            </TableCell>
            <TableCell className="text-xs text-right font-semibold py-2">
              <StockTooltip
                qty={item.totalQty}
                title={hasMultipleBrands ? 'Stock by Brand' : 'Stock by Warehouse'}
                rows={hasMultipleBrands
                  ? item.brands.map((b) => ({ label: b.brand ?? '—', qty: b.qty }))
                  : (warehouseBreakdown.get(item.brands[0]?.brand_variant_id) ?? [])}
              />
            </TableCell>
            <TableCell className="py-2 text-xs text-right text-muted-foreground hidden md:table-cell">
              {item.brands.length === 1 ? fmtVal(item.brands[0].avgCost) : '—'}
            </TableCell>
            <TableCell className="text-xs text-right py-2 font-medium">
              {fmtVal(item.totalValue)}
            </TableCell>
          </TableRow>
          {hasMultipleBrands && itemExpanded && renderBrandRows(item.brands, brandIndentClass)}
        </React.Fragment>
      )
    })
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Summary mini-cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { icon: <Layers   className="h-4 w-4 text-primary" />, label: 'Total Items', value: totalItemCount.toLocaleString('en-QA') },
          { icon: <Package  className="h-4 w-4 text-primary" />, label: 'Total Qty',   value: totalQty.toLocaleString('en-QA')   },
          { icon: <DollarSign className="h-4 w-4 text-success" />, label: 'Total Value', value: `QR ${fmtVal(totalValue)}` },
        ].map((card) => (
          <div key={card.label} className="p-3 rounded-md border flex items-center gap-2">
            {card.icon}
            <div>
              <p className="text-[10px] text-muted-foreground">{card.label}</p>
              <p className="text-sm font-semibold">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Item-type tabs */}
      <Tabs value={activeType} onValueChange={(v) => setActiveType(v as ItemTypeValue)}>
        <TabsList className="h-8 min-h-11 md:min-h-0 text-xs max-w-full overflow-x-auto whitespace-nowrap">
          {ITEM_TYPE_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="text-xs px-3 h-7 min-h-9 md:min-h-0">
              <span className="md:hidden">{tab.short}</span>
              <span className="hidden md:inline">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Controls row */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="h-8 min-h-11 md:min-h-0 text-xs pl-8"
            placeholder="Search by item, category, brand or SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Select
          value={selectedWarehouseId ?? '__all__'}
          onValueChange={(v) => setSelectedWarehouseId(v === '__all__' ? undefined : (v ?? undefined))}
        >
          <SelectTrigger className="min-w-[140px] max-w-[220px] h-8 text-xs truncate">
            <SelectValue placeholder="All Warehouses" />
          </SelectTrigger>
          <SelectContent className="max-h-60 overflow-y-auto">
            <SelectItem value="__all__" className="text-xs">All Warehouses</SelectItem>
            {warehouses.map((wh) => (
              <SelectItem key={wh.id} value={wh.id} className="text-xs">
                {wh.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedWarehouse && (
          <Button
            variant="ghost" size="sm"
            className="h-7 min-h-11 md:min-h-0 px-2 text-xs text-muted-foreground"
            onClick={() => setSelectedWarehouseId(undefined)}
            aria-label="Clear warehouse filter"
          >
            <X className="h-3 w-3 mr-1" />
            Clear filter
          </Button>
        )}

        <div className="flex items-center gap-1.5 ml-auto">
          {tree.length > 0 && (
            <Button
              variant="ghost" size="sm"
              className="h-7 min-h-11 md:min-h-0 px-2 text-xs text-muted-foreground"
              onClick={allExpanded ? collapseAll : expandAll}
            >
              {allExpanded ? 'Collapse all' : 'Expand all'}
            </Button>
          )}
          <WarehouseReportButton reportType="stock-overview" warehouseId={selectedWarehouseId} label="Report" />
        </div>
      </div>

      {/* ── Mobile card tree (< md) ────────────────────────────────────── */}
      <div className="md:hidden space-y-1.5">
        {tree.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-8">
            {selectedWarehouse ? `No stock in ${selectedWarehouse.name}` : 'No stock data'}
          </p>
        ) : pagedTree.map((cat) => {
          const catExpanded = expanded.has(cat.categoryName)
          return (
            <div key={cat.categoryName} className="rounded-md border overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center gap-2 px-3 py-2.5 bg-muted/30 active:bg-muted/50 min-h-11"
                onClick={() => toggle(cat.categoryName)}
              >
                {catExpanded
                  ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                <span className="font-semibold text-sm truncate flex-1 text-left">{cat.categoryName}</span>
                {activeType === '__all__' && cat.itemType && TYPE_SHORT_LABEL[cat.itemType] && (
                  <span className="text-[10px] text-muted-foreground border border-border rounded px-1 py-0.5 shrink-0">
                    {TYPE_SHORT_LABEL[cat.itemType]}
                  </span>
                )}
                <div className="flex items-center gap-3 shrink-0 ml-1">
                  <span className="text-xs font-bold tabular-nums">{cat.totalQty}</span>
                  <span className="text-xs font-semibold tabular-nums text-muted-foreground">{fmtVal(cat.totalValue)}</span>
                </div>
              </button>

              {catExpanded && (
                <div className="border-t divide-y">
                  {cat.subcategories.map((sc) => {
                    const scKey = `${cat.categoryName}__sub__${sc.subcategoryName}`
                    const scExpanded = expanded.has(scKey)
                    return (
                      <div key={scKey}>
                        <button
                          type="button"
                          className="w-full flex items-center gap-2 pl-7 pr-3 py-2 bg-blue-50/50 dark:bg-blue-950/20 active:bg-blue-50/80 min-h-11"
                          onClick={() => toggle(scKey)}
                        >
                          {scExpanded
                            ? <ChevronDown className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                            : <ChevronRight className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
                          <span className="text-xs font-semibold text-blue-700 dark:text-blue-400 truncate flex-1 text-left">{sc.subcategoryName}</span>
                          <div className="flex items-center gap-3 shrink-0 ml-1">
                            <span className="text-xs font-semibold tabular-nums">{sc.totalQty}</span>
                            <span className="text-xs tabular-nums text-muted-foreground">{fmtVal(sc.totalValue)}</span>
                          </div>
                        </button>
                        {scExpanded && sc.items.map((item) => {
                          const itemKey = `${scKey}__${item.itemName}`
                          const itemExpanded = expanded.has(itemKey)
                          const multi = item.brands.length > 1
                          return (
                            <div key={itemKey}>
                              <button
                                type="button"
                                className={cn('w-full flex items-center gap-2 pl-12 pr-3 py-2 min-h-11', multi ? 'active:bg-muted/20' : 'cursor-default')}
                                onClick={multi ? () => toggle(itemKey) : undefined}
                                disabled={!multi}
                              >
                                {multi
                                  ? (itemExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />)
                                  : <span className="w-3 shrink-0" />}
                                <span className="text-xs font-medium truncate flex-1 text-left">{item.itemName}</span>
                                <div className="flex items-center gap-3 shrink-0 ml-1">
                                  <span className="text-xs font-semibold tabular-nums">{item.totalQty}</span>
                                  <span className="text-xs tabular-nums text-muted-foreground">{fmtVal(item.totalValue)}</span>
                                </div>
                              </button>
                              {multi && itemExpanded && item.brands.map((b) => (
                                <div key={b.brand_variant_id} className="flex items-center gap-2 pl-16 pr-3 py-1.5 bg-muted/5 border-t border-dashed">
                                  <span className="text-[11px] text-muted-foreground truncate flex-1">{b.brand ?? '—'}</span>
                                  <span className="text-[11px] font-medium tabular-nums shrink-0">{b.qty}</span>
                                  <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">{fmtVal(b.totalValue)}</span>
                                </div>
                              ))}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}

                  {cat.directItems.map((item) => {
                    const itemKey = `${cat.categoryName}__${item.itemName}`
                    const itemExpanded = expanded.has(itemKey)
                    const multi = item.brands.length > 1
                    return (
                      <div key={itemKey}>
                        <button
                          type="button"
                          className={cn('w-full flex items-center gap-2 pl-7 pr-3 py-2 min-h-11', multi ? 'active:bg-muted/20' : 'cursor-default')}
                          onClick={multi ? () => toggle(itemKey) : undefined}
                          disabled={!multi}
                        >
                          {multi
                            ? (itemExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />)
                            : <span className="w-3 shrink-0" />}
                          <span className="text-xs font-medium truncate flex-1 text-left">{item.itemName}</span>
                          <div className="flex items-center gap-3 shrink-0 ml-1">
                            <span className="text-xs font-semibold tabular-nums">{item.totalQty}</span>
                            <span className="text-xs tabular-nums text-muted-foreground">{fmtVal(item.totalValue)}</span>
                          </div>
                        </button>
                        {multi && itemExpanded && item.brands.map((b) => (
                          <div key={b.brand_variant_id} className="flex items-center gap-2 pl-12 pr-3 py-1.5 bg-muted/5 border-t border-dashed">
                            <span className="text-[11px] text-muted-foreground truncate flex-1">{b.brand ?? '—'}</span>
                            <span className="text-[11px] font-medium tabular-nums shrink-0">{b.qty}</span>
                            <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">{fmtVal(b.totalValue)}</span>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Desktop table tree (md+) ──────────────────────────────────── */}
      <TooltipProvider delayDuration={150}>
        <div className="rounded-md border overflow-x-auto hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs w-[38%]">Item</TableHead>
                <TableHead className="text-xs hidden sm:table-cell">Brand</TableHead>
                <TableHead className="text-xs hidden sm:table-cell">SKU</TableHead>
                <TableHead className="text-xs text-right">Stock</TableHead>
                <TableHead className="text-xs text-right hidden md:table-cell">Avg Cost</TableHead>
                <TableHead className="text-xs text-right">Value (QR)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tree.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">
                    {selectedWarehouse ? `No stock in ${selectedWarehouse.name}` : 'No stock data'}
                  </TableCell>
                </TableRow>
              ) : (
                pagedTree.map((cat) => {
                  const catExpanded = expanded.has(cat.categoryName)
                  const childCount = cat.subcategories.length + cat.directItems.length
                  const tooltipRows = [
                    ...cat.subcategories.map((sc) => ({ label: sc.subcategoryName, qty: sc.totalQty })),
                    ...cat.directItems.map((i) => ({ label: i.itemName, qty: i.totalQty })),
                  ]
                  return (
                    <React.Fragment key={cat.categoryName}>
                      {/* Level 1 — Category */}
                      <TableRow
                        className="cursor-pointer bg-muted/30 hover:bg-muted/50"
                        onClick={() => toggle(cat.categoryName)}
                      >
                        <TableCell className="text-xs font-bold py-2.5">
                          <div className="flex items-center gap-1.5">
                            {catExpanded
                              ? <ChevronDown  className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                            {cat.categoryName}
                            {activeType === '__all__' && cat.itemType && TYPE_SHORT_LABEL[cat.itemType] && (
                              <span className="ml-1 text-[10px] font-normal text-muted-foreground border border-border rounded px-1 py-0.5">
                                {TYPE_SHORT_LABEL[cat.itemType]}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground py-2.5 hidden sm:table-cell">
                          <span className="text-[10px] italic">
                            {childCount} {cat.subcategories.length > 0 ? 'sub' : 'item'}{childCount !== 1 ? 's' : ''}
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5 hidden sm:table-cell" />
                        <TableCell className="text-xs text-right font-bold py-2.5">
                          <StockTooltip qty={cat.totalQty} title="Stock Breakdown" rows={tooltipRows} />
                        </TableCell>
                        <TableCell className="py-2.5 text-xs text-right text-muted-foreground hidden md:table-cell">—</TableCell>
                        <TableCell className="text-xs text-right font-bold py-2.5">
                          {fmtVal(cat.totalValue)}
                        </TableCell>
                      </TableRow>

                      {catExpanded && (
                        <>
                          {/* Level 2a — Subcategories */}
                          {cat.subcategories.map((sc) => {
                            const scKey = `${cat.categoryName}__sub__${sc.subcategoryName}`
                            const scExpanded = expanded.has(scKey)
                            return (
                              <React.Fragment key={scKey}>
                                <TableRow
                                  className="cursor-pointer bg-blue-50/50 dark:bg-blue-950/20 hover:bg-blue-50/80 dark:hover:bg-blue-950/30"
                                  onClick={() => toggle(scKey)}
                                >
                                  <TableCell className="text-xs font-semibold py-2 pl-7">
                                    <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-400">
                                      {scExpanded
                                        ? <ChevronDown  className="h-3 w-3 shrink-0" />
                                        : <ChevronRight className="h-3 w-3 shrink-0" />}
                                      {sc.subcategoryName}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground py-2 hidden sm:table-cell">
                                    <span className="text-[10px] italic">
                                      {sc.items.length} item{sc.items.length !== 1 ? 's' : ''}
                                    </span>
                                  </TableCell>
                                  <TableCell className="py-2 hidden sm:table-cell" />
                                  <TableCell className="text-xs text-right font-semibold py-2">
                                    <StockTooltip
                                      qty={sc.totalQty}
                                      title="Stock by Item"
                                      rows={sc.items.map((i) => ({ label: i.itemName, qty: i.totalQty }))}
                                    />
                                  </TableCell>
                                  <TableCell className="py-2 text-xs text-right text-muted-foreground hidden md:table-cell">—</TableCell>
                                  <TableCell className="text-xs text-right font-semibold py-2">
                                    {fmtVal(sc.totalValue)}
                                  </TableCell>
                                </TableRow>
                                {scExpanded && renderItemRows(sc.items, scKey, 'pl-12', 'pl-16')}
                              </React.Fragment>
                            )
                          })}

                          {/* Level 2b — Direct items (no subcategory) */}
                          {renderItemRows(cat.directItems, cat.categoryName, 'pl-7', 'pl-14')}
                        </>
                      )}
                    </React.Fragment>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        {tree.length > 0 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <span>{tree.length} categor{tree.length !== 1 ? 'ies' : 'y'}</span>

            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0 min-h-11 min-w-11 md:min-h-0 md:min-w-0"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="tabular-nums min-w-[80px] text-center">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0 min-h-11 min-w-11 md:min-h-0 md:min-w-0"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            <span className="font-semibold text-foreground">
              Total: QR {fmtVal(totalValue)}
            </span>
          </div>
        )}
      </TooltipProvider>
    </div>
  )
})
