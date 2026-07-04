'use client'

import { useState, useMemo } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useCustomerStatement, useCustomerList, type StatementOrder } from '@/hooks/useCustomerStatement'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Download, Eye, Loader2 } from 'lucide-react'

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  quotation:        { label: 'Quotation',        cls: 'bg-muted text-muted-foreground border-transparent' },
  pending_approval: { label: 'Pending Approval', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  confirmed:        { label: 'Confirmed',        cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  in_progress:      { label: 'In Progress',      cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  partial_delivery: { label: 'Partial Delivery', cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  delivered:        { label: 'Delivered',        cls: 'bg-teal-100 text-teal-800 border-teal-200' },
  invoiced:         { label: 'Invoiced',         cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  closed:           { label: 'Closed',           cls: 'bg-slate-100 text-slate-700 border-slate-200' },
}

export default function CustomerStatementPage() {
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [pdfBusy, setPdfBusy] = useState<'view' | 'download' | null>(null)

  const { data: customers = [], isLoading: loadingCustomers } = useCustomerList()
  const { data: statement, isLoading: loadingStatement } = useCustomerStatement(customerId)

  const filteredOrders = useMemo<StatementOrder[]>(() => {
    if (!statement) return []
    return showAll ? statement.orders : statement.orders.filter((o) => o.outstanding > 0)
  }, [statement, showAll])

  const totals = useMemo(() => ({
    total_orders_value: filteredOrders.reduce((s, o) => s + o.total, 0),
    total_paid:         filteredOrders.reduce((s, o) => s + o.paid, 0),
    total_outstanding:  filteredOrders.reduce((s, o) => s + o.outstanding, 0),
  }), [filteredOrders])

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
        description="Open sale orders with outstanding balance — matches the printable statement layout"
      />

      {/* Filter card */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Customer *</Label>
            <Select
              value={customerId ?? ''}
              onValueChange={(v) => setCustomerId(v || null)}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder={loadingCustomers ? 'Loading…' : 'Select customer…'} />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Scope</Label>
            <Select value={showAll ? 'all' : 'open'} onValueChange={(v) => setShowAll(v === 'all')}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open orders only (with outstanding)</SelectItem>
                <SelectItem value="all">All orders</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Action bar */}
        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={handleViewPdf}
            disabled={!customerId || filteredOrders.length === 0 || pdfBusy !== null}
          >
            {pdfBusy === 'view'
              ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              : <Eye className="h-3.5 w-3.5 mr-1.5" />}
            View PDF
          </Button>
          <Button
            size="sm"
            onClick={handleDownloadPdf}
            disabled={!customerId || filteredOrders.length === 0 || pdfBusy !== null}
          >
            {pdfBusy === 'download'
              ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              : <Download className="h-3.5 w-3.5 mr-1.5" />}
            Download PDF
          </Button>
        </div>
      </div>

      {/* Customer meta + summary — only when customer selected */}
      {statement && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
          {/* Customer meta card */}
          <div className="lg:col-span-2 rounded-lg border bg-card p-4 space-y-2">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Customer</div>
            <div className="text-lg font-semibold">{statement.customer.name}</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Phone</div>
                <div>{statement.customer.phone ?? '—'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Account Type</div>
                <div>{statement.customer.account_type}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Open Orders</div>
                <div className="font-semibold">{statement.open_orders_count}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Statement Date</div>
                <div>{formatDate(new Date().toISOString())}</div>
              </div>
            </div>
          </div>

          {/* Totals cards */}
          <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="text-xs text-muted-foreground mb-1">Total Orders Value</div>
              <div className="text-lg font-bold tabular-nums text-blue-900">{formatCurrency(totals.total_orders_value, 'QAR')}</div>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-xs text-muted-foreground mb-1">Total Paid</div>
              <div className="text-lg font-bold tabular-nums text-emerald-800">{formatCurrency(totals.total_paid, 'QAR')}</div>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="text-xs text-muted-foreground mb-1">Total Outstanding</div>
              <div className="text-lg font-bold tabular-nums text-red-700">{formatCurrency(totals.total_outstanding, 'QAR')}</div>
            </div>
          </div>
        </div>
      )}

      {/* Orders table */}
      {!customerId ? (
        <div className="rounded-lg border border-dashed">
          <EmptyState title="Select a customer" description="Choose a customer above to view their statement" />
        </div>
      ) : loadingStatement ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="rounded-lg border border-dashed">
          <EmptyState
            title={showAll ? 'No orders' : 'No open orders'}
            description={showAll
              ? `${statement?.customer.name} has no sale orders`
              : `${statement?.customer.name} has no orders with outstanding balance. Switch to "All orders" to see everything.`}
          />
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SO #</TableHead>
                <TableHead className="hidden sm:table-cell">Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right hidden md:table-cell">Paid</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.map((o) => {
                const s = STATUS_BADGE[o.status] ?? { label: o.status, cls: 'bg-muted text-muted-foreground' }
                return (
                  <TableRow key={o.id}>
                    <TableCell className="font-semibold text-primary whitespace-nowrap">{o.so_number}</TableCell>
                    <TableCell className="hidden sm:table-cell whitespace-nowrap text-sm">{formatDate(o.created_at)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('text-xs', s.cls)}>{s.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(o.total, 'QAR')}</TableCell>
                    <TableCell className="text-right tabular-nums hidden md:table-cell text-emerald-600">
                      {o.paid > 0 ? formatCurrency(o.paid, 'QAR') : '—'}
                    </TableCell>
                    <TableCell className={cn(
                      'text-right tabular-nums font-bold',
                      o.outstanding > 0 ? 'text-red-600' : 'text-emerald-600',
                    )}>
                      {formatCurrency(o.outstanding, 'QAR')}
                    </TableCell>
                  </TableRow>
                )
              })}
              {/* Totals footer */}
              <TableRow className="bg-muted/50 font-bold border-t-2">
                <TableCell colSpan={3} className="hidden sm:table-cell">Totals</TableCell>
                <TableCell colSpan={2} className="sm:hidden">Totals</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(totals.total_orders_value, 'QAR')}</TableCell>
                <TableCell className="text-right tabular-nums hidden md:table-cell text-emerald-600">{formatCurrency(totals.total_paid, 'QAR')}</TableCell>
                <TableCell className="text-right tabular-nums text-red-600">{formatCurrency(totals.total_outstanding, 'QAR')}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </PageWrapper>
  )
}
