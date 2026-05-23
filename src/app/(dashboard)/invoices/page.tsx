// src/app/(dashboard)/invoices/page.tsx
'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import {
  AlertTriangle, BookOpen, CheckCircle2, CreditCard,
  FileText, Filter, Receipt, RotateCcw, Send, X,
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
import { InvoiceCard } from '@/components/invoices/InvoiceCard'
import { VoidInvoiceDialog } from '@/components/invoices/VoidInvoiceDialog'
import { CreditNoteDialog } from '@/components/invoices/CreditNoteDialog'
import {
  useInvoices, useInvoiceSummary, useBulkQbSyncInvoices,
  type FinanceInvoice, type InvoiceFilters,
} from '@/hooks/useInvoices'
import { formatCurrency } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// ── Debounce hook ───────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ── Status counter chips config ─────────────────────────────────────────

const STATUS_CHIPS = [
  { key: 'overdue',        label: 'Overdue', icon: AlertTriangle, color: 'bg-red-100 text-red-700 border-red-300' },
  { key: 'sent',           label: 'Sent',    icon: Send,          color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { key: 'partially_paid', label: 'Partial', icon: CreditCard,    color: 'bg-amber-100 text-amber-700 border-amber-300' },
  { key: 'draft',          label: 'Draft',   icon: FileText,      color: 'bg-slate-100 text-slate-600 border-slate-300' },
  { key: 'paid',           label: 'Paid',    icon: CheckCircle2,  color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
] as const

export default function ViewInvoicesPage() {
  // ── Filter state ────────────────────────────────────────────────────
  const [activeStatus, setActiveStatus] = useState<string | undefined>()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [issuedFrom, setIssuedFrom] = useState('')
  const [issuedTo, setIssuedTo] = useState('')
  const [dueFrom, setDueFrom] = useState('')
  const [dueTo, setDueTo] = useState('')
  const [invoiceSearch, setInvoiceSearch] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [source, setSource] = useState('')
  const [agent, setAgent] = useState('')
  const [sortField, setSortField] = useState<'due_date' | 'total_amount'>('due_date')
  const [sortAsc, setSortAsc] = useState(false)

  const debouncedInvoice = useDebounce(invoiceSearch, 250)
  const debouncedCustomer = useDebounce(customerSearch, 250)

  const filters: InvoiceFilters = {
    status: activeStatus,
    invoiceSearch: debouncedInvoice || undefined,
    customerSearch: debouncedCustomer || undefined,
    issuedFrom: issuedFrom || undefined,
    issuedTo: issuedTo || undefined,
    dueFrom: dueFrom || undefined,
    dueTo: dueTo || undefined,
    source: source || undefined,
    agent: agent || undefined,
    sortField,
    sortAsc,
  }

  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useInvoices(filters)

  const allInvoices = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data]
  )

  // ── Server-side aggregates (full database, not limited by scroll depth) ──
  const { data: summary } = useInvoiceSummary()
  const statusCounts = summary?.status_counts ?? {}
  const outstanding = summary?.outstanding ?? 0

  // ── Selection state ─────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [qbDialogOpen, setQbDialogOpen] = useState(false)
  const bulkSync = useBulkQbSyncInvoices()

  const selectableInvoices = useMemo(
    () =>
      allInvoices.filter(
        (inv) =>
          !inv.qb_synced &&
          inv.status !== 'void' &&
          inv.status !== 'cancelled'
      ),
    [allInvoices]
  )

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelected(new Set(selectableInvoices.map((i) => i.id)))
    } else {
      setSelected(new Set())
    }
  }

  const handleSelect = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const handleQbSync = async () => {
    try {
      await bulkSync.mutateAsync([...selected])
      toast.success(`${selected.size} invoice(s) synced to QuickBooks`)
      setSelected(new Set())
      setQbDialogOpen(false)
    } catch {
      toast.error('QB sync failed')
    }
  }

  // ── Dialog state ────────────────────────────────────────────────────
  const [voidTarget, setVoidTarget] = useState<FinanceInvoice | null>(null)
  const [creditTarget, setCreditTarget] = useState<FinanceInvoice | null>(null)

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

  // ── Filter helpers ──────────────────────────────────────────────────
  const activeFilterCount = [
    issuedFrom, issuedTo, dueFrom, dueTo,
    invoiceSearch, customerSearch, source, agent,
  ].filter(Boolean).length

  const handleReset = () => {
    setActiveStatus(undefined)
    setIssuedFrom('')
    setIssuedTo('')
    setDueFrom('')
    setDueTo('')
    setInvoiceSearch('')
    setCustomerSearch('')
    setSource('')
    setAgent('')
  }

  // ── Unique agents for dropdown ──────────────────────────────────────
  const uniqueAgents = useMemo(() => {
    const agents = new Set<string>()
    for (const inv of allInvoices) {
      if (inv.agent_name) agents.add(inv.agent_name)
    }
    return [...agents].sort()
  }, [allInvoices])

  const toggleSort = (field: 'due_date' | 'total_amount') => {
    if (sortField === field) setSortAsc((v) => !v)
    else { setSortField(field); setSortAsc(false) }
  }

  return (
    <PageWrapper>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold">Invoices</h1>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-sm">
              Outstanding: {formatCurrency(outstanding)}
            </Badge>
          </div>
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
                <Icon className="h-3.5 w-3.5" />
                {chip.label}
                <span className="font-bold">{count}</span>
              </button>
            )
          })}

          {/* Filter & sort controls */}
          <div className="ml-auto flex items-center gap-1.5">
            {activeStatus && (
              <Badge variant="secondary" className="gap-1 text-xs">
                {activeStatus}
                <button onClick={() => setActiveStatus(undefined)}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
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
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => toggleSort('due_date')}>
              Due {sortField === 'due_date' ? (sortAsc ? '↑' : '↓') : ''}
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => toggleSort('total_amount')}>
              Amt {sortField === 'total_amount' ? (sortAsc ? '↑' : '↓') : ''}
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{allInvoices.length} results</p>
      </div>

      {/* ── Filter panel ───────────────────────────────────────────── */}
      {filtersOpen && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 p-4 rounded-lg border bg-muted/30">
          <Input type="date" placeholder="Issued From" value={issuedFrom} onChange={(e) => setIssuedFrom(e.target.value)} />
          <Input type="date" placeholder="Issued To" value={issuedTo} onChange={(e) => setIssuedTo(e.target.value)} />
          <Input type="date" placeholder="Due From" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} />
          <Input type="date" placeholder="Due To" value={dueTo} onChange={(e) => setDueTo(e.target.value)} />
          <Input placeholder="Invoice #" value={invoiceSearch} onChange={(e) => setInvoiceSearch(e.target.value)} />
          <Input placeholder="Customer" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} />
          <Select value={source} onValueChange={(v) => setSource(v ?? '')}>
            <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="order">Orders</SelectItem>
              <SelectItem value="contract">Contracts</SelectItem>
              <SelectItem value="sale">Sales</SelectItem>
              <SelectItem value="purchase">Purchase</SelectItem>
            </SelectContent>
          </Select>
          <Select value={agent} onValueChange={(v) => setAgent(v ?? '')}>
            <SelectTrigger><SelectValue placeholder="Agent" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {uniqueAgents.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* ── QB Transfer bar ────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg border bg-blue-50/50">
          <Checkbox
            checked={selected.size === selectableInvoices.length && selectableInvoices.length > 0}
            onCheckedChange={(v) => handleSelectAll(v === true)}
          />
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button size="sm" className="gap-1.5 ml-auto" onClick={() => setQbDialogOpen(true)}>
            <BookOpen className="h-3.5 w-3.5" /> Transfer to QuickBooks
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {/* ── Invoice list ───────────────────────────────────────────── */}
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
            <InvoiceCard
              key={inv.id}
              invoice={inv}
              selected={selected.has(inv.id)}
              onSelect={handleSelect}
              onVoid={setVoidTarget}
              onCreditNote={setCreditTarget}
            />
          ))}
          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-1" />
          {isFetchingNextPage && (
            <p className="text-center text-xs text-muted-foreground py-4">Loading more...</p>
          )}
        </div>
      )}

      {/* ── Dialogs ────────────────────────────────────────────────── */}
      <VoidInvoiceDialog
        open={!!voidTarget}
        onOpenChange={(v) => !v && setVoidTarget(null)}
        invoice={voidTarget}
      />
      <CreditNoteDialog
        open={!!creditTarget}
        onOpenChange={(v) => !v && setCreditTarget(null)}
        invoice={creditTarget}
      />
      <AlertDialog open={qbDialogOpen} onOpenChange={setQbDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Transfer to QuickBooks</AlertDialogTitle>
            <AlertDialogDescription>
              Mark {selected.size} invoice(s) as transferred to QuickBooks? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleQbSync} disabled={bulkSync.isPending}>
              {bulkSync.isPending ? 'Syncing...' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageWrapper>
  )
}
