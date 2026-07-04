'use client'

import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useFinancialDashboard } from '@/hooks/useFinancialDashboard'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import {
  ArrowDownLeft, ArrowUpRight, AlertTriangle, TrendingUp,
} from 'lucide-react'

function TrendBar({ data }: { data: { label: string; invoiced: number; billed: number }[] }) {
  const max = Math.max(...data.flatMap((d) => [d.invoiced, d.billed]), 1)

  return (
    <div className="flex items-end gap-2 sm:gap-4 h-40 sm:h-48">
      {data.map((d) => (
        <div key={d.label} className="flex-1 flex flex-col items-center gap-1">
          <div className="flex items-end gap-0.5 sm:gap-1 w-full h-32 sm:h-40">
            <div
              className="flex-1 bg-emerald-400 rounded-t transition-all min-h-[2px]"
              style={{ height: `${(d.invoiced / max) * 100}%` }}
              title={`Sales: ${formatCurrency(d.invoiced, 'QAR')}`}
            />
            <div
              className="flex-1 bg-red-400 rounded-t transition-all min-h-[2px]"
              style={{ height: `${(d.billed / max) * 100}%` }}
              title={`Purchase: ${formatCurrency(d.billed, 'QAR')}`}
            />
          </div>
          <span className="text-[10px] sm:text-xs text-muted-foreground">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    </div>
  )
}

export default function FinancialDashboardPage() {
  const { data, isLoading } = useFinancialDashboard()

  if (isLoading || !data) {
    return (
      <PageWrapper>
        <PageHeader title="Financial Dashboard" description="Overview of receivables, payables, and cash flow" />
        <LoadingSkeleton />
      </PageWrapper>
    )
  }

  const { receivables, payables, monthly_trend, top_overdue_customers, top_overdue_suppliers } = data
  const netPosition = receivables.total - payables.total

  return (
    <PageWrapper>
      <PageHeader
        title="Financial Dashboard"
        description="Overview of receivables, payables, and cash flow"
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Receivables */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-emerald-100 p-2">
                <ArrowDownLeft className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total Receivables</div>
                <div className="text-xl font-bold tabular-nums">{formatCurrency(receivables.total, 'QAR')}</div>
              </div>
            </div>
            {receivables.overdue > 0 && (
              <div className="mt-3 text-xs text-red-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {formatCurrency(receivables.overdue, 'QAR')} overdue ({receivables.overdue_count} invoices)
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payables */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-red-100 p-2">
                <ArrowUpRight className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total Payables</div>
                <div className="text-xl font-bold tabular-nums">{formatCurrency(payables.total, 'QAR')}</div>
              </div>
            </div>
            {payables.overdue > 0 && (
              <div className="mt-3 text-xs text-red-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {formatCurrency(payables.overdue, 'QAR')} overdue ({payables.overdue_count} bills)
              </div>
            )}
          </CardContent>
        </Card>

        {/* Net Position */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={cn('rounded-full p-2', netPosition >= 0 ? 'bg-emerald-100' : 'bg-red-100')}>
                <TrendingUp className={cn('h-5 w-5', netPosition >= 0 ? 'text-emerald-600' : 'text-red-600')} />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Net Position</div>
                <div className={cn('text-xl font-bold tabular-nums', netPosition >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                  {formatCurrency(netPosition, 'QAR')}
                </div>
              </div>
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              {netPosition >= 0 ? 'Customers owe more than you owe suppliers' : 'You owe suppliers more than customers owe you'}
            </div>
          </CardContent>
        </Card>

        {/* Overdue Total */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-amber-100 p-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total Overdue</div>
                <div className="text-xl font-bold tabular-nums text-amber-600">
                  {formatCurrency(receivables.overdue + payables.overdue, 'QAR')}
                </div>
              </div>
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              {receivables.overdue_count + payables.overdue_count} overdue documents
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly trend chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Monthly Trend — Last 6 Months</CardTitle>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Sales Invoiced</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400" /> Purchase Billed</span>
          </div>
        </CardHeader>
        <CardContent>
          <TrendBar data={monthly_trend} />
        </CardContent>
      </Card>

      {/* Top overdue tables */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top overdue customers */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Overdue Customers</CardTitle>
          </CardHeader>
          <CardContent>
            {top_overdue_customers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No overdue customer invoices</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Oldest Due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {top_overdue_customers.map((c) => (
                    <TableRow key={c.name}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-right tabular-nums text-red-600 font-semibold">
                        {formatCurrency(c.amount, 'QAR')}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground hidden sm:table-cell">
                        {formatDate(c.oldest_due)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Top overdue suppliers */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Overdue Suppliers</CardTitle>
          </CardHeader>
          <CardContent>
            {top_overdue_suppliers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No overdue supplier bills</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Oldest Due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {top_overdue_suppliers.map((s) => (
                    <TableRow key={s.name}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-right tabular-nums text-red-600 font-semibold">
                        {formatCurrency(s.amount, 'QAR')}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground hidden sm:table-cell">
                        {formatDate(s.oldest_due)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </PageWrapper>
  )
}
