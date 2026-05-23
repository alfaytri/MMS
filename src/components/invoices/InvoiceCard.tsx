// src/components/invoices/InvoiceCard.tsx
'use client'

import { useState } from 'react'
import {
  AlertTriangle, Ban, BookOpen, CheckCircle2,
  ChevronDown, CreditCard, FileText, Phone,
  Receipt, Send, Undo2, User, XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { differenceInDays } from 'date-fns'
import type { FinanceInvoice } from '@/hooks/useInvoices'

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft:          { label: 'Draft',         color: 'bg-slate-100 text-slate-600',    icon: FileText },
  sent:           { label: 'Sent',          color: 'bg-blue-100 text-blue-700',      icon: Send },
  partially_paid: { label: 'Partial',       color: 'bg-amber-100 text-amber-700',    icon: CreditCard },
  paid:           { label: 'Paid',          color: 'bg-emerald-100 text-emerald-700',icon: CheckCircle2 },
  overdue:        { label: 'Overdue',       color: 'bg-red-100 text-red-700',        icon: AlertTriangle },
  cancelled:      { label: 'Cancelled',     color: 'bg-slate-100 text-slate-500',    icon: XCircle },
  void:           { label: 'Void',          color: 'bg-slate-100 text-slate-500',    icon: Ban },
}

const SOURCE_COLORS: Record<string, string> = {
  order:    'bg-blue-100 text-blue-700',
  contract: 'bg-emerald-100 text-emerald-700',
  sale:     'bg-amber-100 text-amber-700',
  purchase: 'bg-purple-100 text-purple-700',
}

interface Props {
  invoice: FinanceInvoice
  selected: boolean
  onSelect: (id: string, checked: boolean) => void
  onVoid: (invoice: FinanceInvoice) => void
  onCreditNote: (invoice: FinanceInvoice) => void
}

export function InvoiceCard({ invoice, selected, onSelect, onVoid, onCreditNote }: Props) {
  const [expanded, setExpanded] = useState(false)
  const status = STATUS_CONFIG[invoice.payment_status] ?? STATUS_CONFIG.draft
  const StatusIcon = status.icon
  const total = invoice.total_amount ?? 0
  const paid = (invoice.payments ?? [])
    .filter((p) => p.status !== 'failed')
    .reduce((sum, p) => sum + p.amount, 0)
  const remaining = total - paid
  const paidPct = total > 0 ? (paid / total) * 100 : 0
  const isOverdue = invoice.payment_status === 'overdue'
  const overdueDays = isOverdue && invoice.due_date
    ? differenceInDays(new Date(), new Date(invoice.due_date))
    : 0
  const isSelectable = !invoice.qb_synced && invoice.status !== 'void' && invoice.status !== 'cancelled'
  const isDestructible = invoice.status !== 'void' && invoice.status !== 'cancelled'

  return (
    <div className="border rounded-lg bg-card">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full items-center gap-3 px-4 py-3 text-left min-h-11">
        {isSelectable && (
          <div onClick={(e) => e.stopPropagation()}>
            <Checkbox checked={selected} onCheckedChange={(v) => onSelect(invoice.id, v === true)} />
          </div>
        )}
        {invoice.qb_synced && (
          <Badge variant="outline" className="text-emerald-600 border-emerald-300 text-[10px] px-1.5">QB</Badge>
        )}
        <div className={cn('h-2.5 w-2.5 rounded-sm shrink-0', status.color.split(' ')[0])} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-sm font-semibold">{invoice.invoice_id}</span>
            <Badge className={cn('text-[10px] px-1.5 py-0', status.color)}>{status.label}</Badge>
            {invoice.source_type && (
              <Badge className={cn('text-[10px] px-1.5 py-0', SOURCE_COLORS[invoice.source_type] ?? 'bg-slate-100 text-slate-600')}>{invoice.source_type}</Badge>
            )}
            {isOverdue && overdueDays > 0 && (
              <Badge className="text-[10px] px-1.5 py-0 bg-red-100 text-red-700">{overdueDays}d overdue</Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
            {invoice.customer_name && (<span className="flex items-center gap-1"><User className="h-3 w-3" /> {invoice.customer_name}</span>)}
            {invoice.phone && (<span className="flex items-center gap-1 hidden sm:flex"><Phone className="h-3 w-3" /> {invoice.phone}</span>)}
          </div>
        </div>
        <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
          <div className="w-24">
            <Progress value={paidPct} className={cn('h-[3px]', isOverdue && 'bg-red-200 [&>div]:bg-red-500')} />
          </div>
          {remaining > 0 && (<span className="text-[10px] text-muted-foreground">{formatCurrency(remaining)} remaining</span>)}
        </div>
        <div className="text-right shrink-0 hidden md:block">
          <p className="text-sm font-semibold">{formatCurrency(total)}</p>
          <p className="text-[10px] text-muted-foreground">{formatDate(invoice.issued_date)}</p>
          {invoice.payment_status === 'paid' ? (
            <p className="text-[10px] text-emerald-600 font-medium">Paid in full</p>
          ) : isOverdue ? (
            <p className="text-[10px] text-red-600 font-medium">Due {formatDate(invoice.due_date)}</p>
          ) : (
            <p className="text-[10px] text-muted-foreground">Due {formatDate(invoice.due_date)}</p>
          )}
        </div>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground shrink-0 transition-transform', expanded && 'rotate-180')} />
      </button>

      {expanded && (
        <div className="border-t px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-2">Line Items</h4>
            <div className="space-y-1">
              {(invoice.invoice_line_items ?? []).map((li) => (
                <div key={li.id} className="flex justify-between text-xs">
                  <span className="truncate mr-2">{li.description}</span>
                  <span className="shrink-0 font-mono">{li.qty} × {formatCurrency(li.unit_price)}</span>
                </div>
              ))}
              <div className="flex justify-between text-xs font-semibold border-t pt-1 mt-1">
                <span>Total</span><span>{formatCurrency(total)}</span>
              </div>
            </div>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-2">Payment History</h4>
            {(invoice.payments ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">No payments recorded</p>
            ) : (
              <div className="space-y-1.5">
                {(invoice.payments ?? []).map((p) => (
                  <div key={p.id} className="flex justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px] px-1">{formatDate(p.date)}</Badge>
                      <span className="text-muted-foreground">{p.method}</span>
                    </div>
                    <span className="font-mono">{formatCurrency(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            {remaining > 0 && (
              <div className="mt-2 rounded bg-amber-50 border border-amber-200 px-2 py-1.5 text-xs text-amber-800">Balance: {formatCurrency(remaining)}</div>
            )}
          </div>
          <div className="space-y-3">
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">Details</h4>
              {invoice.source_type && (<p className="text-xs"><span className="text-muted-foreground">Source:</span> {invoice.source_type}</p>)}
              {invoice.agent_name && (<p className="text-xs"><span className="text-muted-foreground">Agent:</span> {invoice.agent_name}</p>)}
              {invoice.notes && (<div className="mt-1 rounded bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">{invoice.notes}</div>)}
            </div>
            {isDestructible && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50 text-xs h-8" onClick={(e) => { e.stopPropagation(); onVoid(invoice) }}>
                  <Ban className="h-3 w-3 mr-1" /> Void
                </Button>
                <Button variant="outline" size="sm" className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 text-xs h-8" onClick={(e) => { e.stopPropagation(); onCreditNote(invoice) }}>
                  <Undo2 className="h-3 w-3 mr-1" /> Credit Note
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
