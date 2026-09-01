'use client'

import { useState, useMemo, Fragment } from 'react'
import { ChevronDown, ChevronUp, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useFifoLayers } from '@/hooks/useInventory'
import { useReceival } from '@/hooks/useReceivals'
import { ReceivalDetailDialog } from '@/components/purchase/ReceivalDetailDialog'
import { useHasPermission } from '@/hooks/usePermissions'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'

// Show the FIFO intake six layers at a time; "See more" reveals the next six.
const PAGE_SIZE = 6

export function FifoLayersTable({ brandVariantId }: { brandVariantId: string }) {
  // Cost gate — the FIFO layer breakdown is entirely cost data. Skip the fetch
  // and show a note when the user can't see inventory pricing.
  const canSeePricing = useHasPermission('inventory.pricing.view')
  const { data: layers = [], isLoading } = useFifoLayers(brandVariantId, canSeePricing)
  const [viewingReceivalId, setViewingReceivalId] = useState<string | null>(null)
  const { data: receivalDetail } = useReceival(viewingReceivalId)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  // Group layers by warehouse -> sub-container, so each becomes a titled section.
  // Same-warehouse (then same-sub-container) layers stay contiguous, groups keep
  // their first-appearance order, and FIFO/date order is preserved within each.
  const orderedLayers = useMemo(() => {
    const whGroups = new Map<string, Map<string, typeof layers>>()
    for (const l of layers) {
      const wh = l.warehouse_name ?? '—'
      const sub = l.sub_container_name ?? '—'
      let subMap = whGroups.get(wh)
      if (!subMap) { subMap = new Map(); whGroups.set(wh, subMap) }
      const g = subMap.get(sub)
      if (g) g.push(l)
      else subMap.set(sub, [l])
    }
    const out: typeof layers = []
    for (const subMap of whGroups.values())
      for (const g of subMap.values())
        out.push(...g)
    return out
  }, [layers])

  // Cost gate — the FIFO layer breakdown is entirely cost data. Show a note when
  // the user can't see inventory pricing. (After the hooks above so hook order
  // stays constant across renders — react-hooks/rules-of-hooks.)
  if (!canSeePricing) {
    return (
      <div className="rounded border border-border bg-muted px-3 py-2 text-[11px] text-muted-foreground">
        You don&apos;t have permission to view cost layers.
      </div>
    )
  }

  const visibleLayers = orderedLayers.slice(0, visibleCount)
  const shownCount = Math.min(visibleCount, layers.length)

  return (
    <>
      <div className="rounded border border-border bg-muted overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted">
              <TableHead className="text-[10px] h-7 font-semibold text-muted-foreground">SOURCE</TableHead>
              <TableHead className="text-[10px] h-7 font-semibold text-muted-foreground">DATE</TableHead>
              <TableHead className="text-[10px] h-7 font-semibold text-muted-foreground text-right">QTY IN</TableHead>
              <TableHead className="text-[10px] h-7 font-semibold text-muted-foreground text-right">REMAINING</TableHead>
              <TableHead className="text-[10px] h-7 font-semibold text-muted-foreground text-right">UNIT COST</TableHead>
              <TableHead className="text-[10px] h-7 font-semibold text-muted-foreground text-right">LANDED</TableHead>
              <TableHead className="text-[10px] h-7 font-semibold text-muted-foreground text-right">TOTAL/UNIT</TableHead>
              <TableHead className="text-[10px] h-7 font-semibold text-muted-foreground w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <>
                {[0, 1, 2].map((i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-3 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-3 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-3 w-10 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-3 w-10 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-3 w-16 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-3 w-12 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-3 w-16 ml-auto" /></TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                ))}
              </>
            )}
            {!isLoading && layers.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-[11px] text-muted-foreground py-4">
                  No cost layers recorded
                </TableCell>
              </TableRow>
            )}
            {!isLoading &&
              visibleLayers.map((layer, index) => {
                const isInventoryReceival = typeof layer.receival_number === 'string' && layer.receival_number.startsWith('INV-')
                const warehouse = layer.warehouse_name ?? '—'
                const subContainer = layer.sub_container_name ?? '—'
                const prevLayer = index > 0 ? visibleLayers[index - 1] : null
                const showWhHeader = index === 0 || (prevLayer?.warehouse_name ?? '—') !== warehouse
                const showSubHeader = showWhHeader || (prevLayer?.sub_container_name ?? '—') !== subContainer
                return (
                  <Fragment key={layer.id}>
                    {showWhHeader && (
                      <TableRow className="bg-muted/70 hover:bg-muted/70 border-t">
                        <TableCell colSpan={8} className="py-1.5 text-[11px] font-semibold text-foreground">
                          {warehouse}
                        </TableCell>
                      </TableRow>
                    )}
                    {showSubHeader && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={8} className="py-1 pl-6 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {subContainer}
                        </TableCell>
                      </TableRow>
                    )}
                  <TableRow
                    className="text-xs animate-in fade-in slide-in-from-top-1 fill-mode-both"
                    style={{ animationDelay: `${(index % PAGE_SIZE) * 30}ms`, animationDuration: '300ms' }}
                  >
                    <TableCell className="font-mono text-[11px] pl-6">
                      {layer.receival_number
                        ? isInventoryReceival
                          ? <span className="text-purple-600 font-semibold">{layer.receival_number}</span>
                          : layer.receival_number
                        : layer.source_type === 'sale_return' ? <span className="text-emerald-600">Sale Return</span>
                        : layer.source_type === 'po_return' ? <span className="text-red-600">PO Return</span>
                        : layer.source_type === 'adjustment' ? <span className="text-amber-600">Adjustment</span>
                        : layer.source_type === 'transfer' ? <span className="text-blue-600">Transfer</span>
                        : layer.source_type === 'delivery_cancel' ? <span className="text-red-600">DEL Cancel</span>
                        : layer.source_type === 'stock_check' ? <span className="text-purple-600">Stock Check</span>
                        : layer.source_type === 'gap_fill' ? <span className="text-muted-foreground">Gap Fill</span>
                        : layer.source_type === 'damaged_repair_return' ? <span className="text-orange-600">Return from Repair</span>
                        : <span className="text-muted-foreground">Manual</span>}
                    </TableCell>
                    <TableCell className="text-[11px]">{formatDate(layer.date)}</TableCell>
                    <TableCell className="text-right text-[11px]">{layer.qty}</TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`text-[11px] font-medium ${layer.remaining_qty > 0 ? 'text-success' : 'text-muted-foreground'}`}
                      >
                        {layer.remaining_qty}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-[11px]">{formatCurrency(layer.unit_cost, 'QAR')}</TableCell>
                    <TableCell className="text-right text-[11px]">
                      {layer.landed_cost_per_unit > 0 ? formatCurrency(layer.landed_cost_per_unit, 'QAR') : '—'}
                    </TableCell>
                    <TableCell className="text-right text-[11px] font-medium">
                      {formatCurrency(layer.total_unit_cost, 'QAR')}
                    </TableCell>
                    <TableCell className="text-right w-10">
                      {layer.receival_id ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => setViewingReceivalId(layer.receival_id)}
                          aria-label="View receival"
                          title="View receival"
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                  </Fragment>
                )
              })}
          </TableBody>
        </Table>
      </div>

      {!isLoading && layers.length > PAGE_SIZE && (
        <div className="mt-1.5 flex items-center justify-center gap-3">
          <span className="text-[10px] text-muted-foreground tabular-nums">
            Showing {shownCount} of {layers.length}
          </span>
          {visibleCount < layers.length && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 min-h-11 md:min-h-0 gap-1 px-2 text-[11px] font-medium text-primary hover:text-primary"
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            >
              See more
              <ChevronDown className="h-3 w-3" />
            </Button>
          )}
          {visibleCount > PAGE_SIZE && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 min-h-11 md:min-h-0 gap-1 px-2 text-[11px] text-muted-foreground"
              onClick={() => setVisibleCount(PAGE_SIZE)}
            >
              Show less
              <ChevronUp className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}

      <ReceivalDetailDialog
        receival={viewingReceivalId ? receivalDetail ?? null : null}
        onClose={() => setViewingReceivalId(null)}
      />
    </>
  )
}
