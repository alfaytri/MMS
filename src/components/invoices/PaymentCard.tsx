// src/components/invoices/PaymentCard.tsx
'use client'

import { useState } from 'react'
import {
  Banknote, Building2, CheckCircle2, ChevronDown,
  Clock, CreditCard, FileText, Phone, QrCode,
  Receipt, Smartphone, User, XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import type { FinancePayment } from '@/hooks/usePayments'

// ── Status config ───────────────────────────────────────────────────────

const PAYMENT_STATUS_CONFIG: Record<string, {
  label: string
  color: string
  icon: React.ElementType
}> = {
  completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  pending:   { label: 'Pending',   color: 'bg-amber-100 text-amber-700',     icon: Clock },
  processing:{ label: 'Processing',color: 'bg-blue-100 text-blue-700',       icon: Clock },
  failed:    { label: 'Failed',    color: 'bg-red-100 text-red-700',         icon: XCircle },
  refunded:  { label: 'Refunded',  color: 'bg-slate-100 text-slate-600',     icon: XCircle },
}

const METHOD_CONFIG: Record<string, {
  label: string
  icon: React.ElementType
  color: string
}> = {
  cash:          { label: 'Cash',          icon: Banknote,   color: 'bg-emerald-100 text-emerald-700' },
  bank_transfer: { label: 'Bank Transfer', icon: Building2,  color: 'bg-blue-100 text-blue-700' },
  pdc:           { label: 'PDC',           icon: FileText,   color: 'bg-purple-100 text-purple-700' },
  cdc:           { label: 'CDC',           icon: FileText,   color: 'bg-purple-100 text-purple-700' },
  online:        { label: 'Online',        icon: Smartphone, color: 'bg-blue-100 text-blue-700' },
  fawran:        { label: 'Fawran',        icon: QrCode,     color: 'bg-emerald-100 text-emerald-700' },
  pos:           { label: 'POS',           icon: CreditCard, color: 'bg-amber-100 text-amber-700' },
  pay_later:     { label: 'Pay Later',     icon: Clock,      color: 'bg-amber-100 text-amber-700' },
}

const SOURCE_COLORS: Record<string, string> = {
  order:    'bg-blue-100 text-blue-700',
  contract: 'bg-emerald-100 text-emerald-700',
  sale:     'bg-amber-100 text-amber-700',
  purchase: 'bg-purple-100 text-purple-700',
}

// ── Props ───────────────────────────────────────────────────────────────

interface Props {
  payment: FinancePayment
  selected: boolean
  onSelect: (id: string, checked: boolean) => void
}

export function PaymentCard({ payment, selected, onSelect }: Props) {
  const [expanded, setExpanded] = useState(false)
  const status = PAYMENT_STATUS_CONFIG[payment.status ?? ''] ?? PAYMENT_STATUS_CONFIG.pending
  const StatusIcon = status.icon
  const method = METHOD_CONFIG[payment.method] ?? METHOD_CONFIG.cash
  const MethodIcon = method.icon
  const isFailed = payment.status === 'failed'
  const isSelectable = !payment.qb_synced && !isFailed
  const isCheque = payment.method === 'pdc' || payment.method === 'cdc'

  // Invoice balance info
  const invoiceRemaining =
    payment.invoice_total != null && payment.invoice_paid != null
      ? payment.invoice_total - payment.invoice_paid
      : null

  return (
    <div className="border rounded-lg bg-card">
      {/* ── Collapsed row ──────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left min-h-11"
      >
        {isSelectable && (
          <div onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={selected}
              onCheckedChange={(v) => onSelect(payment.id, v === true)}
            />
          </div>
        )}
        {payment.qb_synced && (
          <Badge variant="outline" className="text-emerald-600 border-emerald-300 text-[10px] px-1.5">
            QB
          </Badge>
        )}

        <div className={cn('h-2.5 w-2.5 rounded-sm shrink-0', status.color.split(' ')[0])} />

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-sm font-semibold">{payment.payment_id ?? '—'}</span>
            <Badge className={cn('text-[10px] px-1.5 py-0', status.color)}>{status.label}</Badge>
            <Badge className={cn('text-[10px] px-1.5 py-0', method.color)}>
              <MethodIcon className="h-3 w-3 mr-0.5" /> {method.label}
            </Badge>
            {payment.invoice_source_type && (
              <Badge className={cn('text-[10px] px-1.5 py-0', SOURCE_COLORS[payment.invoice_source_type] ?? 'bg-slate-100 text-slate-600')}>
                {payment.invoice_source_type}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
            {payment.customer_name && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" /> {payment.customer_name}
              </span>
            )}
            {payment.invoice_display && (
              <span className="flex items-center gap-1 hidden sm:flex">
                <Receipt className="h-3 w-3" /> {payment.invoice_display}
              </span>
            )}
            {payment.reference && (
              <span className="hidden md:inline">Ref: {payment.reference}</span>
            )}
            {payment.transaction_id && (
              <span className="hidden md:inline">Txn: {payment.transaction_id}</span>
            )}
            {payment.cheque_number && (
              <span className="hidden md:inline">Chq: {payment.cheque_number}</span>
            )}
          </div>
        </div>

        {/* Invoice balance */}
        <div className="hidden sm:block text-right shrink-0 mr-2">
          {payment.invoice_total != null && (
            <p className="text-xs text-muted-foreground">
              Inv: {formatCurrency(payment.invoice_total)}
            </p>
          )}
          {invoiceRemaining != null && invoiceRemaining <= 0 ? (
            <p className="text-[10px] text-emerald-600 font-medium">Fully paid</p>
          ) : invoiceRemaining != null ? (
            <p className="text-[10px] text-amber-600">Bal: {formatCurrency(invoiceRemaining)}</p>
          ) : null}
        </div>

        {/* Amount & date */}
        <div className="text-right shrink-0">
          <p className={cn(
            'text-sm font-semibold',
            isFailed && 'line-through text-red-500'
          )}>
            {formatCurrency(payment.amount)}
          </p>
          <p className="text-[10px] text-muted-foreground">{formatDate(payment.date)}</p>
        </div>

        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground shrink-0 transition-transform',
            expanded && 'rotate-180'
          )}
        />
      </button>

      {/* ── Expanded detail ────────────────────────────────────────── */}
      {expanded && (
        <div className="border-t px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Column 1: Payment details */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-2">Payment Details</h4>
            <div className="space-y-1 text-xs">
              <p><span className="text-muted-foreground">Method:</span>{' '}
                <Badge className={cn('text-[10px] px-1.5 py-0', method.color)}>
                  <MethodIcon className="h-3 w-3 mr-0.5" /> {method.label}
                </Badge>
              </p>
              <p><span className="text-muted-foreground">Amount:</span> {formatCurrency(payment.amount)}</p>
              <p><span className="text-muted-foreground">Date:</span> {formatDate(payment.date)}</p>
              {payment.reference && <p><span className="text-muted-foreground">Reference:</span> {payment.reference}</p>}
              {payment.transaction_id && <p><span className="text-muted-foreground">Transaction ID:</span> {payment.transaction_id}</p>}
              {payment.bank_name && <p><span className="text-muted-foreground">Bank:</span> {payment.bank_name}</p>}
            </div>
          </div>

          {/* Column 2: Cheque or Invoice context */}
          <div>
            {isCheque ? (
              <>
                <h4 className="text-xs font-semibold text-muted-foreground mb-2">Cheque Info</h4>
                <div className="space-y-1 text-xs">
                  {payment.cheque_number && <p><span className="text-muted-foreground">Cheque #:</span> {payment.cheque_number}</p>}
                  {payment.cheque_date && <p><span className="text-muted-foreground">Cheque Date:</span> {formatDate(payment.cheque_date)}</p>}
                  {payment.bank_name && <p><span className="text-muted-foreground">Bank:</span> {payment.bank_name}</p>}
                </div>
              </>
            ) : (
              <>
                <h4 className="text-xs font-semibold text-muted-foreground mb-2">Invoice Context</h4>
                <div className="space-y-1 text-xs">
                  {payment.invoice_display && <p><span className="text-muted-foreground">Invoice:</span> {payment.invoice_display}</p>}
                  {payment.invoice_source_type && <p><span className="text-muted-foreground">Source:</span> {payment.invoice_source_type}</p>}
                  {payment.invoice_total != null && <p><span className="text-muted-foreground">Invoice Total:</span> {formatCurrency(payment.invoice_total)}</p>}
                  {payment.invoice_paid != null && <p><span className="text-muted-foreground">Paid So Far:</span> {formatCurrency(payment.invoice_paid)}</p>}
                  {invoiceRemaining != null && invoiceRemaining > 0 && (
                    <div className="mt-1 rounded bg-amber-50 border border-amber-200 px-2 py-1.5 text-amber-800">
                      Remaining: {formatCurrency(invoiceRemaining)}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Column 3: Customer & notes */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-2">Customer & Notes</h4>
            <div className="space-y-1 text-xs">
              {payment.customer_name && <p><span className="text-muted-foreground">Customer:</span> {payment.customer_name}</p>}
              {payment.phone && <p><span className="text-muted-foreground">Phone:</span> {payment.phone}</p>}
              {payment.agent_name && <p><span className="text-muted-foreground">Agent:</span> {payment.agent_name}</p>}
              {payment.notes && (
                <div className="mt-1 rounded bg-muted/50 px-2 py-1.5 text-muted-foreground">
                  {payment.notes}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
