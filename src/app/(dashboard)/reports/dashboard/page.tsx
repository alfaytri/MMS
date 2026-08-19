'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useFinancialDashboard, type MonthlyTrend } from '@/hooks/useFinancialDashboard'
import { useHasPermission } from '@/hooks/usePermissions'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import {
  ArrowDownLeft, ArrowUpRight, AlertTriangle, ArrowRight,
  TrendingUp, TrendingDown, Wallet, CircleDollarSign, Clock, Lock,
} from 'lucide-react'

// ─── Utils ────────────────────────────────────────────────────────────────

function compactMoney(n: number): string {
  if (n === 0) return '0'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(0)
}

function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : null
  return ((curr - prev) / prev) * 100
}

// ─── Trend Chart ──────────────────────────────────────────────────────────

function TrendChart({ data }: { data: MonthlyTrend[] }) {
  const max = Math.max(...data.flatMap((d) => [d.invoiced, d.billed]), 1)
  const allZero = data.every((d) => d.invoiced === 0 && d.billed === 0)

  // Grow bars from 0 → target on mount for a smooth entrance
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setGrown(true), 60)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3 sm:gap-6 h-48 2xl:h-64">
        {data.map((d, i) => {
          const salesPct = (d.invoiced / max) * 100
          const purchPct = (d.billed / max) * 100
          const isCurrent = i === data.length - 1
          return (
            <div key={d.label} className="flex-1 flex flex-col items-center gap-2 min-w-0">
              {/* Numbers on top */}
              <div className="flex items-end gap-1 sm:gap-2 w-full justify-center min-h-[28px]">
                <span className={cn(
                  'text-[10px] sm:text-xs 2xl:text-sm font-medium tabular-nums transition-opacity duration-500',
                  d.invoiced > 0 ? 'text-emerald-700 opacity-100' : 'text-muted-foreground/40',
                  !grown && 'opacity-0',
                )}>
                  {d.invoiced > 0 ? compactMoney(d.invoiced) : '—'}
                </span>
                <span className={cn(
                  'text-[10px] sm:text-xs 2xl:text-sm font-medium tabular-nums transition-opacity duration-500',
                  d.billed > 0 ? 'text-red-700 opacity-100' : 'text-muted-foreground/40',
                  !grown && 'opacity-0',
                )}>
                  {d.billed > 0 ? compactMoney(d.billed) : '—'}
                </span>
              </div>
              {/* Bar pair */}
              <div className="flex items-end justify-center gap-1 sm:gap-1.5 w-full h-32 2xl:h-44 border-b border-border/40">
                <div className="flex-1 max-w-[24px] 2xl:max-w-[32px] h-full flex items-end">
                  <div
                    className="w-full bg-gradient-to-t from-emerald-500 to-emerald-400 hover:from-emerald-600 hover:to-emerald-500 rounded-t-sm shadow-sm transition-[height,background-color] duration-700 ease-out"
                    style={{
                      height: grown ? `${Math.max(salesPct, d.invoiced > 0 ? 2 : 0)}%` : '0%',
                      transitionDelay: `${i * 60}ms`,
                    }}
                    title={`Sales: ${formatCurrency(d.invoiced, 'QAR')}`}
                  />
                </div>
                <div className="flex-1 max-w-[24px] 2xl:max-w-[32px] h-full flex items-end">
                  <div
                    className="w-full bg-gradient-to-t from-red-500 to-red-400 hover:from-red-600 hover:to-red-500 rounded-t-sm shadow-sm transition-[height,background-color] duration-700 ease-out"
                    style={{
                      height: grown ? `${Math.max(purchPct, d.billed > 0 ? 2 : 0)}%` : '0%',
                      transitionDelay: `${i * 60 + 80}ms`,
                    }}
                    title={`Purchase: ${formatCurrency(d.billed, 'QAR')}`}
                  />
                </div>
              </div>
              <span className={cn(
                'text-[10px] sm:text-xs 2xl:text-sm transition-colors',
                isCurrent ? 'font-semibold text-foreground' : 'text-muted-foreground',
              )}>
                {d.label}
              </span>
            </div>
          )
        })}
      </div>

      {allZero && (
        <p className="text-center text-xs text-muted-foreground italic">
          No invoiced or billed activity in the last 6 months
        </p>
      )}
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────

