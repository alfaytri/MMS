'use client'

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { BillDetailSection } from '@/components/purchase/BillDetailSection'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import type { ArInvoice } from '@/types/invoice'
import type { PaymentPlan, PaymentInstallment } from '@/hooks/usePaymentPlans'
import type { CustomerPayment } from '@/hooks/useCustomerPayments'
import type { Division } from '@/hooks/useDivisions'
import type { Company } from '@/hooks/useCompanies'

const FALLBACK_COMPANY = 'Alfaytri Maintenance'

type Props = {
  invoice: ArInvoice
  payments: CustomerPayment[]
  company: Company | null
  division: Division | null
  plans?: PaymentPlan[]
  showNotes?: boolean
  showQR?: boolean
  showPaymentPlan?: boolean
}

const PAY_STATUS_COLORS: Record<string, string> = {
  unpaid:         'bg-slate-100 text-slate-600',
  partially_paid: 'bg-amber-100 text-amber-700',
  paid:           'bg-green-100 text-green-700',
  overdue:        'bg-red-100 text-red-700',
}

const DOC_STATUS_COLORS: Record<string, string> = {
  draft:         'bg-slate-100 text-slate-700',
  ready_to_send: 'bg-blue-100 text-blue-700',
  sent:          'bg-green-100 text-green-700',
}

function getWatermark(inv: ArInvoice): { text: string; colorClass: string } | null {
  if (inv.payment_status === 'paid')    return { text: 'PAID',    colorClass: 'text-green-400' }
  if (inv.payment_status === 'overdue') return { text: 'OVERDUE', colorClass: 'text-red-400'   }
  return null
}

