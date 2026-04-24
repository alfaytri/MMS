// src/components/purchase/BillDetailDocument.tsx
'use client'

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { BillDetailSection } from './BillDetailSection'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import type { BillViewModel } from '@/hooks/useSupplierBills'
import type { Division } from '@/hooks/useDivisions'

const FALLBACK_COMPANY = 'Alfaytri Maintenance'

type Props = {
  viewModel: BillViewModel
  division: Division | null
  showReceival: boolean
  showPaymentPlan: boolean
  showNotes: boolean
  showQR: boolean
  relatedBills: { id: string; invoice_id: string }[]
  currentBillId: string
  onNavigate: (id: string) => void
}

const DOC_STATUS_COLORS: Record<string, string> = {
  draft:            'bg-slate-100 text-slate-700',
  pending_approval: 'bg-amber-100 text-amber-700',
  approved:         'bg-green-100 text-green-700',
  rejected:         'bg-red-100 text-red-700',
}

const PAY_STATUS_COLORS: Record<string, string> = {
  unpaid:         'bg-slate-100 text-slate-600',
  partially_paid: 'bg-amber-100 text-amber-700',
  paid:           'bg-green-100 text-green-700',
  overdue:        'bg-red-100 text-red-700',
}

function getWatermark(bill: BillViewModel['bill']): { text: string; colorClass: string } | null {
  if (bill.doc_status === 'draft') return { text: 'DRAFT', colorClass: 'text-slate-400' }
  if (bill.payment_status === 'paid') return { text: 'PAID', colorClass: 'text-green-400' }
  if (bill.payment_status === 'overdue') return { text: 'OVERDUE', colorClass: 'text-red-400' }
  return null
}

