'use client'

import { useMemo, useState } from 'react'
import { ArrowUpDown, ArrowDown, ArrowUp, Download, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { formatCurrency } from '@/lib/utils/formatters'
import { exportToExcel } from '@/lib/utils/exportToExcel'
import type { ProductProfitabilityRow } from '@/hooks/useProductProfitability'

type SortKey = 'name' | 'qty' | 'revenue' | 'cogs' | 'profit' | 'margin_pct'
type SortDir = 'asc' | 'desc'

type Props = {
  rows: ProductProfitabilityRow[]
  rangeLabel: string
}

function fmtMargin(v: number | null): string {
  if (v === null || Number.isNaN(v)) return '—'
  return `${v.toFixed(2)}%`
}

export function ProductProfitabilityTable({ rows, rangeLabel }: Props) {
  const [search, setSearch]     = useState('')
  const [brand, setBrand]       = useState<string>('__all__')
  const [sortKey, setSortKey]   = useState<SortKey>('profit')
  const [sortDir, setSortDir]   = useState<SortDir>('desc')

  const brands = useMemo(() => {
    const set = new Set<string>()
    rows.forEach((r) => { if (r.brand_name) set.add(r.brand_name) })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (brand !== '__all__' && r.brand_name !== brand) return false
      if (!q) return true
      return (
        r.name.toLowerCase().includes(q) ||
        (r.sku ?? '').toLowerCase().includes(q)
      )
    })
  }, [rows, search, brand])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (av === null && bv === null) return 0
      if (av === null) return 1
      if (bv === null) return -1
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av
      }
      const cmp = String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [filtered, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'name' ? 'asc' : 'desc')
    }
  }

  const handleExport = () => {
    exportToExcel<ProductProfitabilityRow>({
      filename: `product-profitability-${rangeLabel.replace(/\s+/g, '_')}`,
      sheetName: 'Profitability',
      columns: [
        { header: 'SKU',       accessor: (r) => r.sku ?? '',           format: 'text' },
        { header: 'Product',   accessor: (r) => r.name,                format: 'text' },
        { header: 'Brand',     accessor: (r) => r.brand_name ?? '',    format: 'text' },
        { header: 'Qty',       accessor: (r) => r.qty,                 format: 'number' },
        { header: 'Revenue',   accessor: (r) => r.revenue,             format: 'currency' },
        { header: 'COGS',      accessor: (r) => r.cogs,                format: 'currency' },
        { header: 'Profit',    accessor: (r) => r.profit,              format: 'currency' },
        { header: 'Margin %',  accessor: (r) => r.margin_pct,          format: 'percent' },
      ],
      rows: sorted,
    })
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3" />
      : <ArrowDown className="h-3 w-3" />
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search product or SKU…"
            className="pl-8 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={brand} onValueChange={(v) => setBrand(v ?? '__all__')}>
          <SelectTrigger className="h-9 w-[180px]">
            <SelectValue placeholder="All brands" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All brands</SelectItem>
            {brands.map((b) => (
              <SelectItem key={b} value={b}>{b}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-9" onClick={handleExport} disabled={sorted.length === 0}>
          <Download className="h-4 w-4 mr-1.5" />
          Export
        </Button>
      </div>

      {sorted.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          No products match the current filters.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="hidden md:table-cell w-[120px]">SKU</TableHead>
                <TableHead>
                  <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('name')}>
                    Product <SortIcon col="name" />
                  </button>
                </TableHead>
                <TableHead className="text-right w-[80px]">
                  <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('qty')}>
                    Qty <SortIcon col="qty" />
                  </button>
                </TableHead>
                <TableHead className="text-right w-[120px]">
                  <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('revenue')}>
                    Revenue <SortIcon col="revenue" />
                  </button>
                </TableHead>
                <TableHead className="text-right w-[120px]">
                  <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('cogs')}>
                    COGS <SortIcon col="cogs" />
                  </button>
                </TableHead>
                <TableHead className="text-right w-[120px]">
                  <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('profit')}>
                    Profit <SortIcon col="profit" />
                  </button>
                </TableHead>
                <TableHead className="text-right w-[100px]">
                  <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('margin_pct')}>
                    Margin % <SortIcon col="margin_pct" />
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r, i) => {
                const negative = r.profit < 0
                return (
                  <TableRow
                    key={r.brand_variant_id}
                    className="animate-in fade-in slide-in-from-left-1 fill-mode-both"
                    style={{ animationDelay: `${Math.min(i, 20) * 30}ms`, animationDuration: '350ms' }}
                  >
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground tabular-nums">
                      {r.sku ?? '—'}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium truncate max-w-[280px]" title={r.name}>{r.name}</div>
                      {r.brand_name && (
                        <div className="text-xs text-muted-foreground truncate">{r.brand_name}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.qty}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{formatCurrency(r.revenue, 'QAR')}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground whitespace-nowrap">{formatCurrency(r.cogs, 'QAR')}</TableCell>
                    <TableCell className={cn('text-right tabular-nums font-semibold whitespace-nowrap',
                      negative ? 'text-red-600' : 'text-emerald-700')}>
                      {formatCurrency(r.profit, 'QAR')}
                    </TableCell>
                    <TableCell className={cn('text-right tabular-nums whitespace-nowrap',
                      r.margin_pct === null ? 'text-muted-foreground'
                        : r.margin_pct < 0 ? 'text-red-600 bg-red-50'
                        : 'text-emerald-700')}>
                      {fmtMargin(r.margin_pct)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
