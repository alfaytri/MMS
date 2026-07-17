'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarRange, CheckCircle2, CreditCard, FileText, Filter,
  Receipt, RotateCcw, Search, Tag, X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { TlInvoiceCard } from '@/components/orders-invoices/TlInvoiceCard'
import { RegisterTlPaymentDialog } from '@/components/orders-invoices/RegisterTlPaymentDialog'
import { ViewTlPaymentsDialog } from '@/components/orders-invoices/ViewTlPaymentsDialog'
import {
  useTlInvoices, useTlInvoiceSummary,
  type TlInvoice, type TlInvoiceFilters, type TlInvoiceStatus,
} from '@/hooks/useTlInvoices'
import { formatCurrency } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground shadow-sm">
      {label}
      <button type="button" onClick={onClear}
              className="-mr-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label={`Remove ${label} filter`}>
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

const STATUS_CHIPS: { key: TlInvoiceStatus; label: string; icon: React.ElementType; color: string }[] = [
  { key: 'unpaid',  label: 'Unpaid',  icon: FileText,     color: 'bg-muted text-foreground border-border' },
  { key: 'partial', label: 'Partial', icon: CreditCard,   color: 'bg-amber-100 text-amber-700 border-amber-300' },
  { key: 'paid',    label: 'Paid',    icon: CheckCircle2, color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
]

export default function OrdersInvoicesPage() {
  const [activeStatus,   setActiveStatus]   = useState<TlInvoiceStatus | undefined>()
  const [filtersOpen,    setFiltersOpen]    = useState(false)
  const [issuedFrom,     setIssuedFrom]     = useState('')
  const [issuedTo,       setIssuedTo]       = useState('')
  const [invoiceSearch,  setInvoiceSearch]  = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [agent,          setAgent]          = useState('')
  const [sortField,      setSortField]      = useState<'created_at' | 'total_amount'>('created_at')
  const [sortAsc,        setSortAsc]        = useState(false)

  const debouncedInvoice  = useDebounce(invoiceSearch, 250)
  const debouncedCustomer = useDebounce(customerSearch, 250)

  const filters: TlInvoiceFilters = {
    status:         activeStatus,
    invoiceSearch:  debouncedInvoice  || undefined,
    customerSearch: debouncedCustomer || undefined,
    issuedFrom:     issuedFrom || undefined,
    issuedTo:       issuedTo   || undefined,
    agent:          agent && agent !== 'all' ? agent : undefined,
    sortField, sortAsc,
  }

  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useTlInvoices(filters)
  const allInvoices = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data])
  const { data: summary } = useTlInvoiceSummary()
  const statusCounts = summary?.status_counts ?? { unpaid: 0, partial: 0, paid: 0 }
  const outstanding  = summary?.outstanding   ?? 0

  const [paymentsTarget, setPaymentsTarget] = useState<TlInvoice | null>(null)
  const [registerTarget, setRegisterTarget] = useState<TlInvoice | null>(null)

  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!sentinelRef.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage()
      },
      { rootMargin: '200px' },
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const activeFilterCount = [issuedFrom, issuedTo, invoiceSearch, customerSearch, agent].filter(Boolean).length

  const handleReset = () => {
    setActiveStatus(undefined)
    setIssuedFrom(''); setIssuedTo('')
    setInvoiceSearch(''); setCustomerSearch('')
    setAgent('')
  }

  const uniqueAgents = useMemo(() => {
    const s = new Set<string>()
    for (const inv of allInvoices) if (inv.created_by_name) s.add(inv.created_by_name)
    return [...s].sort()
  }, [allInvoices])

  const toggleSort = (field: 'created_at' | 'total_amount') => {
    if (sortField === field) setSortAsc((v) => !v)
    else { setSortField(field); setSortAsc(false) }
  }

  return (
    <PageWrapper>
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold">Orders Invoices</h1>
          <Badge variant="secondary" className="text-sm">
            Outstanding: {formatCurrency(outstanding)}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {STATUS_CHIPS.map((chip) => {
            const Icon = chip.icon
            const count = statusCounts[chip.key] ?? 0
            const isActive = activeStatus === chip.key
            return (
              <button
                key={chip.key}
                onClick={() => setActiveStatus(isActive ? undefined : chip.key)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all min-h-9',
                  isActive ? chip.color : 'bg-card text-muted-foreground border-border hover:bg-muted/50',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {chip.label}
                <span className="font-bold">{count}</span>
              </button>
            )
          })}

          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setFiltersOpen((v) => !v)} className="gap-1.5 h-8">
              <Filter className="h-3.5 w-3.5" />
              Filters
              {activeFilterCount > 0 && <Badge className="h-4 px-1 text-[10px]">{activeFilterCount}</Badge>}
            </Button>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleReset}>
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => toggleSort('created_at')}>
              Date {sortField === 'created_at' ? (sortAsc ? '↑' : '↓') : ''}
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => toggleSort('total_amount')}>
              Amt {sortField === 'total_amount' ? (sortAsc ? '↑' : '↓') : ''}
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{allInvoices.length} results</p>
      </div>

      {filtersOpen && (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden animate-in slide-in-from-top-1 fade-in duration-200">
          {activeFilterCount > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/40 px-4 py-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Active</span>
              {invoiceSearch  && <FilterChip label={`Invoice: ${invoiceSearch}`}   onClear={() => setInvoiceSearch('')} />}
              {customerSearch && <FilterChip label={`Customer: ${customerSearch}`} onClear={() => setCustomerSearch('')} />}
              {issuedFrom     && <FilterChip label={`From ${issuedFrom}`}          onClear={() => setIssuedFrom('')} />}
              {issuedTo       && <FilterChip label={`To ${issuedTo}`}              onClear={() => setIssuedTo('')} />}
              {agent          && <FilterChip label={`By: ${agent === 'all' ? 'Any' : agent}`} onClear={() => setAgent('')} />}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 p-4">
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Search className="h-3.5 w-3.5" /> Search
              </div>
              <Input placeholder="Invoice number…" value={invoiceSearch}
                     onChange={(e) => setInvoiceSearch(e.target.value)} className="h-9" />
              <Input placeholder="Customer name…" value={customerSearch}
                     onChange={(e) => setCustomerSearch(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <CalendarRange className="h-3.5 w-3.5" /> Issued date
              </div>
              <div className="flex items-center gap-1.5">
                <Input type="date" aria-label="From" value={issuedFrom}
                       onChange={(e) => setIssuedFrom(e.target.value)} className="h-9 flex-1 min-w-0" />
                <span className="text-muted-foreground text-xs shrink-0">→</span>
                <Input type="date" aria-label="To" value={issuedTo}
                       onChange={(e) => setIssuedTo(e.target.value)} className="h-9 flex-1 min-w-0" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Tag className="h-3.5 w-3.5" /> Registered by
              </div>
              <Select value={agent} onValueChange={(v) => setAgent(v ?? '')}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Any user" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any user</SelectItem>
                  {uniqueAgents.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading...</p>
      ) : allInvoices.length === 0 ? (
        <div className="py-16 text-center">
          <Receipt className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">No invoices found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {allInvoices.map((inv) => (
            <TlInvoiceCard
              key={inv.id}
              invoice={inv}
              onViewPayments={setPaymentsTarget}
              onRegisterPayment={setRegisterTarget}
            />
          ))}
          <div ref={sentinelRef} className="h-1" />
          {isFetchingNextPage && (
            <p className="text-center text-xs text-muted-foreground py-4">Loading more...</p>
          )}
        </div>
      )}

      <ViewTlPaymentsDialog     open={!!paymentsTarget} onOpenChange={(v) => !v && setPaymentsTarget(null)} invoice={paymentsTarget} />
      <RegisterTlPaymentDialog open={!!registerTarget} onOpenChange={(v) => !v && setRegisterTarget(null)} invoice={registerTarget} />
    </PageWrapper>
  )
}
