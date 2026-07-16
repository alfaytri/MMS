'use client'
import { useState } from 'react'
import { CheckCircle2, ChevronDown, CreditCard, Eye, FileText, Phone, User, Wallet } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import type { TlInvoice } from '@/hooks/useTlInvoices'

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  unpaid:  { label: 'Unpaid',  color: 'bg-muted text-muted-foreground',  icon: FileText },
  partial: { label: 'Partial', color: 'bg-amber-100 text-amber-700',     icon: CreditCard },
  paid:    { label: 'Paid',    color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
}

interface Props {
  invoice: TlInvoice
  onViewPayments: (invoice: TlInvoice) => void
  onRegisterPayment: (invoice: TlInvoice) => void
}

export function TlInvoiceCard({ invoice, onViewPayments, onRegisterPayment }: Props) {
  const [expanded, setExpanded] = useState(false)
  const status    = STATUS_CONFIG[invoice.payment_status] ?? STATUS_CONFIG.unpaid
  const total     = invoice.total_amount
  const paid      = invoice.paid_amount
  const remaining = Math.max(0, total - paid)
  const paidPct   = total > 0 ? Math.min(100, (paid / total) * 100) : 0

  return (
    <div className="border rounded-lg bg-card">
      <button type="button" onClick={() => setExpanded((v) => !v)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left min-h-11">
        <div className={cn('h-2.5 w-2.5 rounded-sm shrink-0', status.color.split(' ')[0])} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-sm font-semibold">{invoice.invoice_number}</span>
            <Badge className={cn('text-[10px] px-1.5 py-0', status.color)}>{status.label}</Badge>
            {invoice.order_id && (
              <span className="text-[11px] text-muted-foreground">· {invoice.order_id}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><User className="h-3 w-3" /> {invoice.customer_name}</span>
            {invoice.customer_phone && (
              <span className="hidden sm:flex items-center gap-1"><Phone className="h-3 w-3" /> {invoice.customer_phone}</span>
            )}
          </div>
        </div>
        <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
          <div className="w-24"><Progress value={paidPct} className="h-[3px]" /></div>
          {remaining > 0 && (
            <span className="text-[10px] text-muted-foreground">{formatCurrency(remaining)} remaining</span>
          )}
        </div>
        <div className="text-right shrink-0 hidden md:block">
          <p className="text-sm font-semibold">{formatCurrency(total)}</p>
          <p className="text-[10px] text-muted-foreground">{formatDate(invoice.created_at)}</p>
        </div>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground shrink-0 transition-transform', expanded && 'rotate-180')} />
      </button>

      <div className="flex flex-wrap items-center gap-2 px-4 pb-3 -mt-1">
        <a
          href={`/api/orders/invoices/${invoice.id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          <Button variant="outline" size="sm" className="text-xs h-7 gap-1">
            <FileText className="h-3 w-3" /> View PDF
          </Button>
        </a>
        <Button variant="outline" size="sm" className="text-xs h-7 gap-1"
                onClick={() => onViewPayments(invoice)}>
          <Eye className="h-3 w-3" /> View Payments
        </Button>
        {remaining > 0 && (
          <Button variant="default" size="sm" className="text-xs h-7 gap-1"
                  onClick={() => onRegisterPayment(invoice)}>
            <Wallet className="h-3 w-3" /> Register Payment
          </Button>
        )}
      </div>

      {expanded && (
        <div className="border-t px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-2">Line Items</h4>
            <div className="space-y-1">
              {invoice.lines.map((li) => (
                <div key={li.id} className="flex justify-between text-xs">
                  <span className="truncate mr-2">{li.name}</span>
                  <span className="shrink-0 font-mono">{li.qty} × {formatCurrency(li.unit_price)}</span>
                </div>
              ))}
              {invoice.discount_amount > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Discount</span>
                  <span>− {formatCurrency(invoice.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-xs font-semibold border-t pt-1 mt-1">
                <span>Total</span><span>{formatCurrency(total)}</span>
              </div>
            </div>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-2">Payment History</h4>
            {invoice.payments.length === 0 ? (
              <p className="text-xs text-muted-foreground">No payments recorded</p>
            ) : (
              <div className="space-y-1.5">
                {invoice.payments.map((p) => (
                  <div key={p.id} className="flex justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px] px-1">{formatDate(p.paid_at)}</Badge>
                      <span className="text-muted-foreground">{p.method_slug ?? '—'}</span>
                    </div>
                    <span className="font-mono">{formatCurrency(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            {remaining > 0 && (
              <div className="mt-2 rounded bg-amber-50 border border-amber-200 px-2 py-1.5 text-xs text-amber-800">
                Balance: {formatCurrency(remaining)}
              </div>
            )}
          </div>
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-2">Details</h4>
            {invoice.created_by_name && (
              <p className="text-xs"><span className="text-muted-foreground">Created by:</span> {invoice.created_by_name}</p>
            )}
            {invoice.payment_method_name && (
              <p className="text-xs"><span className="text-muted-foreground">Method:</span> {invoice.payment_method_name}</p>
            )}
            {invoice.notes && (
              <div className="mt-1 rounded bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">{invoice.notes}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
