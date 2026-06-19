'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarRange, Eye, Filter, Paperclip, RotateCcw, Search, Tag, X } from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSupplierPayments, type SupplierPayment } from '@/hooks/useSupplierPayments'
import { PoDetailDialog } from '@/components/purchase/PoDetailDialog'
import { AttachBillDialog } from '@/components/purchase/AttachBillDialog'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'

const DEFAULT_CURRENCY = 'QAR'

const METHOD_LABELS: Record<string, string> = {
  bank_transfer:   'Bank Transfer',
  cash:            'Cash',
  cheque:          'Cheque',
  online:          'Online',
  online_transfer: 'Online Transfer',
  pay_later:       'Pay Later',
  fawran:          'Fawran',
  pos:             'POS',
}

// ── Debounce ────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ── Active-filter chip ──────────────────────────────────────────────────

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground shadow-sm">
      {label}
      <button
        type="button"
        onClick={onClear}
        className="-mr-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        aria-label={`Remove ${label} filter`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}

export default function SupplierPaymentsPage() {
  const { data: supplierPayments, isLoading } = useSupplierPayments()

  const [poDetailOpen, setPoDetailOpen]         = useState(false)
  const [selectedPoId, setSelectedPoId]         = useState<string | null>(null)
  const [attachBillOpen, setAttachBillOpen]     = useState(false)
  const [attachPaymentId, setAttachPaymentId]   = useState<string | null>(null)
  const [attachSupplierId, setAttachSupplierId] = useState<string | null>(null)

  // ── Filter state ────────────────────────────────────────────────────
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [paymentIdSearch, setPaymentIdSearch] = useState('')
  const [supplierSearch, setSupplierSearch] = useState('')
  const [refSearch, setRefSearch] = useState('')
  const [methodFilter, setMethodFilter] = useState('')

  const debouncedPaymentId = useDebounce(paymentIdSearch, 200)
  const debouncedSupplier  = useDebounce(supplierSearch, 200)
  const debouncedRef       = useDebounce(refSearch, 200)

  const activeFilterCount = [
    dateFrom, dateTo, debouncedPaymentId, debouncedSupplier, debouncedRef, methodFilter,
  ].filter(Boolean).length

  function handleReset() {
    setDateFrom(''); setDateTo('')
    setPaymentIdSearch(''); setSupplierSearch(''); setRefSearch('')
    setMethodFilter('')
  }

  const filtered = useMemo(() => {
    if (!supplierPayments) return []
    const pid = debouncedPaymentId.trim().toLowerCase()
    const sup = debouncedSupplier.trim().toLowerCase()
    const ref = debouncedRef.trim().toLowerCase()
    return supplierPayments.filter((r) => {
      if (dateFrom && r.date < dateFrom) return false
      if (dateTo && r.date > dateTo) return false
      if (methodFilter && r.method !== methodFilter) return false
      if (pid && !(r.payment_id ?? '').toLowerCase().includes(pid)) return false
      if (ref && !(r.reference ?? '').toLowerCase().includes(ref)) return false
      if (sup && !(r.supplier_name ?? '').toLowerCase().includes(sup)) return false
      return true
    })
  }, [supplierPayments, dateFrom, dateTo, debouncedPaymentId, debouncedSupplier, debouncedRef, methodFilter])

  const columns = useMemo<ColumnDef<SupplierPayment>[]>(() => [
    {
      accessorKey: 'payment_id',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Payment #" />,
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium">
          {row.original.payment_id ?? '—'}
        </span>
      ),
    },
    {
      id: 'supplier',
      header: 'Supplier',
      cell: ({ row }) => row.original.supplier_name ?? '—',
    },
    {
      id: 'po_number',
      header: 'PO #',
      cell: ({ row }) => {
        const po   = row.original.po_number
        const poId = row.original.po_id
        if (!po || !poId) return <span className="text-muted-foreground">—</span>
        return (
          <button
            type="button"
            aria-label={`View PO ${po}`}
            onClick={() => { setSelectedPoId(poId); setPoDetailOpen(true) }}
            className="font-mono text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
          >
            {po}
          </button>
        )
      },
    },
    {
      id: 'bill',
      header: 'Bill #',
      cell: ({ row }) => row.original.invoice_display ?? '—',
    },
    {
      accessorKey: 'amount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
      cell: ({ row }) => formatCurrency(row.original.amount, DEFAULT_CURRENCY),
    },
    {
      accessorKey: 'method',
      header: 'Method',
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs">
          {METHOD_LABELS[row.original.method] ?? row.original.method}
        </Badge>
      ),
    },
    {
      accessorKey: 'date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => formatDate(row.original.date),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const p = row.original
        return (
          <div className="flex items-center gap-1">
            {p.po_id && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label="View purchase order"
                onClick={() => { setSelectedPoId(p.po_id!); setPoDetailOpen(true) }}
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
            )}
            {!p.invoice_id && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label="Attach bill"
                onClick={() => {
                  setAttachPaymentId(p.id)
                  setAttachSupplierId(p.supplier_id ?? null)
                  setAttachBillOpen(true)
                }}
              >
                <Paperclip className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )
      },
    },
  ], [])

  return (
    <PageWrapper>
      <PageHeader title="Supplier Payments" description="Payments recorded against supplier bills and purchase orders" />

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="outline" size="sm"
            onClick={() => setFiltersOpen((v) => !v)}
            className="gap-1.5 h-8"
          >
            <Filter className="h-3.5 w-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <Badge className="h-4 px-1 text-[10px]">{activeFilterCount}</Badge>
            )}
          </Button>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleReset}>
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {filtersOpen && (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden animate-in slide-in-from-top-1 fade-in duration-200 mb-3">
          {activeFilterCount > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/40 px-4 py-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Active</span>
              {paymentIdSearch && <FilterChip label={`Payment: ${paymentIdSearch}`} onClear={() => setPaymentIdSearch('')} />}
              {supplierSearch  && <FilterChip label={`Supplier: ${supplierSearch}`} onClear={() => setSupplierSearch('')} />}
              {refSearch       && <FilterChip label={`Ref: ${refSearch}`} onClear={() => setRefSearch('')} />}
              {dateFrom        && <FilterChip label={`Date ≥ ${dateFrom}`} onClear={() => setDateFrom('')} />}
              {dateTo          && <FilterChip label={`Date ≤ ${dateTo}`} onClear={() => setDateTo('')} />}
              {methodFilter    && <FilterChip label={`Method: ${METHOD_LABELS[methodFilter] ?? methodFilter}`} onClear={() => setMethodFilter('')} />}
              <button
                type="button"
                onClick={handleReset}
                className="ml-auto text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear all
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 p-4">
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Search className="h-3.5 w-3.5" />
                Search
              </div>
              <div className="space-y-2">
                <Input
                  placeholder="Payment number…"
                  value={paymentIdSearch}
                  onChange={(e) => setPaymentIdSearch(e.target.value)}
                  className="h-9"
                  aria-label="Payment number"
                />
                <Input
                  placeholder="Supplier name…"
                  value={supplierSearch}
                  onChange={(e) => setSupplierSearch(e.target.value)}
                  className="h-9"
                  aria-label="Supplier name"
                />
                <Input
                  placeholder="Reference / Txn ID…"
                  value={refSearch}
                  onChange={(e) => setRefSearch(e.target.value)}
                  className="h-9"
                  aria-label="Reference or transaction ID"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <CalendarRange className="h-3.5 w-3.5" />
                Date range
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground mb-1 block">Payment date</label>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="date" aria-label="Date from"
                    value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                    className="h-9 flex-1 min-w-0"
                  />
                  <span className="text-muted-foreground text-xs shrink-0">→</span>
                  <Input
                    type="date" aria-label="Date to"
                    value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                    className="h-9 flex-1 min-w-0"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Tag className="h-3.5 w-3.5" />
                Categorise
              </div>
              <Select value={methodFilter} onValueChange={(v) => setMethodFilter(v ?? '')}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Any method" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any method</SelectItem>
                  {Object.entries(METHOD_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground mb-2">{filtered.length} results</p>

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
      />

      <PoDetailDialog
        open={poDetailOpen}
        onOpenChange={setPoDetailOpen}
        poId={selectedPoId ?? undefined}
      />
      <AttachBillDialog
        open={attachBillOpen}
        onOpenChange={setAttachBillOpen}
        mode="attach-bill"
        paymentId={attachPaymentId ?? undefined}
        supplierId={attachSupplierId}
      />
    </PageWrapper>
  )
}
