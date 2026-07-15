'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronRight, ChevronDown, Download, Search, ArrowUpDown, ArrowUp, ArrowDown, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/utils/formatters'
import { exportToExcel } from '@/lib/utils/exportToExcel'
import type { DrilldownSO, DrilldownLine } from '@/hooks/useProductProfitability'

export type DrilldownMode = 'revenue' | 'cogs' | 'profit'

type SortKey = 'so_number' | 'customer_name' | 'order_date' | 'revenue' | 'cogs' | 'profit' | 'margin_pct'
type SortDir = 'asc' | 'desc'

const MODE_CONFIG: Record<DrilldownMode, {
  title: string
  defaultSort: SortKey
  metricLabel: string
  metricKey: 'revenue' | 'cogs' | 'profit'
}> = {
  revenue: { title: 'Revenue Breakdown', defaultSort: 'revenue', metricLabel: 'Revenue', metricKey: 'revenue' },
  cogs:    { title: 'COGS Breakdown',    defaultSort: 'cogs',    metricLabel: 'COGS',    metricKey: 'cogs' },
  profit:  { title: 'Gross Profit Breakdown', defaultSort: 'profit', metricLabel: 'Profit', metricKey: 'profit' },
}

type FlatRow = {
  so_number: string
  customer_name: string
  order_date: string
  item_name: string
  sku: string | null
  qty: number
  unit_price: number
  revenue: number
  cogs: number
  profit: number
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: DrilldownMode
  data: DrilldownSO[] | undefined
  isLoading: boolean
  rangeLabel: string
}

