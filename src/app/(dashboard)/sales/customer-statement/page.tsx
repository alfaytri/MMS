'use client'

import { useState, useMemo } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useCustomerStatement, useCustomerList } from '@/hooks/useCustomerStatement'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { FileText, CreditCard, FileX } from 'lucide-react'

const TXN_CONFIG: Record<string, { label: string; icon: typeof FileText; badgeClass: string }> = {
  invoice:     { label: 'Invoice',     icon: FileText,  badgeClass: 'border-blue-300 bg-blue-50 text-blue-700' },
  payment:     { label: 'Payment',     icon: CreditCard, badgeClass: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
  credit_note: { label: 'Credit Note', icon: FileX,     badgeClass: 'border-amber-300 bg-amber-50 text-amber-700' },
}

export default function CustomerStatementPage() {
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [search, setSearch] = useState('')

  const { data: customers = [], isLoading: loadingCustomers } = useCustomerList()
  const { data: rows = [], isLoading: loadingStatement } = useCustomerStatement(
    customerId,
    dateFrom || null,
    dateTo || null,
  )

  const customerName = useMemo(
    () => customers.find((c) => c.id === customerId)?.name ?? '',
    [customers, customerId],
  )

  const filtered = useMemo(() => {
    if (!search) return rows
    const q = search.toLowerCase()
    return rows.filter(
      (r) =>
        r.reference.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q),
    )
  }, [rows, search])

  const totals = useMemo(() => ({
    debit:  rows.reduce((s, r) => s + r.debit, 0),
    credit: rows.reduce((s, r) => s + r.credit, 0),
  }), [rows])

  const closingBalance = totals.debit - totals.credit

  return (
    <PageWrapper>
      <PageHeader
        title="Customer Statement"
        description="Complete transaction history for a customer — invoices, payments, and credit notes"
      />

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Customer</Label>
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
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Search</Label>
          <Input
            type="text"
            placeholder="Reference or description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9"
          />
        </div>
      </div>

      {/* Summary cards — only show when customer selected */}
      {customerId && rows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="text-xs text-muted-foreground mb-1">Total Invoiced</div>
            <div className="text-xl font-bold tabular-nums">{formatCurrency(totals.debit, 'QAR')}</div>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <div className="text-xs text-muted-foreground mb-1">Total Paid / Credited</div>
            <div className="text-xl font-bold tabular-nums">{formatCurrency(totals.credit, 'QAR')}</div>
          </div>
          <div className={cn(
            'rounded-lg border p-4',
            closingBalance > 0
              ? 'border-red-200 bg-red-50'
              : 'border-emerald-200 bg-emerald-50',
          )}>
            <div className="text-xs text-muted-foreground mb-1">Closing Balance</div>
            <div className={cn(
              'text-xl font-bold tabular-nums',
              closingBalance > 0 ? 'text-red-700' : 'text-emerald-700',
            )}>
              {formatCurrency(closingBalance, 'QAR')}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {closingBalance > 0 ? 'Customer owes' : closingBalance < 0 ? 'Overpaid / credit' : 'Fully settled'}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {!customerId ? (
        <div className="rounded-lg border border-dashed">
          <EmptyState title="Select a customer" description="Choose a customer above to view their statement" />
        </div>
      ) : loadingStatement ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed">
          <EmptyState
            title="No transactions"
            description={`No transactions found for ${customerName} in the selected date range`}
          />
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="hidden sm:table-cell">Description</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row, idx) => {
                const cfg = TXN_CONFIG[row.txn_type] ?? TXN_CONFIG.invoice
                return (
                  <TableRow key={`${row.reference}-${idx}`}>
                    <TableCell className="text-sm whitespace-nowrap">{formatDate(row.txn_date)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('text-xs', cfg.badgeClass)}>
                        {cfg.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium text-primary text-sm">{row.reference}</TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground max-w-[200px] truncate">
                      {row.description}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {row.debit > 0 ? formatCurrency(row.debit, 'QAR') : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-emerald-600">
                      {row.credit > 0 ? formatCurrency(row.credit, 'QAR') : '—'}
                    </TableCell>
                    <TableCell className={cn(
                      'text-right tabular-nums font-bold',
                      row.balance > 0 ? 'text-red-600' : row.balance < 0 ? 'text-emerald-600' : '',
                    )}>
                      {formatCurrency(row.balance, 'QAR')}
                    </TableCell>
                  </TableRow>
                )
              })}
              {/* Totals footer */}
              <TableRow className="bg-muted/50 font-bold border-t-2">
                <TableCell colSpan={4} className="hidden sm:table-cell">Totals</TableCell>
                <TableCell colSpan={3} className="sm:hidden">Totals</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(totals.debit, 'QAR')}</TableCell>
                <TableCell className="text-right tabular-nums text-emerald-600">{formatCurrency(totals.credit, 'QAR')}</TableCell>
                <TableCell className={cn(
                  'text-right tabular-nums',
                  closingBalance > 0 ? 'text-red-600' : 'text-emerald-600',
                )}>
                  {formatCurrency(closingBalance, 'QAR')}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </PageWrapper>
  )
}