function KpiCard({
  href,
  icon,
  iconBg,
  label,
  value,
  valueClass,
  footer,
  delay = 0,
}: {
  href?: string
  icon: React.ReactNode
  iconBg: string
  label: string
  value: string
  valueClass?: string
  footer?: React.ReactNode
  delay?: number
}) {
  const inner = (
    <Card
      className={cn(
        'h-full transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 fill-mode-both',
        href && 'hover:shadow-lg hover:-translate-y-0.5 hover:border-primary/30 cursor-pointer',
      )}
      style={{ animationDelay: `${delay}ms`, animationDuration: '500ms' }}
    >
      <CardContent className="pt-1 h-full flex flex-col">
        <div className="flex items-start gap-3">
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-transform', iconBg)}>
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs 2xl:text-sm text-muted-foreground">{label}</p>
              {href && <ArrowRight className="h-3 w-3 text-muted-foreground/50" />}
            </div>
            <p className={cn('text-xl 2xl:text-2xl font-bold tabular-nums truncate mt-0.5', valueClass)}>
              {value}
            </p>
          </div>
        </div>
        {footer && <div className="mt-3 pt-3 border-t border-border/50 min-h-[28px]">{footer}</div>}
      </CardContent>
    </Card>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
      </div>
      <Skeleton className="h-80 w-full rounded-xl" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function FinancialDashboardPage() {
  const canView = useHasPermission(['reports.view', 'reports.dashboard.view'])
  const { data, isLoading } = useFinancialDashboard()

  if (!canView) {
    return (
      <PageWrapper>
        <PageHeader title="Financial Dashboard" description="Receivables, payables and cash movement" />
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Lock className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">You don&apos;t have permission to view this report.</p>
        </div>
      </PageWrapper>
    )
  }

  if (isLoading || !data) {
    return (
      <PageWrapper>
        <PageHeader title="Financial Dashboard" description="Receivables, payables and cash movement" />
        <LoadingSkeleton />
      </PageWrapper>
    )
  }

  const { receivables, payables, cash_this_month, monthly_trend, top_overdue_customers, top_overdue_suppliers } = data
  const cashInPct  = pctChange(cash_this_month.in,  cash_this_month.in_prev)
  const cashOutPct = pctChange(cash_this_month.out, cash_this_month.out_prev)

  return (
    <PageWrapper>
      <PageHeader title="Financial Dashboard" description="Receivables, payables and cash movement" />

      {/* ── Cross-report link ─────────────────────────────────────── */}
      <Link
        href="/reports/product-profitability"
        className="group inline-flex items-center gap-1.5 text-xs text-primary hover:underline transition-transform hover:translate-x-0.5 self-start"
      >
        <span>View product-level profit &amp; COGS report</span>
        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
      </Link>

      {/* ── KPI Row ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          delay={0}
          href="/sales/aging-report"
          icon={<ArrowDownLeft className="h-5 w-5 text-emerald-600" />}
          iconBg="bg-emerald-100"
          label="Money Coming In"
          value={formatCurrency(receivables.total, 'QAR')}
          valueClass="text-emerald-700"
          footer={
            receivables.overdue > 0 ? (
              <div className="flex items-center gap-1.5 text-xs text-red-600">
                <AlertTriangle className="h-3 w-3" />
                <span className="truncate">{formatCurrency(receivables.overdue, 'QAR')} overdue ({receivables.overdue_count})</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span>All invoices up to date</span>
              </div>
            )
          }
        />

        <KpiCard
          delay={80}
          href="/purchase/aging-report"
          icon={<ArrowUpRight className="h-5 w-5 text-red-600" />}
          iconBg="bg-red-100"
          label="Money Going Out"
          value={formatCurrency(payables.total, 'QAR')}
          valueClass="text-red-700"
          footer={
            payables.overdue > 0 ? (
              <div className="flex items-center gap-1.5 text-xs text-red-600">
                <AlertTriangle className="h-3 w-3" />
                <span className="truncate">{formatCurrency(payables.overdue, 'QAR')} overdue ({payables.overdue_count})</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span>All bills up to date</span>
              </div>
            )
          }
        />

        <KpiCard
          delay={160}
          icon={<Wallet className="h-5 w-5 text-emerald-600" />}
          iconBg="bg-emerald-100"
          label="Cash In (This Month)"
          value={formatCurrency(cash_this_month.in, 'QAR')}
          valueClass="text-emerald-700"
          footer={
            cashInPct !== null && cashInPct !== 0 ? (
              <div className={cn(
                'inline-flex items-center gap-1 text-xs font-medium',
                cashInPct > 0 ? 'text-emerald-600' : 'text-red-600',
              )}>
                {cashInPct > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                <span>{Math.abs(cashInPct).toFixed(0)}% vs last month</span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">No change vs last month</span>
            )
          }
        />

        <KpiCard
          delay={240}
          icon={<CircleDollarSign className="h-5 w-5 text-red-600" />}
          iconBg="bg-red-100"
          label="Cash Out (This Month)"
          value={formatCurrency(cash_this_month.out, 'QAR')}
          valueClass="text-red-700"
          footer={
            cashOutPct !== null && cashOutPct !== 0 ? (
              <div className={cn(
                'inline-flex items-center gap-1 text-xs font-medium',
                cashOutPct > 0 ? 'text-red-600' : 'text-emerald-600',
              )}>
                {cashOutPct > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                <span>{Math.abs(cashOutPct).toFixed(0)}% vs last month</span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">No change vs last month</span>
            )
          }
        />
      </div>

      {/* ── Monthly Trend chart ───────────────────────────────────── */}
      <Card className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both" style={{ animationDelay: '320ms', animationDuration: '500ms' }}>
        <CardContent className="pt-1">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-base font-semibold">Monthly Trend</h3>
              <p className="text-xs text-muted-foreground">Sales invoiced vs purchases billed — last 6 months</p>
            </div>
            <div className="flex gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" />
                <span className="text-muted-foreground">Sales</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-red-400" />
                <span className="text-muted-foreground">Purchases</span>
              </span>
            </div>
          </div>
          <TrendChart data={monthly_trend} />
        </CardContent>
      </Card>

      {/* ── Top Overdue tables ────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both" style={{ animationDelay: '400ms', animationDuration: '500ms' }}>
          <CardContent className="pt-1">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-semibold">Customers Overdue</h3>
                <p className="text-xs text-muted-foreground">People who owe you money past due</p>
              </div>
              <Link href="/sales/aging-report" className="text-xs text-primary hover:underline inline-flex items-center gap-1 transition-transform hover:translate-x-0.5">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {top_overdue_customers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 mb-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                </div>
                <p className="text-sm text-muted-foreground">All customers up to date</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-center hidden sm:table-cell">Overdue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {top_overdue_customers.map((c, i) => (
                      <TableRow
                        key={c.id}
                        className="animate-in fade-in slide-in-from-left-1 fill-mode-both transition-colors"
                        style={{ animationDelay: `${480 + i * 60}ms`, animationDuration: '400ms' }}
                      >
                        <TableCell>
                          <div className="font-medium">{c.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {c.invoice_count} invoice{c.invoice_count !== 1 ? 's' : ''} · Oldest {formatDate(c.oldest_due)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-red-600 font-semibold whitespace-nowrap">
                          {formatCurrency(c.amount, 'QAR')}
                        </TableCell>
                        <TableCell className="text-center hidden sm:table-cell">
                          <Badge variant="outline" className={cn('text-xs', {
                            'border-amber-200 text-amber-700 bg-amber-50': c.days_overdue <= 30,
                            'border-orange-200 text-orange-700 bg-orange-50': c.days_overdue > 30 && c.days_overdue <= 60,
                            'border-red-200 text-red-700 bg-red-50': c.days_overdue > 60,
                          })}>
                            <Clock className="h-3 w-3 mr-1" />{c.days_overdue}d
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both" style={{ animationDelay: '480ms', animationDuration: '500ms' }}>
          <CardContent className="pt-1">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-semibold">Suppliers Overdue</h3>
                <p className="text-xs text-muted-foreground">Vendors you owe money to past due</p>
              </div>
              <Link href="/purchase/aging-report" className="text-xs text-primary hover:underline inline-flex items-center gap-1 transition-transform hover:translate-x-0.5">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {top_overdue_suppliers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 mb-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                </div>
                <p className="text-sm text-muted-foreground">All suppliers up to date</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-center hidden sm:table-cell">Overdue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {top_overdue_suppliers.map((s, i) => (
                      <TableRow
                        key={s.id}
                        className="animate-in fade-in slide-in-from-left-1 fill-mode-both transition-colors"
                        style={{ animationDelay: `${560 + i * 60}ms`, animationDuration: '400ms' }}
                      >
                        <TableCell>
                          <div className="font-medium">{s.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {s.bill_count} bill{s.bill_count !== 1 ? 's' : ''} · Oldest {formatDate(s.oldest_due)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-red-600 font-semibold whitespace-nowrap">
                          {formatCurrency(s.amount, 'QAR')}
                        </TableCell>
                        <TableCell className="text-center hidden sm:table-cell">
                          <Badge variant="outline" className={cn('text-xs', {
                            'border-amber-200 text-amber-700 bg-amber-50': s.days_overdue <= 30,
                            'border-orange-200 text-orange-700 bg-orange-50': s.days_overdue > 30 && s.days_overdue <= 60,
                            'border-red-200 text-red-700 bg-red-50': s.days_overdue > 60,
                          })}>
                            <Clock className="h-3 w-3 mr-1" />{s.days_overdue}d
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageWrapper>
  )
}
