'use client'

import React, { useMemo, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { WarehouseIcon, MapPin, User, Package, DollarSign, ArrowRight, ChevronDown, ChevronUp, Boxes, Wrench } from 'lucide-react'
import { Warehouse } from '@/hooks/useWarehouses'
import { WarehouseStockTree } from '@/components/purchase/wh/WarehouseStockTree'
import { WarehouseStockExportButton } from '@/components/purchase/wh/WarehouseStockExportButton'
import { useHasPermission } from '@/hooks/usePermissions'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'

interface Props {
  warehouses: Warehouse[]
  onViewStock?: (warehouseId: string, subContainerId?: string | null) => void
}

const ALL_SUBS = '__all__'

const SEGMENT_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500',
  'bg-violet-500', 'bg-cyan-500', 'bg-orange-500', 'bg-teal-500',
  'bg-indigo-500', 'bg-pink-500', 'bg-lime-500', 'bg-sky-500',
]

export const WhWarehousesTab = React.memo(function WhWarehousesTab({ warehouses, onViewStock }: Props) {
  // Stock value is cost-gated — an inventory user shouldn't see item values.
  const canSeeCost = useHasPermission('warehouse.cost.view')
  const { mainWarehouses, virtualWarehouses } = useMemo(() => {
    const main: Warehouse[] = []
    const virt: Warehouse[] = []
    for (const wh of warehouses) {
      if (wh.is_virtual) virt.push(wh)
      else main.push(wh)
    }
    return { mainWarehouses: main, virtualWarehouses: virt }
  }, [warehouses])

  const totalValue = useMemo(
    () => mainWarehouses.reduce((sum, wh) => sum + (wh.total_value ?? 0), 0),
    [mainWarehouses],
  )

  // Track which warehouse cards have their stock tree expanded
  const [expandedWh, setExpandedWh] = useState<Set<string>>(new Set())
  // Per-card sub-container filter. Missing key = "All"; string = sub_container_id.
  const [selectedSubByWh, setSelectedSubByWh] = useState<Record<string, string>>({})
  // Virtual section starts collapsed; the operator opens it to peek at repair activity
  const [virtualOpen, setVirtualOpen] = useState(false)

  function toggleExpand(id: string) {
    setExpandedWh((prev) => { const n = new Set(prev); if (n.has(id)) { n.delete(id) } else { n.add(id) } return n })
  }

  function setSubForWh(warehouseId: string, subId: string) {
    setSelectedSubByWh((prev) => {
      if (subId === ALL_SUBS) { const { [warehouseId]: _drop, ...rest } = prev; return rest }
      return { ...prev, [warehouseId]: subId }
    })
  }

  function viewStock(warehouseId: string, subContainerId?: string | null) {
    onViewStock?.(warehouseId, subContainerId ?? null)
  }

  if (warehouses.length === 0) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-xs text-muted-foreground text-center">
          No warehouses configured. Add warehouses in Admin Settings.
        </p>
      </div>
    )
  }

  function renderCard(wh: Warehouse, index = 0) {
    const isExpanded = expandedWh.has(wh.id)
    const isVirtual = wh.is_virtual
    const breakdown = wh.sub_container_breakdown ?? []
    const selectedSubId = selectedSubByWh[wh.id] ?? null
    const selectedSub = selectedSubId ? breakdown.find((sc) => sc.sub_container_id === selectedSubId) ?? null : null
    // When a sub is selected, header shows THAT sub's numbers. Otherwise warehouse totals.
    const displayItemCount = selectedSub ? selectedSub.item_count : (wh.item_count ?? 0)
    const displayValue     = selectedSub ? selectedSub.total_value : (wh.total_value ?? 0)
    const hasBreakdown = breakdown.length > 0
    return (
      <Card key={wh.id} className={`hover:shadow-md transition-shadow ${STAGGER_IN}`} style={staggerDelay(index)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            {isVirtual
              ? <Wrench className="h-4 w-4 text-amber-600" />
              : <WarehouseIcon className="h-4 w-4 text-primary" />}
            {wh.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {hasBreakdown ? (
            <div className="flex items-center gap-1.5 text-xs">
              <Boxes className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
              <Select value={selectedSubId ?? ALL_SUBS} onValueChange={(v) => v && setSubForWh(wh.id, v)}>
                <SelectTrigger className="h-7 min-h-0 text-xs px-2 py-0 border-dashed hover:border-solid focus:ring-1 flex-1 w-auto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SUBS} className="text-xs">
                    All sub-containers{breakdown.length > 0 ? ` (${breakdown.length})` : ''}
                  </SelectItem>
                  {breakdown.map((sc) => (
                    <SelectItem key={sc.sub_container_id} value={sc.sub_container_id} className="text-xs">
                      {sc.sub_container_name}
                      {sc.division_name ? <span className="text-muted-foreground"> · {sc.division_name}</span> : null}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : wh.division_name ? (
            <div className="flex items-center gap-1.5 text-xs">
              <Boxes className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
              <span className="font-medium text-foreground">{wh.division_name}</span>
            </div>
          ) : null}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            {wh.location ?? 'No location set'}
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <User className="h-3 w-3 flex-shrink-0" />
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-muted-foreground cursor-help border-b border-dashed border-muted-foreground/40">Warehouse RPs:</span>
                </TooltipTrigger>
                <TooltipContent side="top"><p className="text-xs">Warehouse Responsible Persons</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <span className="font-medium text-foreground truncate">
              {wh.responsible_persons.length > 0
                ? wh.responsible_persons.map((rp: { full_name: string | null }) => rp.full_name ?? 'Unnamed').join(', ')
                : 'Unassigned'}
            </span>
          </div>
          <div className="pt-2 border-t flex justify-between items-center">
            <div className="flex items-center gap-1 text-xs">
              <Package className="h-3.5 w-3.5 text-primary" />
              {displayItemCount.toLocaleString('en-QA')} items
            </div>
            {canSeeCost && (
              <div className="flex items-center gap-1 text-xs">
                <DollarSign className="h-3.5 w-3.5 text-success" />
                QR {displayValue.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            )}
          </div>

          {/* Sub-container breakdown — shown only when "All" is picked AND there's more than one sub */}
          {!selectedSub && breakdown.length > 1 && (
            <div className="space-y-1 pt-1 pl-1 border-l-2 border-primary/20 ml-0.5">
              {breakdown.map((sc) => (
                <div key={sc.sub_container_id} className="flex justify-between items-center gap-2 text-[11px] pl-2">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="text-muted-foreground truncate">{sc.sub_container_name}</span>
                    {sc.division_name && (
                      <span className="flex-shrink-0 rounded-sm bg-muted px-1 py-px text-[9px] font-medium text-muted-foreground/90">
                        {sc.division_name}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2 text-muted-foreground tabular-nums flex-shrink-0">
                    <span>{sc.item_count.toLocaleString('en-QA')} items</span>
                    {canSeeCost && <span className="text-foreground">QR {sc.total_value.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Expand / collapse stock tree */}
          {displayItemCount > 0 && (
            <div className="pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 min-h-11 md:min-h-0 text-xs w-full justify-between gap-1 text-muted-foreground hover:text-foreground"
                onClick={() => toggleExpand(wh.id)}
              >
                <span>{isExpanded ? 'Hide items' : selectedSub ? `Show items in ${selectedSub.sub_container_name}` : 'Show items'}</span>
                {isExpanded
                  ? <ChevronUp   className="h-3 w-3" />
                  : <ChevronDown className="h-3 w-3" />}
              </Button>
              {isExpanded && (
                <div className="mt-2 max-h-[320px] overflow-y-auto rounded-md">
                  <WarehouseStockTree warehouseId={wh.id} warehouses={warehouses} subContainerId={selectedSubId} canSeeCost={canSeeCost} />
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            {/* The export sheet carries stock values — hide it from cost-gated users. */}
            {canSeeCost && displayItemCount > 0 ? (
              <WarehouseStockExportButton
                warehouseId={wh.id}
                warehouseName={wh.name}
                subContainerId={selectedSubId}
              />
            ) : <span />}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 min-h-11 md:min-h-0 text-xs justify-end gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => viewStock(wh.id, selectedSubId)}
            >
              View in Stock Overview
              <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Main warehouses ── */}
      {mainWarehouses.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <WarehouseIcon className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Main Warehouses</h3>
            <span className="text-xs text-muted-foreground">({mainWarehouses.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {mainWarehouses.map((wh, i) => renderCard(wh, i))}
          </div>
        </div>
      )}

      {/* ── Value comparison bar (main warehouses only) — cost-gated ── */}
      {canSeeCost && mainWarehouses.length > 1 && totalValue > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Stock Value by Warehouse</p>
          <TooltipProvider delayDuration={200}>
            <div className="flex h-8 rounded-md overflow-hidden border border-border">
              {mainWarehouses
                .filter((wh) => (wh.total_value ?? 0) > 0)
                .map((wh, idx) => {
                  const pct = totalValue > 0 ? ((wh.total_value ?? 0) / totalValue) * 100 : 0
                  const color = SEGMENT_COLORS[idx % SEGMENT_COLORS.length]
                  return (
                    <Tooltip key={wh.id}>
                      <TooltipTrigger asChild>
                        <button
                          className={`${color} h-full flex items-center justify-center cursor-pointer hover:brightness-110 transition-all overflow-hidden`}
                          style={{ width: `${pct}%`, minWidth: pct > 0 ? '2px' : '0' }}
                          onClick={() => viewStock(wh.id)}
                          aria-label={`View ${wh.name} stock`}
                        >
                          {pct > 8 && (
                            <span className="text-[10px] font-medium text-white px-1 truncate">
                              {wh.name}
                            </span>
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        <p className="font-medium">{wh.name}</p>
                        <p>QR {(wh.total_value ?? 0).toLocaleString('en-QA')} · {(wh.item_count ?? 0).toLocaleString('en-QA')} items</p>
                      </TooltipContent>
                    </Tooltip>
                  )
                })}
            </div>
          </TooltipProvider>
          <div className="flex flex-wrap gap-3">
            {mainWarehouses
              .filter((wh) => (wh.total_value ?? 0) > 0)
              .map((wh, idx) => (
                <div key={wh.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={`w-2.5 h-2.5 rounded-sm inline-block ${SEGMENT_COLORS[idx % SEGMENT_COLORS.length]}`} />
                  {wh.name}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── Virtual warehouses (repair vendors) — collapsible ── */}
      {virtualWarehouses.length > 0 && (
        <div className="space-y-3 pt-2 border-t border-border/60">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 min-h-11 md:min-h-0 -ml-2 gap-2 text-sm font-semibold text-foreground hover:bg-muted/60"
            onClick={() => setVirtualOpen((v) => !v)}
            aria-expanded={virtualOpen}
          >
            <Wrench className="h-4 w-4 text-amber-600" />
            Virtual Warehouses
            <span className="text-xs font-normal text-muted-foreground">({virtualWarehouses.length})</span>
            {virtualOpen
              ? <ChevronUp   className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </Button>
          {!virtualOpen && (
            <p className="text-xs text-muted-foreground pl-6">
              Repair-vendor warehouses. Expand to see items currently sent for repair.
            </p>
          )}
          {virtualOpen && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {virtualWarehouses.map((wh, i) => renderCard(wh, i))}
            </div>
          )}
        </div>
      )}
    </div>
  )
})