export function InvoiceDetailDocument({
  invoice,
  payments,
  company,
  division,
  plans = [],
  showNotes = true,
  showQR = true,
  showPaymentPlan = true,
}: Props) {
  const [origin, setOrigin] = useState('')
  const watermark = getWatermark(invoice)
  const printTimestamp = new Date().toLocaleDateString('en-GB')

  useEffect(() => { setOrigin(window.location.origin) }, [])

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0)
  const balance   = (invoice.total_amount ?? 0) - totalPaid

  return (
    <div className="relative bg-white rounded-lg shadow-lg border max-w-3xl mx-auto p-10 space-y-7 print:shadow-none print:border-none print:p-0 print:max-w-none print:rounded-none print:space-y-3">
      {/* Watermark */}
      {watermark && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden rounded-lg print:rounded-none">
          <span className={cn('text-[9rem] font-black opacity-[0.07] rotate-[-30deg] tracking-widest', watermark.colorClass)}>
            {watermark.text}
          </span>
        </div>
      )}

      {/* 1. Header */}
      <BillDetailSection>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold leading-tight">{company?.name_en ?? FALLBACK_COMPANY}</h1>
            {division && (
              <p className="text-sm font-medium text-muted-foreground mt-0.5">{division.name}</p>
            )}
            {(division as any)?.address_en && (
              <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line">{(division as any).address_en}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <h2 className="text-2xl font-bold" dir="rtl">فاتورة مبيعات</h2>
            <p className="text-sm text-muted-foreground">Sales Invoice</p>
          </div>
        </div>
        <hr className="mt-4" />
      </BillDetailSection>

      {/* 2. Meta row */}
      <BillDetailSection>
        <div className="flex items-start justify-between text-sm gap-4">
          <div className="space-y-2">
            {invoice.so_number && (
              <p className="font-mono font-semibold">{invoice.so_number}</p>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={cn('text-xs', PAY_STATUS_COLORS[invoice.payment_status] ?? '')}>
                {invoice.payment_status.replace(/_/g, ' ')}
              </Badge>
              <Badge className={cn('text-xs', DOC_STATUS_COLORS[invoice.doc_status] ?? '')}>
                {invoice.doc_status.replace(/_/g, ' ')}
              </Badge>
            </div>
          </div>
          <div className="text-right space-y-1 text-muted-foreground shrink-0">
            <p className="font-medium text-foreground font-mono">{invoice.invoice_id}</p>
            <p>Issued: <span className="text-foreground">{formatDate(invoice.issued_date)}</span></p>
            <p>Due: <span className="text-foreground">{formatDate(invoice.due_date)}</span></p>
            <p>Print Date: {printTimestamp}</p>
          </div>
        </div>
      </BillDetailSection>

      {/* 3. Customer */}
      <BillDetailSection title="Customer / العميل">
        <div className="text-sm">
          <p className="font-bold text-base">{invoice.customer_name ?? '—'}</p>
        </div>
      </BillDetailSection>

      {/* 4. Line items */}
      <BillDetailSection title="Items">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right w-20">Qty</TableHead>
              <TableHead className="text-right w-28">Unit Price</TableHead>
              <TableHead className="text-right w-28">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(invoice.invoice_line_items ?? []).map((li, i) => (
              <TableRow key={li.id}>
                <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                <TableCell className="font-medium">{li.description}</TableCell>
                <TableCell className="text-right">{li.qty ?? '—'}</TableCell>
                <TableCell className="text-right">{formatCurrency(li.unit_price ?? 0, 'QAR')}</TableCell>
                <TableCell className="text-right font-medium">{formatCurrency(li.total ?? 0, 'QAR')}</TableCell>
              </TableRow>
            ))}
            {(invoice.invoice_line_items ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-4">No items</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </BillDetailSection>

      {/* 5. Totals */}
      <div className="flex justify-end">
        <div className="w-64 space-y-1.5 text-sm border-t pt-3">
          {(invoice.subtotal ?? 0) > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal:</span>
              <span>{formatCurrency(invoice.subtotal ?? 0, 'QAR')}</span>
            </div>
          )}
          {(invoice.tax ?? 0) > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax:</span>
              <span>{formatCurrency(invoice.tax ?? 0, 'QAR')}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-base">
            <span>Grand Total:</span>
            <span>{formatCurrency(invoice.total_amount ?? 0, 'QAR')}</span>
          </div>
        </div>
      </div>

      {/* 6. Payment History */}
      <BillDetailSection title="Payment History">
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No payments recorded</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Reference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{formatDate(p.date)}</TableCell>
                  <TableCell className="capitalize">{p.method.replace(/_/g, ' ')}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(p.amount, 'QAR')}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{p.reference ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <div className="flex justify-end mt-4">
          <div className="w-64 space-y-1.5 text-sm border-t pt-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Amount (QAR):</span>
              <span>{formatCurrency(invoice.total_amount ?? 0, 'QAR')}</span>
            </div>
            <div className="flex justify-between text-green-600 font-medium">
              <span>Total Paid:</span>
              <span>{formatCurrency(totalPaid, 'QAR')}</span>
            </div>
            <div className={cn(
              'flex justify-between font-bold',
              balance > 0 ? 'text-red-600' : balance < 0 ? 'text-amber-600' : 'text-green-600'
            )}>
              <span>Balance:</span>
              <span>{formatCurrency(balance, 'QAR')}</span>
            </div>
            <div className="pt-1">
              <Badge className={cn('text-xs', PAY_STATUS_COLORS[invoice.payment_status] ?? '')}>
                {invoice.payment_status.replace(/_/g, ' ')}
              </Badge>
            </div>
          </div>
        </div>
      </BillDetailSection>

      {/* 7. Payment Plan */}
      {showPaymentPlan && plans.length > 0 && (
        <BillDetailSection title="Payment Plan">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans
                .flatMap((plan) => plan.payment_installments ?? [])
                .map((inst, i) => (
                  <TableRow key={inst.id ?? i}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell>{formatDate(inst.due_date ?? '')}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(inst.amount, 'QAR')}
                    </TableCell>
                    <TableCell>
                      <span className={cn(
                        'text-xs px-1.5 py-0.5 rounded font-medium capitalize',
                        inst.status === 'paid'    ? 'bg-green-100 text-green-700' :
                        inst.status === 'overdue' ? 'bg-red-100 text-red-700' :
                                                    'bg-slate-100 text-slate-600'
                      )}>
                        {inst.status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </BillDetailSection>
      )}

      {/* 8. Notes */}
      {showNotes && invoice.notes && (
        <BillDetailSection title="Notes / Remarks">
          <p className="text-sm text-muted-foreground whitespace-pre-line">{invoice.notes}</p>
        </BillDetailSection>
      )}

      {/* 9. QR Code */}
      {showQR && (
        <BillDetailSection>
          <div className="flex justify-end">
            <div className="p-3 border rounded-lg text-center space-y-1">
              {origin ? (
                <QRCodeSVG value={`${origin}/sales/invoices/${invoice.id}`} size={96} />
              ) : (
                <div className="w-24 h-24 bg-muted animate-pulse rounded" />
              )}
              <p className="text-xs font-mono text-muted-foreground">{invoice.invoice_id}</p>
            </div>
          </div>
        </BillDetailSection>
      )}

      {/* 10. Footer */}
      <div className="border-t pt-4 flex items-start justify-between text-xs text-muted-foreground gap-4">
        <p>
          {company?.name_en ?? FALLBACK_COMPANY}
          {division ? ` · ${division.name}` : ''}
          {' · '}
          <span dir="rtl">هذا المستند تم إنشاؤه تلقائياً</span>
        </p>
        <p className="shrink-0">
          This document was automatically generated · {new Date().toLocaleDateString('en-GB')}
        </p>
      </div>
    </div>
  )
}
