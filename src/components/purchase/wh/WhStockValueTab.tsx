'use client'

import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { Search, X, RefreshCw, TrendingUp, ChevronRight, ChevronDown, ChevronLeft, ArrowUpDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useWarehouseStock, type WarehouseStockItem } from '@/hooks/useWarehouseOperations'
import { useWarehouseSubContainers, shortenSubContainerName } from '@/hooks/useWarehouseSubContainers'
import { useStockValueCogsSummary } from '@/hooks/useStockValueCogsSummary'
import { CogsDetailDialog } from './CogsDetailDialog'
import { WarehouseReportButton } from './WarehouseReportButton'
import { Warehouse } from '@/hooks/useWarehouses'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { createClient } from '@/lib/supabase/client'

interface Props {
  warehouses: Warehouse[]
}

interface WarehouseBreakdown {
  warehouseId: string
  warehouseName: string
  subContainerId: string | null
  subContainerName: string | null
  qty: number
  value: number
}

interface MergedRow {
  brand_variant_id: string
  item_name: string
  category_name: string | null
  subcategory_name: string | null
  item_type: string | null
  brand: string | null
  sku: string | null
  totalQty: number
  avgCost: number
  totalValue: number
  cogsSoldQty: number
  cogsTotalCost: number
  cogsLcAdjustmentCount: number
  warehouses: WarehouseBreakdown[]
  latestReceivalAt: string | null
}

type FifoLayerRow = {
  id: string
  receival_number: string | null
  warehouse_id: string | null
  sub_container_id: string | null
  sub_container_name: string | null
  date: string
  qty: number
  remaining_qty: number
  unit_cost: number
  landed_cost_per_unit: number
  total_unit_cost: number
}

const ITEM_TYPE_TABS = [
  { value: '__all__',      label: 'All',            short: 'All'    },
  { value: 'products',     label: 'Products',       short: 'Prod'   },
  { value: 'spare-parts',  label: 'Spare Parts',    short: 'Spare'  },
  { value: 'consumables',  label: 'Consumables',    short: 'Cons'   },
  { value: 'tools',        label: 'Tools & Assets',  short: 'Tools'  },
] as const

type ItemTypeValue = typeof ITEM_TYPE_TABS[number]['value']
type SortField = 'latest_receival' | 'category_name' | 'item_name' | 'brand' | 'qty' | 'avg_cost' | 'total_value' | 'cogs'
type SortDir = 'asc' | 'desc'

function formatCurrency(val: number): string {
  return val.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
}

// D.10 — collapse the flat (warehouse, sub-container) breakdown into a
// grouped structure so the tooltip can render a warehouse header line and
// indent each sub-container row underneath it.
function groupByWarehouse(rows: WarehouseBreakdown[]): Array<{
  warehouseId: string
  warehouseName: string
  totalQty: number
  totalValue: number
  subs: WarehouseBreakdown[]
}> {
  const map = new Map<string, {
    warehouseId: string
    warehouseName: string
    totalQty: number
    totalValue: number
    subs: WarehouseBreakdown[]
  }>()
  for (const r of rows) {
    const existing = map.get(r.warehouseId)
    if (existing) {
      existing.totalQty += r.qty
      existing.totalValue += r.value
      existing.subs.push(r)
    } else {
      map.set(r.warehouseId, {
        warehouseId: r.warehouseId,
        warehouseName: r.warehouseName,
        totalQty: r.qty,
        totalValue: r.value,
        subs: [r],
      })
    }
  }
  return Array.from(map.values())
}

// ── Expandable detail row ────────────────────────────────────────────────────

