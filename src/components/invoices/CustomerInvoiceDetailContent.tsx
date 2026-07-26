'use client'

import { useMemo } from 'react'
import { Phone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import type {
  CustomerPending,
} from '@/hooks/usePendingPayments'

const SOURCE_COLORS: Record<string, string> = {
  order:     'bg-blue-100 text-blue-700',
  contract:  'bg-emerald-100 text-emerald-700',
  quotation: 'bg-amber-100 text-amber-700',
  sale:      'bg-amber-100 text-amber-700',
  purchase:  'bg-purple-100 text-purple-700',
}

interface Props {
  customer: CustomerPending
}

export function CustomerInvoiceDetailContent({ customer }: Props) {
  const unpaid = useMemo(
    () => customer.invoices.filter((inv) => inv.total_amount - inv.paid_amount > 0),
    [customer.invoices],
  )

  const outstandingTotal = useMemo(
    () => unpaid.reduce((s, i) => s + (i.total_amount - i.paid_amount), 0),
    [unpaid],
  )

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="px-4 py-3 md:px-6 border-b bg-background">
        <h2 className="text-lg md:text-xl 2xl:text-2xl font-semibold truncate">
          {customer.customer_name}
        </h2>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {customer.phones.length === 0 ? (
            <span className="text-xs text-muted-foreground">No phone on file</span>
          ) : (
            customer.phones.map((p) => (
              <Badge
                key={p.id}
                variant="outline"
                className="font-mono text-xs gap-1 px-1.5 py-0.5"
              >
                <Phone className="h-3 w-3" />
                {p.phone}
                {p.is_primary && (
                  <span className="text-[10px] text-primary font-semibold">·primary</span>
                )}
                {p.label && <span className="text-[10px] text-muted-foreground">·{p.label}</span>}
              </Badge>
            ))
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          Outstanding:{' '}
          <span className="font-semibold text-foreground">
            {formatCurrency(outstandingTotal, 'QAR')}
          </span>
        </p>
      </div>

      {/* ── Pending invoices ───────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-3">
        {unpaid.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No pending invoices
          </p>
        ) : (
          <div className="space-y-2">
            {unpaid.map((inv) => {
              const remaining = inv.total_amount - inv.paid_amount
              const paidPct =
                inv.total_amount > 0
                  ? (inv.paid_amount / inv.total_amount) * 100
                  : 0
              const isOverdue = inv.payment_status === 'overdue'
              return (
                <div
                  key={inv.id}
                  className={cn(
                    'w-full text-left rounded-lg border p-3 space-y-2 min-h-11',
                    'border-border',
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-sm font-semibold">
                          {inv.invoice_id}
                        </span>
                        {inv.division_name && (
                          <Badge variant="outline" className="text-[10px]">
                            {inv.division_name}
                          </Badge>
                        )}
                        {inv.source_type && (
                          <Badge
                            className={cn(
                              'text-[10px] px-1.5 py-0',
                              SOURCE_COLORS[inv.source_type] ??
                                'bg-muted text-muted-foreground',
                            )}
                          >
                            {inv.source_type}
                          </Badge>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span>Issued {formatDate(inv.issued_date)}</span>
                        <span className={cn(isOverdue && 'text-destructive font-medium')}>
                          Due {formatDate(inv.due_date)}
                          {isOverdue && ' · overdue'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span>
                          Paid {formatCurrency(inv.paid_amount, 'QAR')} /{' '}
                          {formatCurrency(inv.total_amount, 'QAR')}
                        </span>
                        <span className="font-semibold text-destructive">
                          {formatCurrency(remaining, 'QAR')} due
                        </span>
                      </div>
                      <Progress value={paidPct} className="h-1.5" />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
