// src/app/(dashboard)/invoices/payments/page.tsx
'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import {
  Banknote, BookOpen, Building2, CalendarRange, CheckCircle2, Clock,
  CreditCard, FileText, Filter, QrCode, Receipt,
  RotateCcw, Search, Smartphone, Tag, X, XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { PaymentCard } from '@/components/invoices/PaymentCard'
import {
  usePayments, usePaymentSummary, useBulkQbSyncPayments,
  type PaymentFilters,
} from '@/hooks/usePayments'
import { formatCurrency } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

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

// ── Debounce ────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ── Status chips ────────────────────────────────────────────────────────

const STATUS_CHIPS = [
  { key: 'completed',  label: 'Completed',  icon: CheckCircle2, color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  { key: 'pending',    label: 'Pending',    icon: Clock,        color: 'bg-amber-100 text-amber-700 border-amber-300' },
  { key: 'processing', label: 'Processing', icon: Clock,        color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { key: 'failed',     label: 'Failed',     icon: XCircle,      color: 'bg-red-100 text-red-700 border-red-300' },
] as const

// ── Method breakdown config ─────────────────────────────────────────────

const METHOD_CHIPS = [
  { key: 'cash',          label: 'Cash',          icon: Banknote,   color: 'ring-emerald-400' },
  { key: 'bank_transfer', label: 'Bank Transfer', icon: Building2,  color: 'ring-blue-400' },
  { key: 'pdc',           label: 'PDC',           icon: FileText,   color: 'ring-purple-400' },
  { key: 'cdc',           label: 'CDC',           icon: FileText,   color: 'ring-purple-400' },
  { key: 'online',        label: 'Online',        icon: Smartphone, color: 'ring-blue-400' },
  { key: 'fawran',        label: 'Fawran',        icon: QrCode,     color: 'ring-emerald-400' },
  { key: 'pos',           label: 'POS',           icon: CreditCard, color: 'ring-amber-400' },
  { key: 'pay_later',     label: 'Pay Later',     icon: Clock,      color: 'ring-amber-400' },
] as const

export default function ViewPaymentsPage() {
  // ── Filter state ────────────────────────────────────────────────────
  const [activeStatus, setActiveStatus] = useState<string | undefined>()
  const [activeMethod, setActiveMethod] = useState<string | undefined>()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [invoiceSearch, setInvoiceSearch] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [refSearch, setRefSearch] = useState('')
  const [methodFilter, setMethodFilter] = useState('')
  const [agent, setAgent] = useState('')
  const [sortField, setSortField] = useState<'date' | 'amount'>('date')
  const [sortAsc, setSortAsc] = useState(false)

  const debouncedInvoice = useDebounce(invoiceSearch, 250)
  const debouncedCustomer = useDebounce(customerSearch, 250)
  const debouncedRef = useDebounce(refSearch, 250)

  const filters: PaymentFilters = {
    status: activeStatus,
    method: (activeMethod ?? methodFilter) || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    invoiceSearch: debouncedInvoice || undefined,
    customerSearch: debouncedCustomer || undefined,
    refSearch: debouncedRef || undefined,
    agent: agent || undefined,
    sortField,
    sortAsc,
  }

  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    usePayments(filters)

  const allPayments = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data]
  )

  // ── Server-side aggregates ──────────────────────────────────────────
  const { data: summary } = usePaymentSummary()
  const statusCounts = summary?.status_counts ?? {}
  const collected = summary?.collected ?? 0
  const methodTotals = summary?.method_totals ?? {}

  // ── Selection ───────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [qbDialogOpen, setQbDialogOpen] = useState(false)
  const bulkSync = useBulkQbSyncPayments()

  const selectablePayments = useMemo(
    () => allPayments.filter((p) => !p.qb_synced && p.status !== 'failed'),
    [allPayments]
  )

  const handleSelectAll = (checked: boolean) => {
    setSelected(checked ? new Set(selectablePayments.map((p) => p.id)) : new Set())
  }
  const handleSelect = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id); else next.delete(id)
      return next
    })
  }
  const handleQbSync = async () => {
    try {
      await bulkSync.mutateAsync([...selected])
      toast.success(`${selected.size} payment(s) synced to QuickBooks`)
      setSelected(new Set())
      setQbDialogOpen(false)
    } catch {
      toast.error('QB sync failed')
    }
  }

  // ── Infinite scroll ─────────────────────────────────────────────────
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!sentinelRef.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { rootMargin: '200px' }
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // ── Helpers ─────────────────────────────────────────────────────────
  const activeFilterCount = [
    dateFrom, dateTo, invoiceSearch, customerSearch, refSearch, methodFilter, agent,
  ].filter(Boolean).length

  const handleReset = () => {
    setActiveStatus(undefined)
    setActiveMethod(undefined)
    setDateFrom(''); setDateTo('')
    setInvoiceSearch(''); setCustomerSearch(''); setRefSearch('')
    setMethodFilter(''); setAgent('')
    setFiltersOpen(false)
  }

  const uniqueAgents = useMemo(() => {
    const agents = new Set<string>()
    for (const p of allPayments) { if (p.agent_name) agents.add(p.agent_name) }
    return [...agents].sort()
  }, [allPayments])

  const toggleSort = (field: 'date' | 'amount') => {
    if (sortField === field) setSortAsc((v) => !v)
    else { setSortField(field); setSortAsc(false) }
  }

  // ── Method bar scroll fade ──────────────────────────────────────────
  const methodScrollRef = useRef<HTMLDivElement>(null)
  const [showFade, setShowFade] = useState(true)
  useEffect(() => {
    const el = methodScrollRef.current
    if (!el) return
    const handleScroll = () => {
      setShowFade(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
    }
    handleScroll()
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [allPayments])

  const formatK = (v: number) =>
    v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toFixed(0)

  return (
    <PageWrapper>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl 2xl:text-3xl font-bold">Payments</h1>
          <Badge variant="secondary" className="text-sm">
            Collected: {formatCurrency(collected)}
          </Badge>
        </div>

        {/* Status chips */}
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
                  isActive ? chip.color : 'bg-card text-muted-foreground border-border hover:bg-muted/50'
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {chip.label}
                <span className="font-bold">{count}</span>
              </button>
            )
          })}

          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setFiltersOpen((v) => !v)} className="gap-1.5 h-8">
              <Filter className="h-3.5 w-3.5" /> Filters
              {activeFilterCount > 0 && <Badge className="h-4 px-1 text-[10px]">{activeFilterCount}</Badge>}
            </Button>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleReset}>
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => toggleSort('date')}>
              Date {sortField === 'date' ? (sortAsc ? '↑' : '↓') : ''}
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => toggleSort('amount')}>
              Amt {sortField === 'amount' ? (sortAsc ? '↑' : '↓') : ''}
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{allPayments.length} results</p>
      </div>

      {/* ── Method Breakdown Bar ───────────────────────────────────── */}
      {allPayments.length > 0 && (
        <div className="relative">
          <div
            ref={methodScrollRef}
            className="flex gap-2 overflow-x-auto pb-1 scrollbar-none"
            style={showFade ? {
              maskImage: 'linear-gradient(to right, black 85%, transparent)',
              WebkitMaskImage: 'linear-gradient(to right, black 85%, transparent)',
            } : undefined}
          >
            {METHOD_CHIPS.map((m) => {
              const Icon = m.icon
              const total = methodTotals[m.key] ?? 0
              if (total === 0) return null
              const isActive = activeMethod === m.key
              return (
                <button
                  key={m.key}
                  onClick={() => { setActiveMethod(isActive ? undefined : m.key); setMethodFilter('') }}
                  className={cn(
                    'flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-all shrink-0 min-h-9',
                    isActive
                      ? `ring-2 ${m.color} bg-card`
                      : 'bg-card text-muted-foreground border-border hover:bg-muted/50'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" /> {m.label} {formatK(total)}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Filter panel ───────────────────────────────────────────── */}
      {filtersOpen && (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden animate-in slide-in-from-top-1 fade-in duration-200">
          {/* Active filters bar */}
          {activeFilterCount > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/40 px-4 py-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Active</span>
              {invoiceSearch && (
                <FilterChip label={`Invoice: ${invoiceSearch}`} onClear={() => setInvoiceSearch('')} />
              )}
              {customerSearch && (
                <FilterChip label={`Customer: ${customerSearch}`} onClear={() => setCustomerSearch('')} />
              )}
              {refSearch && (
                <FilterChip label={`Ref: ${refSearch}`} onClear={() => setRefSearch('')} />
              )}
              {dateFrom && (
                <FilterChip label={`Date ≥ ${dateFrom}`} onClear={() => setDateFrom('')} />
              )}
              {dateTo && (
                <FilterChip label={`Date ≤ ${dateTo}`} onClear={() => setDateTo('')} />
              )}
              {methodFilter && (
                <FilterChip label={`Method: ${METHOD_CHIPS.find((m) => m.key === methodFilter)?.label ?? methodFilter}`} onClear={() => setMethodFilter('')} />
              )}
              {agent && (
                <FilterChip label={`Agent: ${agent}`} onClear={() => setAgent('')} />
              )}
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
            {/* Search section */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Search className="h-3.5 w-3.5" />
                Search
              </div>
              <div className="space-y-2">
                <Input
                  placeholder="Invoice number…"
                  value={invoiceSearch}
                  onChange={(e) => setInvoiceSearch(e.target.value)}
                  className="h-9"
                  aria-label="Invoice number"
                />
                <Input
                  placeholder="Customer name…"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="h-9"
                  aria-label="Customer name"
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

            {/* Date range section */}
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

            {/* Categorisation section */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Tag className="h-3.5 w-3.5" />
                Categorise
              </div>
              <div className="space-y-2">
                <Select value={methodFilter} onValueChange={(v) => { setMethodFilter(v ?? ''); setActiveMethod(undefined) }}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Any method" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Any method</SelectItem>
                    {METHOD_CHIPS.map((m) => (
                      <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={agent} onValueChange={(v) => setAgent(v ?? '')}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Any agent" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Any agent</SelectItem>
                    {uniqueAgents.map((a) => (
                      <SelectItem key={a} value={a}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── QB Transfer bar ────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg border bg-blue-50/50">
          <Checkbox
            checked={selected.size === selectablePayments.length && selectablePayments.length > 0}
            indeterminate={selected.size > 0 && selected.size < selectablePayments.length}
            onCheckedChange={(v) => handleSelectAll(v === true)}
          />
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button size="sm" className="gap-1.5 ml-auto" onClick={() => setQbDialogOpen(true)}>
            <BookOpen className="h-3.5 w-3.5" /> Transfer to QuickBooks
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {/* ── Payment list ───────────────────────────────────────────── */}
      {isLoading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
      ) : allPayments.length === 0 ? (
        <div className="py-16 text-center">
          <Receipt className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">No payments found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {allPayments.map((pay) => (
            <PaymentCard
              key={pay.id}
              payment={pay}
              selected={selected.has(pay.id)}
              onSelect={handleSelect}
            />
          ))}
          <div ref={sentinelRef} className="h-1" />
          {isFetchingNextPage && (
            <p className="text-center text-xs text-muted-foreground py-4">Loading more…</p>
          )}
        </div>
      )}

      {/* ── QB dialog ──────────────────────────────────────────────── */}
      <AlertDialog open={qbDialogOpen} onOpenChange={setQbDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Transfer to QuickBooks</AlertDialogTitle>
            <AlertDialogDescription>
              Mark {selected.size} payment(s) as transferred to QuickBooks? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleQbSync} disabled={bulkSync.isPending}>
              {bulkSync.isPending ? 'Syncing…' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageWrapper>
  )
}
