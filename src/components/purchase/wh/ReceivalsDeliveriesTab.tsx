'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { Search, Package, Truck, ChevronLeft, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useReceivalsAndDeliveries, ReceivalDelivery } from '@/hooks/useWarehouseOperations'
import { shortenSubContainerName, useDivisionScopedVisibility } from '@/hooks/useWarehouseSubContainers'
import { WhReceivalDetailDialog } from './WhReceivalDetailDialog'
import { WarehouseReportButton } from './WarehouseReportButton'
import { Warehouse } from '@/hooks/useWarehouses'
import { Profile } from '@/hooks/useProfiles'
import { format } from 'date-fns'

const STATUS_STYLE: Record<string, string> = {
  approved:         'bg-success/10 text-success',
  delivered:        'bg-success/10 text-success',
  pending:          'bg-warning/10 text-warning',
  pending_approval: 'bg-warning/10 text-warning',
  dispatched:       'bg-primary/10 text-primary',
}

interface Props {
  warehouses: Warehouse[]
  currentProfile: Profile | null
}

export const ReceivalsDeliveriesTab = React.memo(function ReceivalsDeliveriesTab({ warehouses }: Props) {
  const { data: allItems = [] } = useReceivalsAndDeliveries()
  const [search, setSearch] = useState('')
  const [direction, setDirection] = useState<'all' | 'inbound' | 'outbound'>('all')
  const [warehouseFilter, setWarehouseFilter] = useState('all')
  const [selected, setSelected] = useState<ReceivalDelivery | null>(null)
  const divVisible = useDivisionScopedVisibility()

  // Division-scoped: hide docs whose sub-container(s) are outside the view.
  const scopedItems = useMemo(
    () => allItems.filter((item) => item.subContainerIds.length === 0 || item.subContainerIds.some((id) => divVisible(id))),
    [allItems, divVisible],
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return scopedItems.filter((item) => {
      const matchSearch = !q ||
        item.docNumber.toLowerCase().includes(q) ||
        item.reference.toLowerCase().includes(q) ||
        item.counterparty.toLowerCase().includes(q)
      const matchDirection = direction === 'all' || item.direction === direction
      const matchWh = warehouseFilter === 'all' || item.warehouseId === warehouseFilter
      return matchSearch && matchDirection && matchWh
    })
  }, [scopedItems, search, direction, warehouseFilter])

  const [page, setPage] = useState(1)
  const PAGE_SIZE = 25
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  useEffect(() => { setPage(1) }, [search, direction, warehouseFilter])
  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  const inboundCount = scopedItems.filter(i => i.direction === 'inbound').length
  const outboundCount = scopedItems.filter(i => i.direction === 'outbound').length

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="h-8 min-h-11 md:min-h-0 text-xs pl-8"
            placeholder="Search doc# / ref / party…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={direction} onValueChange={(v) => setDirection(v as 'all' | 'inbound' | 'outbound')}>
          <SelectTrigger className="min-w-[150px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-60 overflow-y-auto">
            <SelectItem value="all" className="text-xs">All ({scopedItems.length})</SelectItem>
            <SelectItem value="inbound" className="text-xs">Inbound ({inboundCount})</SelectItem>
            <SelectItem value="outbound" className="text-xs">Outbound ({outboundCount})</SelectItem>
          </SelectContent>
        </Select>
        <Select value={warehouseFilter} onValueChange={(v) => setWarehouseFilter(v ?? 'all')}>
          <SelectTrigger className="min-w-[160px] h-8 text-xs">
            <SelectValue placeholder="All Warehouses" />
          </SelectTrigger>
          <SelectContent className="max-h-60 overflow-y-auto">
            <SelectItem value="all" className="text-xs">All Warehouses</SelectItem>
            {warehouses.map(wh => (
              <SelectItem key={wh.id} value={wh.id} className="text-xs">{wh.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <WarehouseReportButton reportType="receivals-deliveries" label="Report" />
      </div>

      {/* ── Mobile card list (< md) ─────────────────────────────────── */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-8">
            No receivals or deliveries found
          </p>
        ) : paged.map((item) => (
          <button
            key={`${item.direction}-${item.id}`}
            type="button"
            className="w-full text-left bg-card border rounded-md p-3 min-h-11 active:bg-muted/30 transition-colors"
            onClick={() => setSelected(item)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-xs font-semibold truncate">{item.docNumber}</p>
                {item.counterparty && (
                  <p className="text-[11px] text-muted-foreground truncate">{item.counterparty}</p>
                )}
                {item.reference && (
                  <p className="text-[10px] text-primary truncate">{item.reference}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-0.5 shrink-0">
                <span className="text-sm font-bold tabular-nums">{item.itemCount} <span className="text-[10px] font-normal text-muted-foreground">items</span></span>
                <span className="text-[10px] text-muted-foreground">
                  {item.date ? format(new Date(item.date), 'dd MMM') : '—'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-2">
              <Badge className={`text-[10px] px-1.5 py-0 flex items-center gap-1 w-fit ${item.direction === 'inbound' ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
                {item.direction === 'inbound'
                  ? <><Package className="h-2.5 w-2.5" /> Receival</>
                  : <><Truck className="h-2.5 w-2.5" /> Delivery</>}
              </Badge>
              <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_STYLE[item.status] ?? 'bg-muted text-muted-foreground'}`}>
                {item.status.replace(/_/g, ' ')}
              </Badge>
              {item.warehouseName && (
                <span className="text-[10px] text-muted-foreground ml-auto truncate max-w-[120px]">{item.warehouseName}</span>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* ── Desktop table (md+) ───────────────────────────────────── */}
      <div className="rounded-md border overflow-x-auto hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Direction</TableHead>
              <TableHead className="text-xs">Doc #</TableHead>
              <TableHead className="text-xs">Reference</TableHead>
              <TableHead className="text-xs hidden lg:table-cell">Warehouse</TableHead>
              <TableHead className="text-xs hidden xl:table-cell">Sub-container</TableHead>
              <TableHead className="text-xs hidden lg:table-cell">Counterparty</TableHead>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs text-right">Items</TableHead>
              <TableHead className="text-xs">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-8">
                  No receivals or deliveries found
                </TableCell>
              </TableRow>
            ) : (
              paged.map((item, i) => (
                <TableRow
                  key={`${item.direction}-${item.id}`}
                  className={`cursor-pointer hover:bg-muted/30 ${STAGGER_IN}`}
                  style={staggerDelay(i)}
                  onClick={() => setSelected(item)}
                >
                  <TableCell>
                    <Badge className={`text-[10px] px-1.5 py-0 flex items-center gap-1 w-fit ${item.direction === 'inbound' ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
                      {item.direction === 'inbound'
                        ? <><Package className="h-2.5 w-2.5" /> Receival</>
                        : <><Truck className="h-2.5 w-2.5" /> Delivery</>}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-medium">{item.docNumber}</TableCell>
                  <TableCell className="text-xs font-medium text-primary">{item.reference || '—'}</TableCell>
                  <TableCell className="text-xs hidden lg:table-cell">{item.warehouseName}</TableCell>
                  <TableCell className="text-xs hidden xl:table-cell">
                    {(() => {
                      const names = item.subContainerNames ?? []
                      if (names.length === 0) return <span className="text-muted-foreground">—</span>
                      if (names.length === 1) return shortenSubContainerName(names[0], item.warehouseName)
                      return <span title={names.join(', ')}>{names.length} subs</span>
                    })()}
                  </TableCell>
                  <TableCell className="text-xs hidden lg:table-cell">{item.counterparty}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {item.date ? format(new Date(item.date), 'dd MMM yyyy') : '—'}
                  </TableCell>
                  <TableCell className="text-xs text-right">{item.itemCount}</TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_STYLE[item.status] ?? 'bg-muted text-muted-foreground'}`}>
                      {item.status.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {filtered.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>{filtered.length} item{filtered.length !== 1 ? 's' : ''}</span>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-7 w-7 p-0 min-h-11 min-w-11 md:min-h-0 md:min-w-0" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Previous page">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="tabular-nums min-w-[80px] text-center">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0 min-h-11 min-w-11 md:min-h-0 md:min-w-0" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} aria-label="Next page">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <WhReceivalDetailDialog item={selected} onClose={() => setSelected(null)} />
    </div>
  )
})
