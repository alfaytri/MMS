'use client'

/**
 * Detail view of a customer's credit utilization.
 *
 * Renders:
 *   1. Overall segmented bar — Paid (green) / Outstanding (amber) /
 *      Unused (gray) across the entire credit_limit.
 *   2. Per-order stack — one row per non-cancelled SO with SO#, date,
 *      total, its own paid/outstanding mini-bar, and age in days.
 *
 * The overall bar is *capped at the credit_limit*: when SUM(total) has
 * blown past the limit, the "unused" slice disappears and the outstanding
 * slice tells the operator exactly which orders drove that.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { useCustomerOpenOrders } from '@/hooks/useCustomerOpenOrders'
import type { CustomerCreditSummary } from '@/hooks/useCustomerCredit'
import { format } from 'date-fns'

interface Props {
  open:      boolean
  onOpenChange: (open: boolean) => void
  summary:   CustomerCreditSummary | null
}

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

const STATUS_TONE: Record<string, string> = {
  quotation:         'border-slate-300 text-slate-700 bg-slate-50',
  pending_approval:  'border-amber-400 text-amber-700 bg-amber-50',
  confirmed:         'border-blue-400 text-blue-700 bg-blue-50',
  partial_delivery:  'border-blue-400 text-blue-700 bg-blue-50',
  delivered:         'border-emerald-400 text-emerald-700 bg-emerald-50',
  invoiced:          'border-emerald-400 text-emerald-700 bg-emerald-50',
  closed:            'border-slate-300 text-slate-700 bg-slate-50',
}

export function CreditUtilizationDetailDialog({ open, onOpenChange, summary }: Props) {
  const { data: orders = [], isLoading } = useCustomerOpenOrders(open ? summary?.customer_id : null)

  if (!summary) return null

  const limit       = Number(summary.credit_limit ?? 0)
  const outstanding = Number(summary.credit_used  ?? 0)
  // Paid-across-open-orders comes from summing `paid_amount` on the fetched SOs.
  const paidAcross  = orders.reduce((s, o) => s + o.paid_amount, 0)
  // Bar caps at the limit — anything above it is over-limit and gets its own
  // callout below.
  const paidClamped = Math.min(paidAcross, Math.max(0, limit - Math.min(outstanding, limit)))
  const outClamped  = Math.min(outstanding, Math.max(0, limit - paidClamped))
  const unused      = Math.max(0, limit - paidClamped - outClamped)
  const overLimit   = Math.max(0, outstanding - limit)

  const pct = (n: number) => (limit > 0 ? (n / limit) * 100 : 0)

  // Open orders = anything not cancelled AND not fully paid AND still active.
  const openOrders = orders
    .filter((o) => o.status !== 'cancelled' && o.status !== 'closed')
    .filter((o) => o.paid_amount + 0.001 < o.total)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <span>Credit Utilization</span>
            <span className="text-sm font-normal text-muted-foreground">— {summary.customer_name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-2">
          {/* Overall stat strip */}
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="Credit limit"  value={formatCurrency(limit, 'QAR')} tone="muted" />
            <StatTile label="Outstanding"   value={formatCurrency(outstanding, 'QAR')} tone={outstanding >= limit ? 'destructive' : 'amber'} />
            <StatTile label="Available"     value={formatCurrency(Math.max(0, limit - outstanding), 'QAR')} tone={outstanding >= limit ? 'destructive' : 'emerald'} />
          </div>

          {/* Overall segmented bar */}
          {limit > 0 && (
            <section className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Overall
              </h4>
              <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted flex">
                {paidClamped > 0 && (
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${pct(paidClamped)}%` }}
                    title={`Paid ${formatCurrency(paidClamped, 'QAR')}`}
                  />
                )}
                {outClamped > 0 && (
                  <div
                    className="h-full bg-amber-500 transition-all"
                    style={{ width: `${pct(outClamped)}%` }}
                    title={`Outstanding ${formatCurrency(outClamped, 'QAR')}`}
                  />
                )}
                {unused > 0 && (
                  <div
                    className="h-full bg-slate-200 dark:bg-slate-700 transition-all"
                    style={{ width: `${pct(unused)}%` }}
                    title={`Unused ${formatCurrency(unused, 'QAR')}`}
                  />
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                <LegendDot color="bg-emerald-500" label="Paid"        value={paidClamped} pct={pct(paidClamped)} />
                <LegendDot color="bg-amber-500"   label="Outstanding" value={outClamped}  pct={pct(outClamped)} />
                <LegendDot color="bg-slate-300"   label="Unused"      value={unused}       pct={pct(unused)} />
              </div>
              {overLimit > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  <strong>Over limit by {formatCurrency(overLimit, 'QAR')}.</strong>{' '}
                  Outstanding exceeds the credit limit — new confirmed orders
                  will route through the approval chain.
                </div>
              )}
            </section>
          )}

          {/* Per-order stack */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Open orders ({openOrders.length})
              </h4>
              <span className="text-[11px] text-muted-foreground">
                sorted newest first
              </span>
            </div>

            {isLoading ? (
              <div className="text-sm text-muted-foreground py-4 text-center">Loading…</div>
            ) : openOrders.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">
                No open orders. {outstanding > 0 && 'Outstanding may be tied to cancelled or archived orders.'}
              </div>
            ) : (
              <ul className="space-y-2">
                {openOrders.map((o) => {
                  const totalQar = o.total * (o.exchange_rate || 1)
                  const paidPct  = o.total > 0 ? Math.min(100, (o.paid_amount / o.total) * 100) : 0
                  const age      = daysSince(o.created_at)
                  return (
                    <li key={o.id} className="rounded-md border border-border p-3 bg-background">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold tabular-nums">{o.so_number}</span>
                            <Badge variant="outline" className={cn('text-[9px] capitalize', STATUS_TONE[o.status] ?? 'border-slate-300 text-slate-700 bg-slate-50')}>
                              {o.status.replace(/_/g, ' ')}
                            </Badge>
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {format(new Date(o.created_at), 'dd MMM yyyy')} · {age} day{age === 1 ? '' : 's'} old
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-semibold tabular-nums">
                            {formatCurrency(o.total, o.currency)}
                          </div>
                          {o.currency !== 'QAR' && (
                            <div className="text-[10px] text-muted-foreground tabular-nums">
                              ≈ {formatCurrency(totalQar, 'QAR')}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            'h-full transition-all',
                            paidPct >= 100 ? 'bg-emerald-500' : paidPct > 0 ? 'bg-blue-500' : 'bg-amber-500',
                          )}
                          style={{ width: `${Math.max(2, paidPct)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-1 tabular-nums">
                        <span>Paid {formatCurrency(o.paid_amount, o.currency)}</span>
                        <span>Outstanding {formatCurrency(Math.max(0, o.total - o.paid_amount), o.currency)}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function StatTile({
  label, value, tone,
}: {
  label: string
  value: string
  tone:  'muted' | 'amber' | 'emerald' | 'destructive'
}) {
  const toneClass =
    tone === 'destructive' ? 'text-destructive' :
    tone === 'amber'       ? 'text-amber-700 dark:text-amber-400' :
    tone === 'emerald'     ? 'text-emerald-700 dark:text-emerald-400' :
                             'text-foreground'
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn('text-sm font-semibold tabular-nums mt-0.5', toneClass)}>{value}</div>
    </div>
  )
}

function LegendDot({
  color, label, value, pct,
}: {
  color: string
  label: string
  value: number
  pct:   number
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-2 w-2 rounded-full', color)} />
      <span>{label}</span>
      <span className="tabular-nums font-medium text-foreground">
        {formatCurrency(value, 'QAR')}
      </span>
      <span className="tabular-nums">({pct.toFixed(0)}%)</span>
    </span>
  )
}
