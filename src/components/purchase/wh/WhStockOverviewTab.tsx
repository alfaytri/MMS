'use client'

import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { Layers, Package, DollarSign, Search, X, ChevronRight, ChevronDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useWarehouseStock } from '@/hooks/useWarehouseOperations'
import { Warehouse } from '@/hooks/useWarehouses'

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

interface CategoryGroup {
  categoryName: string
  itemType: string | null
  totalQty: number
  totalValue: number
  items: ItemEntry[]
}

// ─── Item-type tab config (mirrors Master Data tabs) ─────────────────────────

const ITEM_TYPE_TABS = [
  { value: '__all__',      label: 'All'                      },
  { value: 'products',     label: 'Products (Installation)'  },
  { value: 'spare-parts',  label: 'Spare Parts (Sales)'      },
  { value: 'consumables',  label: 'Consumables (Internal)'   },
  { value: 'tools',        label: 'Tools & Assets'           },
] as const

// Short label shown in [brackets] on the category row when "All" tab is active
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
        <div className="px-3 py-2 space-y-1.5">
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
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())

  useEffect(() => {
    setSelectedWarehouseId(initialWarehouseId)
  }, [initialWarehouseId])

  // Collapse tree whenever the type tab changes
  useEffect(() => {
    setExpandedCategories(new Set())
    setExpandedItems(new Set())
  }, [activeType])

  const { data: allStock = [] } = useWarehouseStock(selectedWarehouseId)
  const { data: fullStock = [] } = useWarehouseStock() // full data for warehouse tooltip

  // brand_variant_id → [{label, qty}] for brand-level warehouse tooltip
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

  // Step 1: filter by item type tab
  const byType = useMemo(() => {
    if (activeType === '__all__') return allStock
    return allStock.filter((s) => s.item_type === activeType)
  }, [allStock, activeType])

  // Step 2: filter by search
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

  // Step 3: build 3-level tree  category → item → brand
  const tree = useMemo((): CategoryGroup[] => {
    const catMap = new Map<string, { itemType: string | null; itemMap: Map<string, Map<string, BrandEntry>> }>()

    for (const s of filtered) {
      const catKey = s.category_name ?? s.item_name ?? '—'
      if (!catMap.has(catKey)) catMap.set(catKey, { itemType: s.item_type ?? null, itemMap: new Map() })
      const { itemMap } = catMap.get(catKey)!

      if (!itemMap.has(s.item_name)) itemMap.set(s.item_name, new Map())
      const brandMap = itemMap.get(s.item_name)!

      if (!brandMap.has(s.brand_variant_id)) {
        brandMap.set(s.brand_variant_id, {
          brand: s.brand,
          sku: s.sku,
          brand_variant_id: s.brand_variant_id,
          qty: 0,
          avgCost: 0,
          totalValue: 0,
        })
      }
      const entry = brandMap.get(s.brand_variant_id)!
      entry.qty        += s.qty ?? 0
      entry.totalValue += s.total_value ?? 0
    }

    return Array.from(catMap.entries()).map(([categoryName, { itemType, itemMap }]) => {
      const items: ItemEntry[] = Array.from(itemMap.entries()).map(([itemName, brandMap]) => {
        const brands: BrandEntry[] = Array.from(brandMap.values()).map((b) => ({
          ...b,
          avgCost: b.qty > 0 ? b.totalValue / b.qty : 0,
        }))
        return {
          itemName,
          totalQty:   brands.reduce((s, b) => s + b.qty, 0),
          totalValue: brands.reduce((s, b) => s + b.totalValue, 0),
          brands,
        }
      })
      return {
        categoryName,
        itemType,
        totalQty:   items.reduce((s, i) => s + i.totalQty, 0),
        totalValue: items.reduce((s, i) => s + i.totalValue, 0),
        items,
      }
    })
  }, [filtered])

  // Summary card values reflect the active type + search filter
  const totalItems = useMemo(() => tree.reduce((s, c) => s + c.items.length, 0), [tree])
  const totalQty   = useMemo(() => tree.reduce((s, c) => s + c.totalQty, 0), [tree])
  const totalValue = useMemo(() => tree.reduce((s, c) => s + c.totalValue, 0), [tree])

  // Auto-expand all when searching so matches are visible
  useEffect(() => {
    if (!search) return
    setExpandedCategories(new Set(tree.map((g) => g.categoryName)))
    setExpandedItems(new Set(
      tree.flatMap((g) => g.items.map((i) => `${g.categoryName}__${i.itemName}`))
    ))
  }, [search, tree])

  const selectedWarehouse = warehouses.find((w) => w.id === selectedWarehouseId)

  const toggleCategory = useCallback((key: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }, [])

  const toggleItem = useCallback((key: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    setExpandedCategories(new Set(tree.map((g) => g.categoryName)))
    setExpandedItems(new Set(
      tree.flatMap((g) => g.items.map((i) => `${g.categoryName}__${i.itemName}`))
    ))
  }, [tree])

  const collapseAll = useCallback(() => {
    setExpandedCategories(new Set())
    setExpandedItems(new Set())
  }, [])

  const allExpanded =
    tree.length > 0 &&
    expandedCategories.size === tree.length &&
    expandedItems.size === tree.reduce((s, g) => s + g.items.length, 0)

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Summary mini-cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: <Layers   className="h-4 w-4 text-primary" />, label: 'Total Items', value: totalItems.toLocaleString() },
          { icon: <Package  className="h-4 w-4 text-primary" />, label: 'Total Qty',   value: totalQty.toLocaleString()   },
          { icon: <DollarSign className="h-4 w-4 text-success" />, label: 'Total Value', value: `QR ${totalValue.toFixed(2)}` },
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
        <TabsList className="h-8 text-xs">
          {ITEM_TYPE_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="text-xs px-3 h-7">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Controls row */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="h-8 text-xs pl-8"
            placeholder="Search by item, category, brand or SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Select
          value={selectedWarehouseId ?? '__all__'}
          onValueChange={(v) => setSelectedWarehouseId(v === '__all__' ? undefined : (v ?? undefined))}
        >
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="All Warehouses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__" className="text-xs">All Warehouses</SelectItem>
            {warehouses.map((wh) => (
              <SelectItem key={wh.id} value={wh.id} className="text-xs">
                {wh.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedWarehouse && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs border border-primary/20">
            <span>Viewing: {selectedWarehouse.name}</span>
            <Button
              variant="ghost" size="sm"
              className="h-4 w-4 p-0 text-primary hover:bg-transparent"
              onClick={() => setSelectedWarehouseId(undefined)}
              aria-label="Clear warehouse filter"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {tree.length > 0 && (
          <Button
            variant="ghost" size="sm"
            className="h-7 px-2 text-xs text-muted-foreground ml-auto"
            onClick={allExpanded ? collapseAll : expandAll}
          >
            {allExpanded ? 'Collapse all' : 'Expand all'}
          </Button>
        )}
      </div>

      {/* 3-level stock tree */}
      <TooltipProvider delayDuration={150}>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs w-[38%]">Item</TableHead>
                <TableHead className="text-xs">Brand</TableHead>
                <TableHead className="text-xs">SKU</TableHead>
                <TableHead className="text-xs text-right">Stock</TableHead>
                <TableHead className="text-xs text-right">Avg Cost</TableHead>
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
                tree.map((cat) => {
                  const catExpanded = expandedCategories.has(cat.categoryName)
                  return (
                    <React.Fragment key={cat.categoryName}>

                      {/* Level 1 — Category */}
                      <TableRow
                        className="cursor-pointer bg-muted/30 hover:bg-muted/50"
                        onClick={() => toggleCategory(cat.categoryName)}
                      >
                        <TableCell className="text-xs font-bold py-2.5">
                          <div className="flex items-center gap-1.5">
                            {catExpanded
                              ? <ChevronDown  className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                            {cat.categoryName}
                            {/* Show type label in brackets only when "All" tab is active */}
                            {activeType === '__all__' && cat.itemType && TYPE_SHORT_LABEL[cat.itemType] && (
                              <span className="ml-1 text-[10px] font-normal text-muted-foreground border border-border rounded px-1 py-0.5">
                                {TYPE_SHORT_LABEL[cat.itemType]}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground py-2.5">
                          <span className="text-[10px] italic">
                            {cat.items.length} item{cat.items.length !== 1 ? 's' : ''}
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5" />
                        <TableCell className="text-xs text-right font-bold py-2.5">
                          <StockTooltip
                            qty={cat.totalQty}
                            title="Stock by Item"
                            rows={cat.items.map((i) => ({ label: i.itemName, qty: i.totalQty }))}
                          />
                        </TableCell>
                        <TableCell className="py-2.5 text-xs text-right text-muted-foreground">—</TableCell>
                        <TableCell className="text-xs text-right font-bold py-2.5">
                          {cat.totalValue.toFixed(2)}
                        </TableCell>
                      </TableRow>

                      {/* Level 2 — Items */}
                      {catExpanded && cat.items.map((item) => {
                        const itemKey = `${cat.categoryName}__${item.itemName}`
                        const itemExpanded = expandedItems.has(itemKey)
                        return (
                          <React.Fragment key={itemKey}>
                            <TableRow
                              className="cursor-pointer bg-background hover:bg-muted/20"
                              onClick={() => toggleItem(itemKey)}
                            >
                              <TableCell className="text-xs font-semibold py-2 pl-7">
                                <div className="flex items-center gap-1.5">
                                  {itemExpanded
                                    ? <ChevronDown  className="h-3 w-3 text-muted-foreground shrink-0" />
                                    : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
                                  {item.itemName}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground py-2">
                                {item.brands.length === 1
                                  ? (item.brands[0].brand ?? '—')
                                  : <span className="text-[10px] italic">{item.brands.length} brands</span>}
                              </TableCell>
                              <TableCell className="text-xs text-primary py-2">
                                {item.brands.length === 1 ? (item.brands[0].sku ?? '—') : '—'}
                              </TableCell>
                              <TableCell className="text-xs text-right font-semibold py-2">
                                <StockTooltip
                                  qty={item.totalQty}
                                  title="Stock by Brand"
                                  rows={item.brands.map((b) => ({ label: b.brand ?? '—', qty: b.qty }))}
                                />
                              </TableCell>
                              <TableCell className="py-2 text-xs text-right text-muted-foreground">—</TableCell>
                              <TableCell className="text-xs text-right py-2 font-medium">
                                {item.totalValue.toFixed(2)}
                              </TableCell>
                            </TableRow>

                            {/* Level 3 — Brands */}
                            {itemExpanded && item.brands.map((b) => (
                              <TableRow key={b.brand_variant_id} className="bg-muted/5 hover:bg-muted/10">
                                <TableCell className="py-1.5 pl-14 text-xs text-muted-foreground" />
                                <TableCell className="text-xs py-1.5 font-medium">{b.brand ?? '—'}</TableCell>
                                <TableCell className="text-xs py-1.5 text-primary">{b.sku ?? '—'}</TableCell>
                                <TableCell className="text-xs text-right py-1.5 font-medium">
                                  <StockTooltip
                                    qty={b.qty}
                                    title="Stock by Warehouse"
                                    rows={warehouseBreakdown.get(b.brand_variant_id) ?? []}
                                  />
                                </TableCell>
                                <TableCell className="text-xs text-right py-1.5">{b.avgCost.toFixed(2)}</TableCell>
                                <TableCell className="text-xs text-right py-1.5">{b.totalValue.toFixed(2)}</TableCell>
                              </TableRow>
                            ))}
                          </React.Fragment>
                        )
                      })}
                    </React.Fragment>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </TooltipProvider>
    </div>
  )
})