export function ProfitabilityDrilldownDialog({
  open, onOpenChange, mode, data, isLoading, rangeLabel,
}: Props) {
  const cfg = MODE_CONFIG[mode]
  const rows = data ?? []
  const showAll = mode === 'profit'

  const [search, setSearch]           = useState('')
  const [productFilter, setProductFilter] = useState('__all__')
  const [customerFilter, setCustomerFilter] = useState('__all__')
  const [sortKey, setSortKey]         = useState<SortKey>(cfg.defaultSort)
  const [sortDir, setSortDir]         = useState<SortDir>('desc')
  const [expanded, setExpanded]       = useState<Set<string>>(new Set())

  const prevModeRef = useRef(mode)
  useEffect(() => {
    if (prevModeRef.current !== mode) {
      prevModeRef.current = mode
      setSortKey(MODE_CONFIG[mode].defaultSort)
      setSortDir('desc')
      setExpanded(new Set())
    }
  }, [mode])

  const products = useMemo(() => {
    const set = new Set<string>()
    rows.forEach((so) => so.lines.forEach((l) => set.add(l.item_name)))
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rows])

  const customers = useMemo(() => {
    const set = new Set<string>()
    rows.forEach((so) => set.add(so.customer_name))
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((so) => {
      if (customerFilter !== '__all__' && so.customer_name !== customerFilter) return false
      if (productFilter !== '__all__') {
        if (!so.lines.some((l) => l.item_name === productFilter)) return false
      }
      if (!q) return true
      return (
        so.so_number.toLowerCase().includes(q) ||
        so.customer_name.toLowerCase().includes(q) ||
        so.lines.some((l) =>
          l.item_name.toLowerCase().includes(q) ||
          (l.sku ?? '').toLowerCase().includes(q)
        )
      )
    })
  }, [rows, search, customerFilter, productFilter])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      const av = a[sortKey as keyof DrilldownSO]
      const bv = b[sortKey as keyof DrilldownSO]
      if (av === null && bv === null) return 0
      if (av === null) return 1
      if (bv === null) return -1
      if (typeof av === 'number' && typeof bv === 'number')
        return sortDir === 'asc' ? av - bv : bv - av
      const cmp = String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [filtered, sortKey, sortDir])

  const totals = useMemo(() => sorted.reduce(
    (acc, so) => ({
      revenue: acc.revenue + so.revenue,
      cogs: acc.cogs + so.cogs,
      profit: acc.profit + so.profit,
      items: acc.items + so.item_count,
    }),
    { revenue: 0, cogs: 0, profit: 0, items: 0 },
  ), [sorted])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir(key === 'so_number' || key === 'customer_name' || key === 'order_date' ? 'asc' : 'desc') }
  }

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handleExport = () => {
    const flat: FlatRow[] = sorted.flatMap((so) =>
      so.lines.map((l) => ({
        so_number: so.so_number, customer_name: so.customer_name, order_date: so.order_date,
        item_name: l.item_name, sku: l.sku, qty: l.qty, unit_price: l.unit_price,
        revenue: l.revenue, cogs: l.cogs, profit: l.profit,
      })),
    )
    const baseCols = [
      { header: 'SO #',       accessor: (r: FlatRow) => r.so_number,     format: 'text' as const },
      { header: 'Customer',   accessor: (r: FlatRow) => r.customer_name, format: 'text' as const },
      { header: 'Date',       accessor: (r: FlatRow) => r.order_date,    format: 'text' as const },
      { header: 'Product',    accessor: (r: FlatRow) => r.item_name,     format: 'text' as const },
      { header: 'SKU',        accessor: (r: FlatRow) => r.sku ?? '',     format: 'text' as const },
      { header: 'Qty',        accessor: (r: FlatRow) => r.qty,           format: 'number' as const },
      { header: 'Unit Price', accessor: (r: FlatRow) => r.unit_price,    format: 'currency' as const },
    ]
    const metricCols =
      mode === 'revenue' ? [{ header: 'Revenue', accessor: (r: FlatRow) => r.revenue, format: 'currency' as const }]
      : mode === 'cogs' ? [{ header: 'COGS', accessor: (r: FlatRow) => r.cogs, format: 'currency' as const }]
      : [
          { header: 'Revenue', accessor: (r: FlatRow) => r.revenue, format: 'currency' as const },
          { header: 'COGS',    accessor: (r: FlatRow) => r.cogs,    format: 'currency' as const },
          { header: 'Profit',  accessor: (r: FlatRow) => r.profit,  format: 'currency' as const },
        ]
    exportToExcel<FlatRow>({
      filename: `${mode}-breakdown-${rangeLabel}`,
      sheetName: cfg.title,
      columns: [...baseCols, ...metricCols],
      rows: flat,
    })
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
  }

  const activeFilters = (search ? 1 : 0) + (productFilter !== '__all__' ? 1 : 0) + (customerFilter !== '__all__' ? 1 : 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-full max-w-full rounded-none md:h-auto md:max-h-[90vh] md:max-w-5xl md:rounded-lg p-0 gap-0 flex flex-col">
        <DialogHeader className="px-4 pt-4 pb-3 border-b shrink-0 sm:px-6">
          <DialogTitle className="text-lg">{cfg.title}</DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sale orders with delivered items &middot; {rangeLabel.replace(/_/g, ' ')}
            {activeFilters > 0 && (
              <span className="ml-2 text-orange-600 font-medium">
                ({activeFilters} filter{activeFilters > 1 ? 's' : ''} active)
              </span>
            )}
          </p>
        </DialogHeader>

        <div className="px-4 py-3 border-b shrink-0 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search SO# / customer / product…"
                className="pl-8 h-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={productFilter} onValueChange={(v) => setProductFilter(v ?? '__all__')}>
              <SelectTrigger className="h-9 w-[200px]">
                <SelectValue placeholder="All products" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All products</SelectItem>
                {products.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={customerFilter} onValueChange={(v) => setCustomerFilter(v ?? '__all__')}>
              <SelectTrigger className="h-9 w-[200px]">
                <SelectValue placeholder="All customers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All customers</SelectItem>
                {customers.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            {activeFilters > 0 && (
              <Button variant="ghost" size="sm" className="h-9 text-xs text-muted-foreground"
                onClick={() => { setSearch(''); setProductFilter('__all__'); setCustomerFilter('__all__') }}>
                <X className="h-3 w-3 mr-1" /> Clear
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-9 ml-auto" onClick={handleExport} disabled={sorted.length === 0}>
              <Download className="h-4 w-4 mr-1.5" /> Export
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-auto min-h-0 px-4 sm:px-6">
          {isLoading ? (
            <div className="space-y-3 py-6">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded" />)}
            </div>
          ) : sorted.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No sale orders match the current filters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead className="w-[110px]">
                    <SortBtn label="SO #" col="so_number" onToggle={toggleSort}><SortIcon col="so_number" /></SortBtn>
                  </TableHead>
                  <TableHead>
                    <SortBtn label="Customer" col="customer_name" onToggle={toggleSort}><SortIcon col="customer_name" /></SortBtn>
                  </TableHead>
                  <TableHead className="hidden md:table-cell w-[100px]">
                    <SortBtn label="Date" col="order_date" onToggle={toggleSort}><SortIcon col="order_date" /></SortBtn>
                  </TableHead>
                  <TableHead className="text-right w-[60px]">Items</TableHead>

                  {/* Revenue mode: only Revenue */}
                  {mode === 'revenue' && (
                    <TableHead className="text-right w-[140px]">
                      <SortBtn label="Revenue" col="revenue" onToggle={toggleSort}><SortIcon col="revenue" /></SortBtn>
                    </TableHead>
                  )}

                  {/* COGS mode: only COGS */}
                  {mode === 'cogs' && (
                    <TableHead className="text-right w-[140px]">
                      <SortBtn label="COGS" col="cogs" onToggle={toggleSort}><SortIcon col="cogs" /></SortBtn>
                    </TableHead>
                  )}

                  {/* Profit mode: Revenue + COGS + Profit + Margin */}
                  {showAll && (
                    <>
                      <TableHead className="text-right w-[120px]">
                        <SortBtn label="Revenue" col="revenue" onToggle={toggleSort}><SortIcon col="revenue" /></SortBtn>
                      </TableHead>
                      <TableHead className="text-right w-[120px]">
                        <SortBtn label="COGS" col="cogs" onToggle={toggleSort}><SortIcon col="cogs" /></SortBtn>
                      </TableHead>
                      <TableHead className="text-right w-[120px]">
                        <SortBtn label="Profit" col="profit" onToggle={toggleSort}><SortIcon col="profit" /></SortBtn>
                      </TableHead>
                      <TableHead className="hidden lg:table-cell text-right w-[90px]">
                        <SortBtn label="Margin" col="margin_pct" onToggle={toggleSort}><SortIcon col="margin_pct" /></SortBtn>
                      </TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((so) => (
                  <SORow key={so.sale_order_id} so={so} isOpen={expanded.has(so.sale_order_id)}
                    onToggle={() => toggleExpand(so.sale_order_id)} mode={mode} />
                ))}
                {/* Totals row */}
                <TableRow className="bg-muted/50 font-semibold border-t-2">
                  <TableCell />
                  <TableCell colSpan={2}>Total ({sorted.length} orders)</TableCell>
                  <TableCell className="hidden md:table-cell" />
                  <TableCell className="text-right tabular-nums">{totals.items}</TableCell>

                  {mode === 'revenue' && (
                    <TableCell className="text-right tabular-nums whitespace-nowrap text-emerald-700">
                      {formatCurrency(totals.revenue, 'QAR')}
                    </TableCell>
                  )}
                  {mode === 'cogs' && (
                    <TableCell className="text-right tabular-nums whitespace-nowrap text-red-600">
                      {formatCurrency(totals.cogs, 'QAR')}
                    </TableCell>
                  )}
                  {showAll && (
                    <>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{formatCurrency(totals.revenue, 'QAR')}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{formatCurrency(totals.cogs, 'QAR')}</TableCell>
                      <TableCell className={cn('text-right tabular-nums whitespace-nowrap', totals.profit >= 0 ? 'text-emerald-700' : 'text-red-600')}>
                        {formatCurrency(totals.profit, 'QAR')}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-right tabular-nums">
                        {totals.revenue === 0 ? '—' : `${((totals.profit / totals.revenue) * 100).toFixed(1)}%`}
                      </TableCell>
                    </>
                  )}
                </TableRow>
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SORow({ so, isOpen, onToggle, mode }: {
  so: DrilldownSO; isOpen: boolean; onToggle: () => void; mode: DrilldownMode
}) {
  const showAll = mode === 'profit'
  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/40 transition-colors" onClick={onToggle}>
        <TableCell className="px-2">
          {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </TableCell>
        <TableCell className="font-mono text-xs whitespace-nowrap">{so.so_number}</TableCell>
        <TableCell>
          <span className="truncate block max-w-[200px]" title={so.customer_name}>{so.customer_name}</span>
        </TableCell>
        <TableCell className="hidden md:table-cell text-xs text-muted-foreground whitespace-nowrap">{so.order_date}</TableCell>
        <TableCell className="text-right tabular-nums">{so.item_count}</TableCell>

        {mode === 'revenue' && (
          <TableCell className="text-right tabular-nums whitespace-nowrap font-semibold text-emerald-700">
            {formatCurrency(so.revenue, 'QAR')}
          </TableCell>
        )}
        {mode === 'cogs' && (
          <TableCell className="text-right tabular-nums whitespace-nowrap font-semibold text-red-600">
            {formatCurrency(so.cogs, 'QAR')}
          </TableCell>
        )}
        {showAll && (
          <>
            <TableCell className="text-right tabular-nums whitespace-nowrap">{formatCurrency(so.revenue, 'QAR')}</TableCell>
            <TableCell className="text-right tabular-nums whitespace-nowrap">{formatCurrency(so.cogs, 'QAR')}</TableCell>
            <TableCell className={cn('text-right tabular-nums whitespace-nowrap font-semibold',
              so.profit >= 0 ? 'text-emerald-700' : 'text-red-600')}>
              {formatCurrency(so.profit, 'QAR')}
            </TableCell>
            <TableCell className={cn('hidden lg:table-cell text-right tabular-nums whitespace-nowrap',
              so.margin_pct === null ? 'text-muted-foreground' : so.margin_pct < 0 ? 'text-red-600' : 'text-emerald-700')}>
              {so.margin_pct === null ? '—' : `${so.margin_pct.toFixed(1)}%`}
            </TableCell>
          </>
        )}
      </TableRow>
      {isOpen && so.lines.map((line, i) => (
        <LineRow key={`${so.sale_order_id}-${line.brand_variant_id}-${i}`} line={line} mode={mode} />
      ))}
    </>
  )
}

function LineRow({ line, mode }: { line: DrilldownLine; mode: DrilldownMode }) {
  const showAll = mode === 'profit'
  return (
    <TableRow className="bg-muted/20 text-xs">
      <TableCell />
      <TableCell className="text-muted-foreground pl-6 whitespace-nowrap">{line.sku ?? '—'}</TableCell>
      <TableCell>
        <span className="truncate block max-w-[200px]" title={line.item_name}>{line.item_name}</span>
      </TableCell>
      <TableCell className="hidden md:table-cell text-muted-foreground whitespace-nowrap">
        {line.qty} × {formatCurrency(line.unit_price, 'QAR')}
      </TableCell>
      <TableCell />

      {mode === 'revenue' && (
        <TableCell className="text-right tabular-nums whitespace-nowrap font-medium text-emerald-700">
          {formatCurrency(line.revenue, 'QAR')}
        </TableCell>
      )}
      {mode === 'cogs' && (
        <TableCell className="text-right tabular-nums whitespace-nowrap font-medium text-red-600">
          {formatCurrency(line.cogs, 'QAR')}
        </TableCell>
      )}
      {showAll && (
        <>
          <TableCell className="text-right tabular-nums whitespace-nowrap">{formatCurrency(line.revenue, 'QAR')}</TableCell>
          <TableCell className="text-right tabular-nums whitespace-nowrap">{formatCurrency(line.cogs, 'QAR')}</TableCell>
          <TableCell className={cn('text-right tabular-nums whitespace-nowrap',
            line.profit >= 0 ? 'text-emerald-700' : 'text-red-600')}>
            {formatCurrency(line.profit, 'QAR')}
          </TableCell>
          <TableCell className="hidden lg:table-cell" />
        </>
      )}
    </TableRow>
  )
}

function SortBtn({ label, col, onToggle, children }: {
  label: string; col: SortKey; onToggle: (k: SortKey) => void; children: React.ReactNode
}) {
  return (
    <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => onToggle(col)}>
      {label} {children}
    </button>
  )
}
