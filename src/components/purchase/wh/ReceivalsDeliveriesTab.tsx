'use client'

import React, { useState, useMemo } from 'react'
import { Search, Package, Truck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useReceivalsAndDeliveries, ReceivalDelivery } from '@/hooks/useWarehouseOperations'
import { WhReceivalDetailDialog } from './WhReceivalDetailDialog'
import { Warehouse } from '@/hooks/useWarehouses'
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
  currentProfile: any
}

export const ReceivalsDeliveriesTab = React.memo(function ReceivalsDeliveriesTab({ warehouses }: Props) {
  const { data: allItems = [] } = useReceivalsAndDeliveries()
  const [search, setSearch] = useState('')
  const [direction, setDirection] = useState<'all' | 'inbound' | 'outbound'>('all')
  const [warehouseFilter, setWarehouseFilter] = useState('all')
  const [selected, setSelected] = useState<ReceivalDelivery | null>(null)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return allItems.filter((item) => {
      const matchSearch = !q ||
        item.docNumber.toLowerCase().includes(q) ||
        item.reference.toLowerCase().includes(q) ||
        item.counterparty.toLowerCase().includes(q)
      const matchDirection = direction === 'all' || item.direction === direction
      const matchWh = warehouseFilter === 'all' || item.warehouseId === warehouseFilter
      return matchSearch && matchDirection && matchWh
    })
  }, [allItems, search, direction, warehouseFilter])

  const inboundCount = allItems.filter(i => i.direction === 'inbound').length
  const outboundCount = allItems.filter(i => i.direction === 'outbound').length

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="h-8 text-xs pl-8"
            placeholder="Search doc# / ref / party…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={direction} onValueChange={(v) => setDirection(v as 'all' | 'inbound' | 'outbound')}>
          <SelectTrigger className="w-[150px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All ({allItems.length})</SelectItem>
            <SelectItem value="inbound" className="text-xs">Inbound ({inboundCount})</SelectItem>
            <SelectItem value="outbound" className="text-xs">Outbound ({outboundCount})</SelectItem>
          </SelectContent>
        </Select>
        <Select value={warehouseFilter} onValueChange={(v) => setWarehouseFilter(v ?? 'all')}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="All Warehouses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Warehouses</SelectItem>
            {warehouses.map(wh => (
              <SelectItem key={wh.id} value={wh.id} className="text-xs">{wh.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Direction</TableHead>
              <TableHead className="text-xs">Doc #</TableHead>
              <TableHead className="text-xs">Reference</TableHead>
              <TableHead className="text-xs">Warehouse</TableHead>
              <TableHead className="text-xs">Counterparty</TableHead>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs text-right">Items</TableHead>
              <TableHead className="text-xs">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-8">
                  No receivals or deliveries found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((item) => (
                <TableRow
                  key={`${item.direction}-${item.id}`}
                  className="cursor-pointer hover:bg-muted/30"
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
                  <TableCell className="text-xs text-muted-foreground">{item.reference || '—'}</TableCell>
                  <TableCell className="text-xs">{item.warehouseName}</TableCell>
                  <TableCell className="text-xs">{item.counterparty}</TableCell>
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

      <WhReceivalDetailDialog item={selected} onClose={() => setSelected(null)} />
    </div>
  )
})