function FifoDetail({
  brandVariantId,
  warehouseMap,
}: {
  brandVariantId: string
  warehouseMap: Map<string, string>
}) {
  const [sortNewest, setSortNewest] = useState(true)
  const { data: rawLayers = [], isLoading } = useQuery({
    queryKey: [...queryKeys.inventory.fifoLayersByVariant(brandVariantId), 'with-warehouse'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('fifo_cost_layers')
        .select('id, receival_number, warehouse_id, sub_container_id, date, qty, remaining_qty, unit_cost, landed_cost_per_unit, total_unit_cost, warehouse_sub_containers:sub_container_id(name)')
        .eq('brand_variant_id', brandVariantId)
        .order('date', { ascending: true })
        .order('receival_number', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []).map((row) => {
        const { warehouse_sub_containers, ...rest } = row as typeof row & {
          warehouse_sub_containers: { name: string } | null
        }
        return {
          ...rest,
          sub_container_name: warehouse_sub_containers?.name ?? null,
        }
      }) as FifoLayerRow[]
    },
    staleTime: 2 * 60 * 1000,
  })
  const layers = sortNewest ? [...rawLayers].reverse() : rawLayers

  if (isLoading) {
    return (
      <TableRow>
        <TableCell colSpan={8} className="bg-muted/20 py-3">
          <p className="text-xs text-muted-foreground text-center">Loading receival layers…</p>
        </TableCell>
      </TableRow>
    )
  }

  if (layers.length === 0) {
    return (
      <TableRow>
        <TableCell colSpan={8} className="bg-muted/20 py-3">
          <p className="text-xs text-muted-foreground text-center">No FIFO layers found</p>
        </TableCell>
      </TableRow>
    )
  }

  // Group layers by receival_number
  const grouped = new Map<string, FifoLayerRow[]>()
  for (const layer of layers) {
    const key = layer.receival_number ?? 'Opening Stock'
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(layer)
  }

  return (
    <TableRow>
      <TableCell colSpan={8} className="bg-muted/20 p-0">
        <div className="px-6 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Receival Layers ({layers.length})
            </p>
            <button
              type="button"
              onClick={() => setSortNewest((s) => !s)}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowUpDown className="h-3 w-3" />
              {sortNewest ? 'Newest first' : 'Oldest first'}
            </button>
          </div>
          <div className="rounded-md border bg-background overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-[10px] py-1.5">Receival #</TableHead>
                  <TableHead className="text-[10px] py-1.5">Date</TableHead>
                  <TableHead className="text-[10px] py-1.5">Warehouse</TableHead>
                  <TableHead className="text-[10px] text-right py-1.5">Received</TableHead>
                  <TableHead className="text-[10px] text-right py-1.5">Remaining</TableHead>
                  <TableHead className="text-[10px] text-right py-1.5">Unit Cost</TableHead>
                  <TableHead className="text-[10px] text-right py-1.5">LC / Unit</TableHead>
                  <TableHead className="text-[10px] text-right py-1.5">Total Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from(grouped.entries()).map(([receivalNum, groupLayers]) => (
                  <React.Fragment key={receivalNum}>
                    {groupLayers.map((layer, idx) => (
                      <TableRow key={layer.id} className="hover:bg-muted/10">
                        {idx === 0 && (
                          <TableCell
                            className="text-[11px] font-medium py-1.5 text-primary"
                            rowSpan={groupLayers.length}
                          >
                            {receivalNum}
                          </TableCell>
                        )}
                        <TableCell className="text-[11px] py-1.5">{formatDate(layer.date)}</TableCell>
                        <TableCell className="text-[11px] py-1.5">
                          <div className="flex flex-wrap items-center gap-1">
                            <Badge variant="outline" className="text-[9px] font-normal">
                              {warehouseMap.get(layer.warehouse_id ?? '') ?? '—'}
                            </Badge>
                            {layer.sub_container_name && (
                              <Badge variant="outline" className="text-[9px] font-normal text-muted-foreground">
                                {layer.sub_container_name}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-[11px] text-right py-1.5 tabular-nums">{layer.qty}</TableCell>
                        <TableCell className="text-[11px] text-right py-1.5 tabular-nums font-medium">
                          <span className={layer.remaining_qty < layer.qty ? 'text-warning' : ''}>
                            {layer.remaining_qty}
                          </span>
                        </TableCell>
                        <TableCell className="text-[11px] text-right py-1.5 tabular-nums">
                          {formatCurrency(layer.unit_cost)}
                        </TableCell>
                        <TableCell className="text-[11px] text-right py-1.5 tabular-nums">
                          {layer.landed_cost_per_unit > 0 ? (
                            <span className="text-blue-600">{formatCurrency(layer.landed_cost_per_unit)}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-[11px] text-right py-1.5 tabular-nums font-medium">
                          {formatCurrency(layer.total_unit_cost)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </TableCell>
    </TableRow>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export const WhStockValueTab = React.memo(function WhStockValueTab({ warehouses }: Props) {
  const [search, setSearch] = useState('')
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | undefined>(undefined)
  const [selectedSubContainerId, setSelectedSubContainerId] = useState<string | null>(null)
  const { data: subs = [] } = useWarehouseSubContainers(selectedWarehouseId ?? null)
  const activeSubs = useMemo(() => subs.filter((sc) => sc.is_active), [subs])
  useEffect(() => {
    if (!selectedWarehouseId) { setSelectedSubContainerId(null); return }
    if (activeSubs.length === 1) setSelectedSubContainerId(activeSubs[0].id)
    else if (!activeSubs.some((sc) => sc.id === selectedSubContainerId)) setSelectedSubContainerId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWarehouseId, activeSubs.length])
  const [activeType, setActiveType] = useState<ItemTypeValue>('__all__')
  // Default: products with the most recently created receival float to the top.
  const [sortField, setSortField] = useState<SortField>('latest_receival')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [cogsDialog, setCogsDialog] = useState<{
    brandVariantId: string; itemName: string; brand: string | null; sku: string | null
  } | null>(null)

  const queryClient = useQueryClient()

  const { data: allStock = [], isLoading } = useWarehouseStock(selectedWarehouseId, selectedSubContainerId)
  const { data: cogsMap } = useStockValueCogsSummary(null)


  // Per-variant latest receival (created_at of newest FIFO layer) for sort ordering.
  const { data: latestReceivalMap } = useQuery({
    queryKey: [...queryKeys.inventory.fifoLayers, 'latest-by-variant'],
    queryFn: async () => {
      const supabase = createClient()
      // Six-domains H8: cap the read — FIFO layers grow monotonically and
      // this query only needs the latest per variant. Longer-term this should
      // move to a DISTINCT ON view or RPC.
      const { data, error } = await supabase
        .from('fifo_cost_layers')
        .select('brand_variant_id, created_at')
        .order('created_at', { ascending: false })
        .limit(10000)
      if (error) throw error
      const map = new Map<string, string>()
      for (const r of (data ?? []) as { brand_variant_id: string; created_at: string }[]) {
        if (!map.has(r.brand_variant_id)) map.set(r.brand_variant_id, r.created_at)
      }
      return map
    },
    staleTime: 60 * 1000,
  })

  const warehouseMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const wh of warehouses) map.set(wh.id, wh.name)
    return map
  }, [warehouses])

  const toggleRow = useCallback((id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }, [])

  // QUOTA REMEDIATION (2026-06-13): A5 — stock-value-live realtime channel
  // dropped. Stock Value is a report screen; the Refresh button (below) plus
  // React Query's 60s staleTime + remount/navigation refetches cover the
  // update path. (Global QueryProvider disables refetchOnWindowFocus.)

  // ── Filter ─────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let rows: WarehouseStockItem[] = allStock

    if (activeType !== '__all__') {
      rows = rows.filter((r) => r.item_type === activeType)
    }

    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter(
        (r) =>
          r.item_name?.toLowerCase().includes(q) ||
          (r.brand ?? '').toLowerCase().includes(q) ||
          (r.sku ?? '').toLowerCase().includes(q) ||
          (r.category_name ?? '').toLowerCase().includes(q) ||
          (warehouseMap.get(r.warehouse_id) ?? '').toLowerCase().includes(q),
      )
    }

    return rows
  }, [allStock, activeType, search, warehouseMap])

  // ── Merge rows by brand_variant_id ─────────────────────────────────────────

  const merged = useMemo((): MergedRow[] => {
    const map = new Map<string, MergedRow>()

    for (const row of filtered) {
      let entry = map.get(row.brand_variant_id)
      if (!entry) {
        entry = {
          brand_variant_id: row.brand_variant_id,
          item_name: row.item_name,
          category_name: row.category_name,
          subcategory_name: row.subcategory_name,
          item_type: row.item_type,
          brand: row.brand,
          sku: row.sku,
          totalQty: 0,
          avgCost: 0,
          totalValue: 0,
          cogsSoldQty: 0,
          cogsTotalCost: 0,
          cogsLcAdjustmentCount: 0,
          warehouses: [],
          latestReceivalAt: latestReceivalMap?.get(row.brand_variant_id) ?? null,
        }
        map.set(row.brand_variant_id, entry)
      }

      entry.totalQty += row.qty ?? 0
      entry.totalValue += row.total_value ?? 0
      // D.10 — composite (warehouse, sub-container) key so a variant with
      // stock in Maintenance + Kitchen sub-containers of the same warehouse
      // renders as two rows in the tooltip, not one merged bucket.
      const existingWh = entry.warehouses.find(
        (w) => w.warehouseId === row.warehouse_id && w.subContainerId === (row.sub_container_id ?? null),
      )
      if (existingWh) {
        existingWh.qty += row.qty ?? 0
        existingWh.value += row.total_value ?? 0
      } else {
        entry.warehouses.push({
          warehouseId: row.warehouse_id,
          warehouseName: warehouseMap.get(row.warehouse_id) ?? 'Unknown',
          subContainerId: row.sub_container_id ?? null,
          subContainerName: row.sub_container_name ?? null,
          qty: row.qty ?? 0,
          value: row.total_value ?? 0,
        })
      }
    }

    for (const entry of map.values()) {
      entry.avgCost = entry.totalQty > 0 ? entry.totalValue / entry.totalQty : 0
      const cogs = cogsMap?.get(entry.brand_variant_id)
      entry.cogsSoldQty = 0
      entry.cogsTotalCost = (cogs?.sold_at_sale_total ?? 0) + (cogs?.lc_adjustments_total ?? 0)
      entry.cogsLcAdjustmentCount = cogs?.lc_adjustment_count ?? 0
    }

    return Array.from(map.values())
  }, [filtered, warehouseMap, cogsMap, latestReceivalMap])

  // ── Sort ───────────────────────────────────────────────────────────────────

  const sorted = useMemo(() => {
    const rows = [...merged]
    rows.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'latest_receival': {
          // Variants without any receival yet sort to the bottom regardless of dir.
          const aHas = a.latestReceivalAt !== null
          const bHas = b.latestReceivalAt !== null
          if (aHas !== bHas) return aHas ? -1 : 1
          cmp = (a.latestReceivalAt ?? '').localeCompare(b.latestReceivalAt ?? '')
          break
        }
        case 'category_name':
          cmp = (a.category_name ?? '').localeCompare(b.category_name ?? '')
          break
        case 'item_name':
          cmp = (a.item_name ?? '').localeCompare(b.item_name ?? '')
          break
        case 'brand':
          cmp = (a.brand ?? '').localeCompare(b.brand ?? '')
          break
        case 'qty':
          cmp = a.totalQty - b.totalQty
          break
        case 'avg_cost':
          cmp = a.avgCost - b.avgCost
          break
        case 'total_value':
          cmp = a.totalValue - b.totalValue
          break
        case 'cogs':
          cmp = a.cogsTotalCost - b.cogsTotalCost
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return rows
  }, [merged, sortField, sortDir])

  // ── Pagination ─────────────────────────────────────────────────────────────

  const PAGE_SIZE = 25
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))

  useEffect(() => { setPage(1) }, [search, selectedWarehouseId, activeType, sortField, sortDir])

  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return sorted.slice(start, start + PAGE_SIZE)
  }, [sorted, page])

  // ── Summary ────────────────────────────────────────────────────────────────

  const totalQty = useMemo(() => sorted.reduce((s, r) => s + r.totalQty, 0), [sorted])
  const totalValue = useMemo(() => sorted.reduce((s, r) => s + r.totalValue, 0), [sorted])

  // ── Sort handler ───────────────────────────────────────────────────────────

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  function SortIndicator({ field }: { field: SortField }) {
    if (sortField !== field) return null
    return <span className="ml-0.5 text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>
  }

  const selectedWarehouse = warehouses.find((w) => w.id === selectedWarehouseId)

  return (
    <TooltipProvider delayDuration={150}>
      <div className="p-4 md:p-6 space-y-4">
        {/* Summary cards + refresh */}
        <div className="flex items-center justify-between gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
            {[
              { label: 'Unique Items', value: sorted.length.toLocaleString('en-QA') },
              { label: 'Total Qty', value: totalQty.toLocaleString('en-QA') },
              { label: 'Total Value (QR)', value: formatCurrency(totalValue) },
            ].map((card) => (
              <div key={card.label} className="p-3 rounded-md border flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary shrink-0" />
                <div>
                  <p className="text-[10px] text-muted-foreground">{card.label}</p>
                  <p className="text-sm font-semibold">{card.value}</p>
                </div>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1 text-[10px] h-7 min-h-11 md:min-h-0 shrink-0"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseStockAll })
              queryClient.invalidateQueries({ queryKey: queryKeys.inventory.fifoLayers })
              queryClient.invalidateQueries({ queryKey: queryKeys.inventory.cogsEntries })
            }}
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </Button>
        </div>

        {/* Item type tabs */}
        <Tabs value={activeType} onValueChange={(v) => setActiveType(v as ItemTypeValue)}>
          <TabsList className="h-8 min-h-11 md:min-h-0 text-xs max-w-full overflow-x-auto md:overflow-x-visible whitespace-nowrap">
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
              placeholder="Search item, brand, SKU, warehouse…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Select
            value={selectedWarehouseId ?? '__all__'}
            onValueChange={(v) => setSelectedWarehouseId(v === '__all__' ? undefined : (v ?? undefined))}
          >
            <SelectTrigger className="min-w-[180px] h-8 text-xs">
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

          {selectedWarehouseId && activeSubs.length > 1 && (
            <Select
              value={selectedSubContainerId ?? '__all__'}
              onValueChange={(v) => setSelectedSubContainerId(v === '__all__' ? null : (v ?? null))}
            >
              <SelectTrigger className="min-w-[140px] max-w-[180px] h-8 text-xs truncate">
                <SelectValue placeholder="All subs" />
              </SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto">
                <SelectItem value="__all__" className="text-xs">All sub-containers</SelectItem>
                {activeSubs.map((sc) => (
                  <SelectItem key={sc.id} value={sc.id} className="text-xs">
                    {shortenSubContainerName(sc.name, selectedWarehouse?.name)}
                    {sc.division_name && !sc.name.includes(sc.division_name) ? ` — ${sc.division_name}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {selectedWarehouseId && activeSubs.length === 1 && (
            <Badge variant="outline" className="text-[10px] h-8 px-2 flex-shrink-0 gap-1 truncate max-w-[160px]" title={activeSubs[0].name}>
              <span className="truncate">{shortenSubContainerName(activeSubs[0].name, selectedWarehouse?.name)}</span>
              <span className="text-[9px] text-muted-foreground ml-0.5 flex-shrink-0">Auto</span>
            </Badge>
          )}

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

          <WarehouseReportButton reportType="stock-value" label="Report" />

          {/* Sort toggle: newest receival (default) vs A–Z by category */}
          <div className="ml-auto hidden md:flex items-center gap-1">
            <button
              type="button"
              onClick={() => { setSortField('latest_receival'); setSortDir('desc') }}
              className={`inline-flex items-center gap-1 h-7 min-h-11 md:min-h-0 px-2 rounded-md border text-[11px] transition-colors ${
                sortField === 'latest_receival'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background hover:bg-muted'
              }`}
            >
              <ArrowUpDown className="h-3 w-3" />
              Newest receival
            </button>
            <button
              type="button"
              onClick={() => { setSortField('category_name'); setSortDir('asc') }}
              className={`inline-flex items-center gap-1 h-7 min-h-11 md:min-h-0 px-2 rounded-md border text-[11px] transition-colors ${
                sortField === 'category_name'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background hover:bg-muted'
              }`}
            >
              A–Z by category
            </button>
          </div>
        </div>

        {/* ── Mobile card list (< md) ─────────────────────────────────── */}
        <div className="md:hidden space-y-2">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 bg-muted/40 rounded-md animate-pulse" />
              ))}
            </div>
          ) : paged.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-8">
              {search ? 'No items match your search' : 'No stock data'}
            </p>
          ) : paged.map((row) => (
            <button
              key={row.brand_variant_id}
              type="button"
              className="w-full text-left bg-card border rounded-md p-3 min-h-11 active:bg-muted/30 transition-colors"
              onClick={() => toggleRow(row.brand_variant_id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {row.category_name && (
                    <p className="text-[10px] text-muted-foreground truncate">
                      {row.subcategory_name
                        ? `${row.category_name} / ${row.subcategory_name}`
                        : row.category_name}
                    </p>
                  )}
                  <p className="text-xs font-semibold truncate">{row.item_name}</p>
                  {row.brand && (
                    <p className="text-[10px] text-primary truncate">{row.brand}{row.sku ? ` · ${row.sku}` : ''}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  <span className="text-sm font-bold tabular-nums">{row.totalQty}</span>
                  <span className="text-[11px] font-semibold tabular-nums text-primary">{formatCurrency(row.totalValue)}</span>
                </div>
              </div>
              {expandedRows.has(row.brand_variant_id) && (
                <div className="mt-2 pt-2 border-t space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Avg Unit Cost</span>
                    <span className="tabular-nums font-medium">{formatCurrency(row.avgCost)}</span>
                  </div>
                  {row.cogsTotalCost > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">COGS</span>
                      <span className="tabular-nums font-medium text-destructive">{formatCurrency(row.cogsTotalCost)}</span>
                    </div>
                  )}
                  {row.warehouses.length > 1 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {row.warehouses.map((wh) => (
                        <Badge
                          key={`${wh.warehouseId}:${wh.subContainerId ?? 'none'}`}
                          variant="outline"
                          className="text-[9px] font-normal"
                        >
                          {wh.warehouseName}
                          {wh.subContainerName ? ` · ${wh.subContainerName}` : ''}: {wh.qty}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {row.latestReceivalAt && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Latest receival</span>
                      <span className="tabular-nums">{formatDate(row.latestReceivalAt)}</span>
                    </div>
                  )}
                </div>
              )}
            </button>
          ))}
        </div>

        {/* ── Desktop table (md+) ─────────────────────────────────────── */}
        <div className="rounded-md border overflow-x-auto hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs w-[28px]" />
                <TableHead className="text-xs cursor-pointer select-none hidden sm:table-cell" onClick={() => handleSort('category_name')}>
                  Category <SortIndicator field="category_name" />
                </TableHead>
                <TableHead className="text-xs cursor-pointer select-none" onClick={() => handleSort('item_name')}>
                  Item <SortIndicator field="item_name" />
                </TableHead>
                <TableHead className="text-xs cursor-pointer select-none hidden sm:table-cell" onClick={() => handleSort('brand')}>
                  Brand / SKU <SortIndicator field="brand" />
                </TableHead>
                <TableHead className="text-xs text-right cursor-pointer select-none" onClick={() => handleSort('qty')}>
                  Stock <SortIndicator field="qty" />
                </TableHead>
                <TableHead className="text-xs text-right cursor-pointer select-none hidden md:table-cell" onClick={() => handleSort('avg_cost')}>
                  Unit Cost <SortIndicator field="avg_cost" />
                </TableHead>
                <TableHead className="text-xs text-right cursor-pointer select-none" onClick={() => handleSort('total_value')}>
                  Stock Value <SortIndicator field="total_value" />
                </TableHead>
                <TableHead className="text-xs text-right cursor-pointer select-none hidden md:table-cell" onClick={() => handleSort('cogs')}>
                  COGS <SortIndicator field="cogs" />
                </TableHead>
                <TableHead className="text-xs hidden lg:table-cell">Warehouse</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-8">
                    Loading stock data…
                  </TableCell>
                </TableRow>
              ) : paged.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-8">
                    {search ? 'No items match your search' : 'No stock data'}
                  </TableCell>
                </TableRow>
              ) : (
                paged.map((row) => {
                  const isExpanded = expandedRows.has(row.brand_variant_id)
                  return (
                    <React.Fragment key={row.brand_variant_id}>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/30"
                        onClick={() => toggleRow(row.brand_variant_id)}
                      >
                        {/* Expand chevron */}
                        <TableCell className="py-2 w-[28px] pr-0">
                          {isExpanded
                            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                        </TableCell>

                        {/* Category */}
                        <TableCell className="text-xs text-muted-foreground py-2 hidden sm:table-cell">
                          {row.subcategory_name
                            ? `${row.category_name} / ${row.subcategory_name}`
                            : row.category_name ?? '—'}
                        </TableCell>

                        {/* Item */}
                        <TableCell className="text-xs font-medium py-2">{row.item_name}</TableCell>

                        {/* Brand / SKU */}
                        <TableCell className="text-xs py-2 hidden sm:table-cell">
                          <div>{row.brand ?? '—'}</div>
                          {row.sku && <div className="text-[10px] text-primary">{row.sku}</div>}
                        </TableCell>

                        {/* Stock with warehouse tooltip */}
                        <TableCell className="text-xs text-right font-semibold py-2 tabular-nums">
                          {row.warehouses.length > 1 ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-default underline decoration-dashed underline-offset-2">
                                  {row.totalQty}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent
                                side="left"
                                className="bg-popover text-popover-foreground border shadow-md p-0 min-w-[180px]"
                              >
                                <div className="px-3 py-2 border-b">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    Stock by Warehouse
                                  </p>
                                </div>
                                <div className="px-3 py-2 space-y-2">
                                  {groupByWarehouse(row.warehouses).map((wh) => (
                                    <div key={wh.warehouseId} className="space-y-0.5">
                                      <div className="flex items-center justify-between gap-6 text-xs">
                                        <span className="font-medium text-foreground">{wh.warehouseName}</span>
                                        <span className="font-semibold tabular-nums">{wh.totalQty}</span>
                                      </div>
                                      {wh.subs.length > 0 && (wh.subs.length > 1 || wh.subs[0].subContainerId) && wh.subs.map((sub) => (
                                        <div
                                          key={`${wh.warehouseId}:${sub.subContainerId ?? 'none'}`}
                                          className="flex items-center justify-between gap-6 text-[11px] pl-3"
                                        >
                                          <span className="text-muted-foreground truncate">
                                            {sub.subContainerName ?? '— no sub —'}
                                          </span>
                                          <span className="tabular-nums text-muted-foreground">{sub.qty}</span>
                                        </div>
                                      ))}
                                    </div>
                                  ))}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            row.totalQty
                          )}
                        </TableCell>

                        {/* Unit Cost */}
                        <TableCell className="text-xs text-right py-2 tabular-nums hidden md:table-cell">
                          {formatCurrency(row.avgCost)}
                        </TableCell>

                        {/* Stock Value with warehouse tooltip */}
                        <TableCell className="text-xs text-right font-semibold py-2 tabular-nums text-primary">
                          {row.warehouses.length > 1 ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-default underline decoration-dashed underline-offset-2">
                                  {formatCurrency(row.totalValue)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent
                                side="left"
                                className="bg-popover text-popover-foreground border shadow-md p-0 min-w-[200px]"
                              >
                                <div className="px-3 py-2 border-b">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    Value by Warehouse
                                  </p>
                                </div>
                                <div className="px-3 py-2 space-y-2">
                                  {groupByWarehouse(row.warehouses).map((wh) => (
                                    <div key={wh.warehouseId} className="space-y-0.5">
                                      <div className="flex items-center justify-between gap-6 text-xs">
                                        <span className="font-medium text-foreground">{wh.warehouseName}</span>
                                        <span className="font-semibold tabular-nums">QR {formatCurrency(wh.totalValue)}</span>
                                      </div>
                                      {wh.subs.length > 0 && (wh.subs.length > 1 || wh.subs[0].subContainerId) && wh.subs.map((sub) => (
                                        <div
                                          key={`${wh.warehouseId}:${sub.subContainerId ?? 'none'}`}
                                          className="flex items-center justify-between gap-6 text-[11px] pl-3"
                                        >
                                          <span className="text-muted-foreground truncate">
                                            {sub.subContainerName ?? '— no sub —'}
                                          </span>
                                          <span className="tabular-nums text-muted-foreground">QR {formatCurrency(sub.value)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  ))}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            formatCurrency(row.totalValue)
                          )}
                        </TableCell>

                        {/* COGS */}
                        <TableCell className="text-xs text-right py-2 tabular-nums hidden md:table-cell">
                          {row.cogsTotalCost > 0 ? (
                            <span
                              className="cursor-pointer underline decoration-dashed underline-offset-2 text-destructive font-medium hover:text-destructive/80"
                              onClick={(e) => {
                                e.stopPropagation()
                                setCogsDialog({
                                  brandVariantId: row.brand_variant_id,
                                  itemName: row.item_name,
                                  brand: row.brand,
                                  sku: row.sku,
                                })
                              }}
                            >
                              {formatCurrency(row.cogsTotalCost)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        {/* Warehouse badges — two-line stack (warehouse on top,
                            sub-container smaller underneath) so the reader can
                            tell "Birkat · Maintenance" from "Birkat · Kitchen"
                            at a glance without opening the tooltip. */}
                        <TableCell className="text-xs py-2 hidden lg:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {row.warehouses.map((wh) => (
                              <Badge
                                key={`${wh.warehouseId}:${wh.subContainerId ?? 'none'}`}
                                variant="outline"
                                className="text-[10px] font-normal flex flex-col items-start gap-0 py-1 h-auto leading-tight"
                              >
                                <span>{wh.warehouseName}</span>
                                {wh.subContainerName && (
                                  <span className="text-[9px] text-muted-foreground">
                                    {wh.subContainerName}
                                  </span>
                                )}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* Expanded FIFO detail */}
                      {isExpanded && (
                        <FifoDetail
                          brandVariantId={row.brand_variant_id}
                          warehouseMap={warehouseMap}
                        />
                      )}
                    </React.Fragment>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Footer: pagination + totals */}
        {sorted.length > 0 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <span>{sorted.length} item{sorted.length !== 1 ? 's' : ''}</span>

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
              Total: QR {formatCurrency(totalValue)}
            </span>
          </div>
        )}

        {/* COGS detail dialog */}
        {cogsDialog && (
          <CogsDetailDialog
            open={!!cogsDialog}
            onClose={() => setCogsDialog(null)}
            brandVariantId={cogsDialog.brandVariantId}
            itemName={cogsDialog.itemName}
            brand={cogsDialog.brand}
            sku={cogsDialog.sku}
          />
        )}
      </div>
    </TooltipProvider>
  )
})
