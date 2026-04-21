'use client'

import React, { useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useStockMovements, StockMovement } from '@/hooks/useWarehouseOperations'
import { Warehouse } from '@/hooks/useWarehouses'
import { format } from 'date-fns'

const MOVEMENT_STYLES: Record<string, string> = {
  purchase_receival:  'bg-success/10 text-success',
  sale_delivery:      'bg-destructive/10 text-destructive',
  adjustment_in:      'bg-primary/10 text-primary',
  adjustment_out:     'bg-warning/10 text-warning',
  transfer_in:        'bg-accent/10 text-accent-foreground',
  transfer_out:       'bg-secondary text-secondary-foreground',
  damage:             'bg-destructive/10 text-destructive',
  adjustment:         'bg-primary/10 text-primary',
  return:             'bg-primary/10 text-primary',
  sale_return:        'bg-primary/10 text-primary',
}

const MOVEMENT_TYPES = [
  'purchase_receival', 'sale_delivery', 'adjustment_in', 'adjustment_out',
  'transfer_in', 'transfer_out', 'adjustment', 'return', 'sale_return',
]

interface Props {
  warehouses: Warehouse[]
}

export const WhMovementsTab = React.memo(function WhMovementsTab({ warehouses }: Props) {
  const [search, setSearch] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')

  const { data: movements = [] } = useStockMovements({ limit: 200 })

  const warehouseMap = useMemo(() => new Map(warehouses.map(w => [w.id, w.name])), [warehouses])

  const filtered = useMemo(() => {
    return movements.filter((m: StockMovement) => {
      const q = search.toLowerCase()
      const matchSearch = !q ||
        m.item_name?.toLowerCase().includes(q) ||
        m.sku?.toLowerCase().includes(q)
      const matchWh = warehouseFilter === 'all' || m.warehouse_id === warehouseFilter
      const matchType = typeFilter === 'all' || m.movement_type === typeFilter
      return matchSearch && matchWh && matchType
    })
  }, [movements, search, warehouseFilter, typeFilter])

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="h-8 text-xs pl-8"
            placeholder="Search item / SKU…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={warehouseFilter} onValueChange={v => setWarehouseFilter(v ?? 'all')}>
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
        <Select value={typeFilter} onValueChange={v => setTypeFilter(v ?? 'all')}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Types</SelectItem>
            {MOVEMENT_TYPES.map(t => (
              <SelectItem key={t} value={t} className="text-xs capitalize">{t.replace(/_/g, ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs">Item</TableHead>
              <TableHead className="text-xs">SKU</TableHead>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs text-right">Qty</TableHead>
              <TableHead className="text-xs text-right">Unit Cost</TableHead>
              <TableHead className="text-xs text-right">Total</TableHead>
              <TableHead className="text-xs">Warehouse</TableHead>
              <TableHead className="text-xs">Ref</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-8">
                  No movements found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((m: StockMovement) => (
                <TableRow key={m.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {m.created_at ? format(new Date(m.created_at), 'dd MMM yy') : '—'}
                  </TableCell>
                  <TableCell className="text-xs">{m.item_name}</TableCell>
                  <TableCell className="text-xs text-primary">{m.sku ?? '—'}</TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] px-1.5 py-0 capitalize ${MOVEMENT_STYLES[m.movement_type] ?? 'bg-muted text-muted-foreground'}`}>
                      {m.movement_type?.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-right">{m.qty}</TableCell>
                  <TableCell className="text-xs text-right">{m.unit_cost?.toFixed(2) ?? '—'}</TableCell>
                  <TableCell className="text-xs text-right">
                    {m.unit_cost != null && m.qty != null ? (m.unit_cost * m.qty).toFixed(2) : '—'}
                  </TableCell>
                  <TableCell className="text-xs">{warehouseMap.get(m.warehouse_id) ?? '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground truncate max-w-[80px]">
                    {m.reference_type ?? '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
})
