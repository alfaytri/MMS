'use client'

import { useState } from 'react'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useWarehouseStock } from '@/hooks/useWarehouseOperations'
import { SearchInput } from '@/components/shared/SearchInput'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/utils/formatters'

export function WhStockOverviewTab() {
  const [warehouseId, setWarehouseId] = useState('')
  const [search, setSearch] = useState('')
  const { data: warehouses } = useWarehouses()
  const { data: stock, isLoading } = useWarehouseStock(warehouseId || undefined)

  const filtered = (stock ?? []).filter((item) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      item.item_name.toLowerCase().includes(q) ||
      (item.sku ?? '').toLowerCase().includes(q) ||
      (item.brand ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <select
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm w-full sm:w-56"
        >
          <option value="">All warehouses (global stock)</option>
          {(warehouses ?? []).map((w: any) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <SearchInput value={search} onChange={setSearch} placeholder="Search item, SKU, brand…" />
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="hidden sm:table-cell">Brand</TableHead>
                <TableHead className="hidden md:table-cell">SKU</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="hidden sm:table-cell text-right">Avg Cost</TableHead>
                <TableHead className="text-right">Total Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No stock items found</TableCell>
                </TableRow>
              ) : (
                filtered.map((item) => (
                  <TableRow key={item.brand_variant_id}>
                    <TableCell className="font-medium text-sm">{item.item_name}</TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{item.brand ?? '—'}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{item.sku ?? '—'}</TableCell>
                    <TableCell className="text-right font-medium">{item.stock_level}</TableCell>
                    <TableCell className="hidden sm:table-cell text-right text-sm">{formatCurrency(item.average_cost, 'QAR')}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(item.total_value, 'QAR')}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
