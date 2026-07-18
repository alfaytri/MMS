'use client'

import { useState, useMemo, useCallback } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card, CardContent,
} from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '@/components/ui/command'
import {
  Popover, PopoverTrigger, PopoverContent,
} from '@/components/ui/popover'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { useCustomerStatement, useCustomerList, type StatementOrder } from '@/hooks/useCustomerStatement'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  Download, Eye, Loader2, ChevronsUpDown, User, Phone, CreditCard,
  FileText, Calendar, ShoppingCart, Wallet, AlertCircle, Check,
} from 'lucide-react'

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  quotation:        { label: 'Quotation',        cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  pending_approval: { label: 'Pending Approval', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  confirmed:        { label: 'Confirmed',        cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  in_progress:      { label: 'In Progress',      cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  partial_delivery: { label: 'Partial Delivery', cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  delivered:        { label: 'Delivered',         cls: 'bg-teal-50 text-teal-700 border-teal-200' },
  invoiced:         { label: 'Invoiced',          cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  closed:           { label: 'Closed',            cls: 'bg-gray-100 text-gray-600 border-gray-200' },
}

export default function CustomerStatementPage() {
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [pdfBusy, setPdfBusy] = useState<'view' | 'download' | null>(null)
  const [comboOpen, setComboOpen] = useState(false)

  const { data: customers = [], isLoading: loadingCustomers } = useCustomerList()
  const { data: statement, isLoading: loadingStatement } = useCustomerStatement(customerId)

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId),
    [customers, customerId],
  )

  const filteredOrders = useMemo<StatementOrder[]>(() => {
    if (!statement) return []
    return showAll ? statement.orders : statement.orders.filter((o) => o.outstanding > 0)
  }, [statement, showAll])

  const totals = useMemo(() => ({
    total_orders_value: filteredOrders.reduce((s, o) => s + o.total, 0),
    total_paid:         filteredOrders.reduce((s, o) => s + o.paid, 0),
    total_outstanding:  filteredOrders.reduce((s, o) => s + o.outstanding, 0),
  }), [filteredOrders])

  const handleSelectCustomer = useCallback((id: string) => {
    setCustomerId(id)
    setComboOpen(false)
  }, [])

  async function buildPdfUrl(): Promise<string> {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Not authenticated')
    const qs = new URLSearchParams({ open: showAll ? 'false' : 'true' })
    const res = await fetch(`/api/sales/customers/${customerId}/statement/pdf?${qs}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? `Request failed (${res.status})`)
    }
    const blob = await res.blob()
    return URL.createObjectURL(blob)
  }

  async function handleViewPdf() {
    if (!customerId || pdfBusy) return
    setPdfBusy('view')
    try {
      const url = await buildPdfUrl()
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to open PDF')
    } finally {
      setPdfBusy(null)
    }
  }

  async function handleDownloadPdf() {
    if (!customerId || pdfBusy) return
    setPdfBusy('download')
    try {
      const url = await buildPdfUrl()
      const a = document.createElement('a')
      a.href = url
      a.download = `Statement-${statement?.customer.name || 'customer'}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to download PDF')
    } finally {
      setPdfBusy(null)
    }
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Customer Statement"
        description="View sale orders, payments, and outstanding balances per customer"
      />

      {/* ── Toolbar: Customer search + Scope tabs + PDF actions ── */}
      <Card>
        <CardContent className="pt-1">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Left: Customer combobox */}
            <div className="flex-1 max-w-sm">
              <Popover open={comboOpen} onOpenChange={setComboOpen}>
                <PopoverTrigger
                  className={cn(
                    'flex h-10 w-full items-center justify-between rounded-lg border bg-background px-3 text-sm',
                    'ring-offset-background transition-colors',
                    'hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    !customerId && 'text-muted-foreground',
                  )}
                >
                  <div className="flex items-center gap-2 truncate">
                    <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">
                      {selectedCustomer?.name ?? (loadingCustomers ? 'Loading customers...' : 'Search customer...')}
                    </span>
                  </div>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </PopoverTrigger>
                <PopoverContent className="w-(--anchor-width) p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Type to search..." />
                    <CommandList>
                      <CommandEmpty>No customer found.</CommandEmpty>
                      <CommandGroup>
                        {customers.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={c.name}
                            onSelect={() => handleSelectCustomer(c.id)}
                            data-checked={customerId === c.id}
                          >
                            <div className="flex items-center gap-2">
                              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                {c.name.charAt(0).toUpperCase()}
                              </div>
                              <span>{c.name}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Center: Scope toggle tabs */}
            <div className="flex items-center gap-3">
              <Tabs
                value={showAll ? 'all' : 'open'}
                onValueChange={(v) => setShowAll(v === 'all')}
              >
                <TabsList>
                  <TabsTrigger value="open">Open Orders</TabsTrigger>
                  <TabsTrigger value="all">All Orders</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Right: PDF actions */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleViewPdf}
                disabled={!customerId || filteredOrders.length === 0 || pdfBusy !== null}
                className="gap-1.5 min-h-11 md:min-h-0"
              >
                {pdfBusy === 'view'
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Eye className="h-4 w-4" />}
                View PDF
              </Button>
              <Button
                size="sm"
                onClick={handleDownloadPdf}
                disabled={!customerId || filteredOrders.length === 0 || pdfBusy !== null}
                className="gap-1.5 min-h-11 md:min-h-0"
              >
                {pdfBusy === 'download'
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Download className="h-4 w-4" />}
                Download
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Customer profile + KPI cards — only when data loaded ── */}
      {statement && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">

          {/* Customer profile card */}
          <Card className="lg:col-span-4">
            <CardContent className="pt-1 space-y-4">
              {/* Avatar + name */}
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
                  {statement.customer.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold truncate">{statement.customer.name}</h3>
                  <p className="text-xs text-muted-foreground">Statement as of {formatDate(new Date().toISOString())}</p>
                </div>
              </div>

              <Separator />

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-start gap-2">
                  <Phone className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Phone</p>
                    <p className="text-sm font-medium">{statement.customer.phone ?? '—'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <CreditCard className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Account</p>
                    <p className="text-sm font-medium">{statement.customer.account_type}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <ShoppingCart className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Open Orders</p>
                    <p className="text-sm font-semibold text-primary">{statement.open_orders_count}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Date</p>
                    <p className="text-sm font-medium">{formatDate(new Date().toISOString())}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* KPI Cards */}
          <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Total Orders Value */}
            <Card>
              <CardContent className="pt-1">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Total Orders Value</p>
                    <p className="text-xl font-bold tabular-nums text-blue-700 dark:text-blue-300 truncate">
                      {formatCurrency(totals.total_orders_value, 'QAR')}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShoppingCart className="h-3 w-3" />
                  <span>{filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}</span>
                </div>
              </CardContent>
            </Card>

            {/* Total Paid */}
            <Card>
              <CardContent className="pt-1">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                    <Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Total Paid</p>
                    <p className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300 truncate">
                      {formatCurrency(totals.total_paid, 'QAR')}
                    </p>
                  </div>
                </div>
                {totals.total_orders_value > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>Collected</span>
                      <span>{Math.round((totals.total_paid / totals.total_orders_value) * 100)}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${Math.min(100, (totals.total_paid / totals.total_orders_value) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Total Outstanding */}
            <Card>
              <CardContent className="pt-1">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-lg',
                    totals.total_outstanding > 0
                      ? 'bg-red-100 dark:bg-red-900/30'
                      : 'bg-emerald-100 dark:bg-emerald-900/30',
                  )}>
                    <AlertCircle className={cn(
                      'h-5 w-5',
                      totals.total_outstanding > 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-emerald-600 dark:text-emerald-400',
                    )} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Outstanding</p>
                    <p className={cn(
                      'text-xl font-bold tabular-nums truncate',
                      totals.total_outstanding > 0
                        ? 'text-red-700 dark:text-red-300'
                        : 'text-emerald-700 dark:text-emerald-300',
                    )}>
                      {formatCurrency(totals.total_outstanding, 'QAR')}
                    </p>
                  </div>
                </div>
                {totals.total_outstanding > 0 && (
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                    <AlertCircle className="h-3 w-3" />
                    <span>Requires follow-up</span>
                  </div>
                )}
                {totals.total_outstanding === 0 && filteredOrders.length > 0 && (
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3 w-3" />
                    <span>All settled</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ── Orders table ── */}
      {!customerId ? (
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
                <User className="h-7 w-7 text-muted-foreground" />
              </div>
              <h3 className="text-base font-semibold mb-1">Select a customer</h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                Search and select a customer above to view their statement with orders and balances
              </p>
            </div>
          </CardContent>
        </Card>
      ) : loadingStatement ? (
        <Card>
          <CardContent className="space-y-3 pt-1">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
          </CardContent>
        </Card>
      ) : filteredOrders.length === 0 ? (
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/20 mb-4">
                <Check className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-base font-semibold mb-1">
                {showAll ? 'No orders' : 'No open orders'}
              </h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                {showAll
                  ? `${statement?.customer.name} has no sale orders on record.`
                  : `${statement?.customer.name} has no outstanding balances. Switch to "All Orders" to see the full history.`}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">SO #</TableHead>
                    <TableHead className="hidden sm:table-cell">Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Paid</TableHead>
                    <TableHead className="text-right pr-4">Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((o) => {
                    const s = STATUS_BADGE[o.status] ?? { label: o.status, cls: 'bg-muted text-muted-foreground' }
                    return (
                      <TableRow key={o.id} className="group">
                        <TableCell className="pl-4 font-semibold text-primary whitespace-nowrap">{o.so_number}</TableCell>
                        <TableCell className="hidden sm:table-cell whitespace-nowrap text-muted-foreground">{formatDate(o.created_at)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-[11px] font-medium', s.cls)}>{s.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{formatCurrency(o.total, 'QAR')}</TableCell>
                        <TableCell className="text-right tabular-nums hidden md:table-cell text-emerald-600 dark:text-emerald-400">
                          {o.paid > 0 ? formatCurrency(o.paid, 'QAR') : '—'}
                        </TableCell>
                        <TableCell className={cn(
                          'text-right tabular-nums pr-4 font-bold',
                          o.outstanding > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400',
                        )}>
                          {formatCurrency(o.outstanding, 'QAR')}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Totals footer */}
            <div className="border-t-2 bg-muted/30 px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Totals</span>
                <div className="flex items-center gap-6 sm:gap-10">
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground hidden md:block">Total</p>
                    <p className="text-sm font-bold tabular-nums">{formatCurrency(totals.total_orders_value, 'QAR')}</p>
                  </div>
                  <div className="text-right hidden md:block">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Paid</p>
                    <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(totals.total_paid, 'QAR')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground hidden md:block">Outstanding</p>
                    <p className="text-sm font-bold tabular-nums text-red-600 dark:text-red-400">{formatCurrency(totals.total_outstanding, 'QAR')}</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </PageWrapper>
  )
}
