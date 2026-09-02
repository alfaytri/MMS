'use client'

import { CheckCircle2, FileText, Loader2, Receipt } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { useTlInvoiceByVisit } from '@/hooks/useTlInvoices'
import { useVisitCompletion } from '@/hooks/useTlActions'
import type { TlVisit } from '@/types/team-leader'

const STATUS_STYLE: Record<'unpaid' | 'partial' | 'paid', string> = {
  unpaid:  'bg-muted text-muted-foreground',
  partial: 'bg-amber-100 text-amber-700',
  paid:    'bg-emerald-100 text-emerald-700',
}

interface Props {
  visit:        TlVisit | null
  open:         boolean
  onOpenChange: (v: boolean) => void
}

export function ReviewWorkDialog({ visit, open, onOpenChange }: Props) {
  const { data: invoice, isLoading } = useTlInvoiceByVisit(open ? visit?.id : null)
  const { data: completion } = useVisitCompletion(open ? (visit?.id ?? null) : null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] flex flex-col">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            Review Work
          </DialogTitle>
          <DialogDescription className="text-sm">
            {visit?.customer_name ?? ''}
            {visit?.order_id ? <> · <span className="font-mono">{visit.order_id}</span></> : null}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 py-3 pr-1">
          {/* Visit summary */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Visit date</span>
              <span className="font-medium">{visit ? formatDate(visit.date) : '—'}</span>
            </div>
            {visit?.scheduled_time && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Time</span>
                <span className="font-medium">{visit.scheduled_time}</span>
              </div>
            )}
            {visit?.address && (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground shrink-0">Address</span>
                <span className="font-medium text-right">{visit.address}</span>
              </div>
            )}
          </div>

          {/* Work record — persisted field data captured at completion (E) */}
          {completion && (
            <div className="rounded-lg border p-4 space-y-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Work Record
              </div>
              {visit && completion.service_statuses && Object.keys(completion.service_statuses).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {visit.services.map((s) => {
                    const st = completion.service_statuses?.[s.id]
                    return (
                      <Badge key={s.id} variant="outline" className="text-[11px]">
                        {(s.name.split('/').pop() ?? s.name)}: {st ?? '—'}
                      </Badge>
                    )
                  })}
                </div>
              )}
              {completion.notes && (
                <p className="text-sm"><span className="text-muted-foreground">Notes: </span>{completion.notes}</p>
              )}
              {completion.damage_report?.noted && (
                <p className="text-sm text-amber-700">
                  Damage noted{completion.damage_report.description ? `: ${completion.damage_report.description}` : ''}
                </p>
              )}
              {(completion.photo_urls?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-2">
                  {completion.photo_urls!.map((u, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={u} alt="work photo" className="h-16 w-16 rounded object-cover border" />
                  ))}
                </div>
              )}
              {completion.signature_url && (
                <div>
                  <div className="text-[11px] text-muted-foreground mb-1">Signature</div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={completion.signature_url} alt="signature" className="h-16 rounded border bg-white" />
                </div>
              )}
            </div>
          )}

          {/* Invoice section (only when tl_invoices row exists) */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading invoice…
            </div>
          ) : invoice ? (
            <>
              {/* Invoice header */}
              <div className="rounded-lg border p-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Invoice
                    </div>
                    <p className="mt-1 font-mono text-base font-semibold">{invoice.invoice_number}</p>
                  </div>
                  <Badge className={cn('text-xs px-2.5 py-1', STATUS_STYLE[invoice.payment_status])}>
                    {invoice.payment_status.toUpperCase()}
                  </Badge>
                </div>

                {/* Lines */}
                <div className="border-t pt-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Services
                  </div>
                  <div className="space-y-1.5">
                    {invoice.lines.map((l) => (
                      <div key={l.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-4 text-sm">
                        <span className="truncate">{l.name}</span>
                        <span className="tabular-nums text-muted-foreground">{l.qty}</span>
                        <span className="tabular-nums text-muted-foreground">× {formatCurrency(l.unit_price)}</span>
                        <span className="tabular-nums font-medium">{formatCurrency(l.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Totals */}
                <div className="border-t pt-3 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="tabular-nums">{formatCurrency(invoice.subtotal)}</span>
                  </div>
                  {invoice.discount_amount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Discount</span>
                      <span className="tabular-nums">− {formatCurrency(invoice.discount_amount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold text-base">
                    <span>Total</span>
                    <span className="tabular-nums">{formatCurrency(invoice.total_amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Paid</span>
                    <span className="tabular-nums text-emerald-600 font-medium">{formatCurrency(invoice.paid_amount)}</span>
                  </div>
                  {invoice.total_amount - invoice.paid_amount > 0 && (
                    <div className="flex justify-between font-semibold text-base">
                      <span className="text-amber-700">Remaining</span>
                      <span className="tabular-nums text-amber-700">
                        {formatCurrency(invoice.total_amount - invoice.paid_amount)}
                      </span>
                    </div>
                  )}
                </div>

                {invoice.payment_method_name && (
                  <div className="border-t pt-3 flex justify-between text-sm">
                    <span className="text-muted-foreground">Method</span>
                    <span className="font-medium">{invoice.payment_method_name}</span>
                  </div>
                )}
              </div>

              {/* Payments log */}
              {invoice.payments.length > 0 && (
                <div className="rounded-lg border p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Payment History
                  </div>
                  <div className="space-y-2">
                    {invoice.payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Badge variant="outline" className="text-[11px] px-1.5 shrink-0">
                            {formatDate(p.paid_at)}
                          </Badge>
                          <span className="text-muted-foreground truncate">
                            {p.method_name ?? p.method_slug ?? '—'}
                          </span>
                          {p.registered_by_name && (
                            <span className="text-muted-foreground text-xs">· by {p.registered_by_name}</span>
                          )}
                        </div>
                        <span className="tabular-nums font-medium shrink-0">
                          {formatCurrency(p.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* View PDF button */}
              <a
                href={`/api/orders/invoices/${invoice.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border bg-primary/5 px-4 py-3 text-sm font-semibold text-primary hover:bg-primary/10 transition-colors min-h-11"
              >
                <FileText className="h-4 w-4" /> View Invoice PDF
              </a>
            </>
          ) : (
            // No invoice — non-order visit types
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2 mb-2">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  No invoice created for this visit yet.
                </span>
              </div>
              {visit && visit.services.length > 0 && (
                <>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 mt-2">
                    Services Delivered
                  </div>
                  <ul className="space-y-0.5 text-xs">
                    {visit.services.map((s) => (
                      <li key={s.id} className="flex items-start gap-1.5">
                        <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                        <span>{s.name}{s.qty > 1 ? ` (${s.qty})` : ''}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
