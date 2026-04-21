'use client'

import React, { useState, useMemo } from 'react'
import { Layers, Package, DollarSign, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useWarehouseStock } from '@/hooks/useWarehouseOperations'
import { Warehouse } from '@/hooks/useWarehouses'

interface Props {
  warehouses: Warehouse[]
}

export const WhStockOverviewTab = React.memo(function WhStockOverviewTab({ warehouses }: Props) {
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'company' | 'warehouse'>('company')

  const { data: allStock = [] } = useWarehouseStock()

  const filtered = useMemo(() => {
    if (!search) return allStock
    const q = search.toLowerCase()
    return allStock.filter((s) =>
      s.item_name?.toLowerCase().includes(q) ||
      (s.brand ?? '').toLowerCase().includes(q) ||
      (s.sku ?? '').toLowerCase().includes(q)
    )
  }, [allStock, search])

  const totalItems = filtered.length
  const totalQty = useMemo(() => filtered.reduce((sum, s) => sum + (s.stock_level ?? 0), 0), [filtered])
  const totalValue = useMemo(() => filtered.reduce((sum, s) => sum + (s.total_value ?? 0), 0), [filtered])

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Summary mini-cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: <Layers className="h-4 w-4 text-primary" />, label: 'Total Items', value: totalItems.toLocaleString() },
          { icon: <Package className="h-4 w-4 text-primary" />, label: 'Total Qty', value: totalQty.toLocaleString() },
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

      {/* Controls */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="h-8 text-xs pl-8"
            placeholder="Search items…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={view} onValueChange={(v) => setView(v as 'company' | 'warehouse')}>
          <SelectTrigger className="w-[150px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="company" className="text-xs">Company Total</SelectItem>
            <SelectItem value="warehouse" className="text-xs">By Warehouse</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Company Total view */}
      {view === 'company' && (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Item</TableHead>
                <TableHead className="text-xs">Brand</TableHead>
                <TableHead className="text-xs">SKU</TableHead>
                <TableHead className="text-xs text-right">Stock</TableHead>
                <TableHead className="text-xs text-right">Avg Cost</TableHead>
                <TableHead className="text-xs text-right">Value (QR)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">
                    No stock data
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((s) => (
                  <TableRow key={s.brand_variant_id}>
                    <TableCell className="text-xs font-medium">{s.item_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.brand ?? '—'}</TableCell>
                    <TableCell className="text-xs text-primary">{s.sku ?? '—'}</TableCell>
                    <TableCell className="text-xs text-right font-medium">{s.stock_level ?? 0}</TableCell>
                    <TableCell className="text-xs text-right">{(s.average_cost ?? 0).toFixed(2)}</TableCell>
                    <TableCell className="text-xs text-right">{(s.total_value ?? 0).toFixed(2)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* By Warehouse view */}
      {view === 'warehouse' && (
        <div className="rounded-md border p-6 text-center">
          <p className="text-xs text-muted-foreground">
            Per-warehouse stock breakdown is not available. Stock data is tracked at company level.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {warehouses.length} warehouse{warehouses.length !== 1 ? 's' : ''} configured.
          </p>
        </div>
      )}
    </div>
  )
})