export function BillDetailDocument({
  viewModel,
  division,
  showReceival,
  showPaymentPlan,
  showNotes,
  showQR,
  relatedBills,
  currentBillId,
  onNavigate,
}: Props) {
  const { bill, payments, paymentPlan, receival } = viewModel
  const watermark = getWatermark(bill)
  const [origin, setOrigin] = useState('')
  const printTimestamp = new Date().toLocaleString('en-GB')

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const supplier = bill.suppliers
  const po = bill.purchase_orders
  const currency = po?.currency ?? 'QAR'
  const balance = (bill.total_amount ?? 0) - (bill.paid_amount ?? 0)

  return (
    <div className="relative bg-white rounded-lg shadow-lg border max-w-3xl mx-auto p-10 space-y-7 print:shadow-none print:border-none print:p-6 print:max-w-none print:rounded-none">
      {/* Watermark */}
      {watermark && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden rounded-lg print:rounded-none">
          <span className={cn(
            'text-[9rem] font-black opacity-[0.07] rotate-[-30deg] tracking-widest',
            watermark.colorClass
          )}>
            {watermark.text}
          </span>
        </div>
      )}

      {/* 1. Header */}
      <BillDetailSection>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold leading-tight">
              {division?.name ?? FALLBACK_COMPANY}
            </h1>
            {division?.address_en && (
              <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line">
                {division.address_en}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <h2 className="text-2xl font-bold" dir="rtl">فاتورة مشتريات</h2>
            <p className="text-sm text-muted-foreground">Purchase Bill / Statement</p>
          </div>
        </div>
        <hr className="mt-4" />
      </BillDetailSection>

      {/* Related bills alert */}
      {relatedBills.length > 1 && (
        <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-2 text-sm text-amber-800 flex flex-wrap items-center gap-2 print:hidden">
          <span className="font-medium">This PO has {relatedBills.length} bills:</span>
          {relatedBills.map((b) => (
            <button
              key={b.id}
              onClick={() => onNavigate(b.id)}
              className={cn(
                'font-mono hover:underline underline-offset-2',
                b.id === currentBillId ? 'font-bold' : 'text-amber-700'
              )}
            >
              {b.invoice_id}
            </button>
          ))}
        </div>
      )}

      {/* 2. Meta row */}
      <BillDetailSection>
        <div className="flex items-start justify-between text-sm gap-4">
          <div className="space-y-2">
            {po && (
              <p className="font-mono font-semibold">
                {po.po_number} · {formatDate(po.created_date)}
              </p>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={cn('text-xs', DOC_STATUS_COLORS[bill.doc_status] ?? '')}>
                {bill.doc_status.replace(/_/g, ' ')}
              </Badge>
              <Badge className={cn('text-xs', PAY_STATUS_COLORS[bill.payment_status] ?? '')}>
                {bill.payment_status.replace(/_/g, ' ')}
              </Badge>
            </div>
          </div>
          <div className="text-right space-y-1 text-muted-foreground shrink-0">
            <p className="font-medium text-foreground font-mono">{bill.invoice_id}</p>
            <p>Due: <span className="text-foreground">{formatDate(bill.due_date)}</span></p>
            <p>Print Date: {printTimestamp}</p>
          </div>
        </div>
      </BillDetailSection>

      {/* 3. Supplier */}
      <BillDetailSection title="Supplier / المورد">
        {supplier ? (
          <div className="text-sm space-y-0.5">
            <p className="font-bold text-base">{supplier.name}</p>
            {supplier.contact_name && (
              <p className="text-muted-foreground">{supplier.contact_name}</p>
            )}
            {supplier.phone && <p>{supplier.phone}</p>}
            {supplier.email && <p>{supplier.email}</p>}
            {supplier.address && (
              <p className="text-muted-foreground whitespace-pre-line">{supplier.address}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">—</p>
        )}
      </BillDetailSection>

      {/* 4. Line items */}
      <BillDetailSection title="Items">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead>Item</TableHead>
              <TableHead className="text-right w-20">Qty</TableHead>
              <TableHead className="text-right w-28">Price</TableHead>
              <TableHead className="text-right w-28">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(bill.invoice_line_items ?? []).map((li, i) => (
              <TableRow key={li.id}>
                <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                <TableCell className="font-medium">{li.description}</TableCell>
                <TableCell className="text-right">{li.qty ?? '—'}</TableCell>
                <TableCell className="text-right">{formatCurrency(li.unit_price, currency)}</TableCell>
                <TableCell className="text-right font-medium">{formatCurrency(li.total, currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </BillDetailSection>

      {/* 5. Totals */}
      <div className="flex justify-end">
        <div className="w-64 space-y-1.5 text-sm border-t pt-3">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal:</span>
            <span>{formatCurrency(bill.subtotal, currency)}</span>
          </div>
          <div className="flex justify-between font-bold text-base">
            <span>Grand Total:</span>
            <span>{formatCurrency(bill.total_amount, currency)} {currency}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Total (QAR):</span>
            <span>{formatCurrency(bill.total_amount, 'QAR')}</span>
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
                  <TableCell className="text-right font-medium">
                    {formatCurrency(p.amount, currency)}
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {p.reference ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <div className="flex justify-end mt-4">
          <div className="w-64 space-y-1.5 text-sm border-t pt-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Amount (QAR):</span>
              <span>{formatCurrency(bill.total_amount, 'QAR')}</span>
            </div>
            <div className="flex justify-between text-green-600 font-medium">
              <span>Total Paid:</span>
              <span>{formatCurrency(bill.paid_amount ?? 0, 'QAR')}</span>
            </div>
            <div className={cn(
              'flex justify-between font-bold',
              balance > 0 ? 'text-red-600' : balance < 0 ? 'text-amber-600' : 'text-green-600'
            )}>
              <span>Balance:</span>
              <span>{formatCurrency(balance, 'QAR')}</span>
            </div>
            <div className="pt-1">
              <Badge className={cn('text-xs', PAY_STATUS_COLORS[bill.payment_status] ?? '')}>
                {bill.payment_status.replace(/_/g, ' ')}
              </Badge>
            </div>
          </div>
        </div>
      </BillDetailSection>

      {/* 7. Receival Info (toggleable) */}
      {showReceival && receival && (
        <BillDetailSection title="Receival Info">
          <p className="text-xs text-muted-foreground mb-2">
            Ref: <span className="font-mono">{receival.receival_number}</span>
            {' · '}{formatDate(receival.date)}
            {' · '}Status: <span className="capitalize">{receival.status}</span>
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right w-28">Qty Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receival.receival_items
                .filter((ri) => !ri.is_free)
                .map((ri) => (
                  <TableRow key={ri.id}>
                    <TableCell>
                      <p className="font-medium">{ri.item_name}</p>
                      {ri.sku && <p className="text-xs text-muted-foreground">{ri.sku}</p>}
                    </TableCell>
                    <TableCell className="text-right font-medium">{ri.qty_received}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </BillDetailSection>
      )}

      {/* 8. Payment Plan (toggleable) */}
      {showPaymentPlan && paymentPlan && (
        <BillDetailSection title="Payment Plan">
          <p className="text-xs text-muted-foreground mb-2 capitalize">
            Type: {paymentPlan.plan_type} · Status: {paymentPlan.status}
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(paymentPlan.payment_installments ?? []).map((inst, i) => (
                <TableRow key={inst.id}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>{formatDate(inst.due_date)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(inst.amount, 'QAR')}</TableCell>
                  <TableCell className="text-right text-green-600">
                    {formatCurrency(inst.paid_amount, 'QAR')}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs capitalize">
                      {inst.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </BillDetailSection>
      )}

      {/* 9. Notes (toggleable) */}
      {showNotes && bill.notes && (
        <BillDetailSection title="Notes / Remarks">
          <p className="text-sm text-muted-foreground whitespace-pre-line">{bill.notes}</p>
        </BillDetailSection>
      )}

      {/* 10. QR Code (toggleable) */}
      {showQR && (
        <BillDetailSection>
          <div className="flex justify-end">
            <div className="p-3 border rounded-lg text-center space-y-1">
              {origin ? (
                <QRCodeSVG
                  value={`${origin}/purchase/bills/${bill.id}`}
                  size={96}
                />
              ) : (
                <div className="w-24 h-24 bg-muted animate-pulse rounded" />
              )}
              <p className="text-xs font-mono text-muted-foreground">{bill.invoice_id}</p>
            </div>
          </div>
        </BillDetailSection>
      )}

      {/* 11. Footer */}
      <div className="border-t pt-4 flex items-start justify-between text-xs text-muted-foreground gap-4">
        <p>
          {division?.name ?? FALLBACK_COMPANY}
          {' · '}
          <span dir="rtl">هذا المستند تم إنشاؤه تلقائياً</span>
        </p>
        <p className="shrink-0">
          This document was automatically generated · {new Date().toISOString()}
        </p>
      </div>
    </div>
  )
}
