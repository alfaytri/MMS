// src/components/team-leader/TlInvoiceDialog.tsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { TlVisit, OrderCompletionData, AddedBillableService } from '@/types/team-leader'

type PaymentMethod = {
  id: string
  name: string
  slug: string
  sort_order: number
  requires_payment_link: boolean
}

interface Props {
  visit: TlVisit
  data: OrderCompletionData
  profileId: string
  onDone: (visitId: string) => void
  onClose: () => void
}

export function TlInvoiceDialog({ visit, data, profileId, onDone, onClose }: Props) {
  const addedServices: AddedBillableService[] = data.addedServices ?? []
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [paymentMethodId, setPaymentMethodId] = useState<string>('')
  const [discountAmount, setDiscountAmount]   = useState(0)
  const [notes, setNotes]                     = useState('')
  const [submitting, setSubmitting]           = useState(false)

  const supabase = useMemo(() => createClient(), [])

  // Load active payment methods on mount
  useEffect(() => {
    supabase
      .from('payment_methods')
      .select('id, name, slug, sort_order, requires_payment_link')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .then(({ data: methods, error }) => {
        if (error) { console.error('[TlInvoiceDialog] load payment methods', error); return }
        setPaymentMethods(methods ?? [])
        if (methods && methods.length > 0) setPaymentMethodId(methods[0].id)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Build items from original visit services + added billable services
  const allItems = [
    ...visit.services.map((s) => ({
      name:       s.name,
      qty:        s.qty,
      unit_price: s.unit_price,
      total:      s.unit_price * s.qty,
    })),
    ...addedServices.map((s) => ({
      name:       s.name,
      qty:        s.qty,
      unit_price: s.unitPrice,
      total:      s.unitPrice * s.qty,
    })),
  ]

  const subtotal    = allItems.reduce((sum, i) => sum + i.total, 0)
  const discount    = Math.min(Math.max(discountAmount, 0), subtotal)
  const totalAmount = subtotal - discount

  const selectedMethod = paymentMethods.find((m) => m.id === paymentMethodId)
  const isCash = selectedMethod?.slug === 'cash'
  const requiresPaymentLink = selectedMethod?.requires_payment_link === true
  // A zero-amount invoice is always treated as paid regardless of method
  const effectivePaid = isCash || totalAmount === 0

  async function handleConfirm() {
    if (!paymentMethodId) { toast.error('Select a payment method'); return }

    setSubmitting(true)
    try {
      // 1. Optimistic-lock visit update (preserves existing locking logic)
      const { data: updated, error: visitErr } = await (supabase as any)
        .from('visits')
        .update({ status: 'completed', completed_at: new Date().toISOString(), completed_by: profileId })
        .eq('id', visit.id)
        .not('status', 'in', '("completed","customer-unavailable")')
        .select('id')

      if (visitErr) throw visitErr
      if (!updated || updated.length === 0) {
        toast.error('This visit was already completed by another team')
        onDone(visit.id)
        return
      }

      // 2. Insert tl_invoice
      const { data: invoice, error: invErr } = await (supabase as any)
        .from('tl_invoices')
        .insert({
          visit_id:          visit.id,
          order_id:          visit.order_id ?? null,
          customer_name:     visit.customer_name,
          customer_phone:    visit.customer_phone ?? null,
          items:             allItems.map(({ name, qty, unit_price, total }) => ({ name, qty, unit_price, total })),
          subtotal,
          discount_amount:   discount,
          total_amount:      totalAmount,
          payment_method_id: paymentMethodId,
          payment_status:    effectivePaid ? 'paid' : 'unpaid',
          notes:             notes.trim() || null,
          created_by:        profileId,
        })
        .select('id, invoice_number')
        .single()

      if (invErr) throw invErr
      const invoiceId     = (invoice as { id: string; invoice_number: string }).id
      const invoiceNumber = (invoice as { id: string; invoice_number: string }).invoice_number

      // 3a. Cash, zero-amount, or non-link method — mark paid and done
      if (effectivePaid || !requiresPaymentLink) {
        const msg = effectivePaid
          ? `${invoiceNumber} created — marked as paid`
          : `${invoiceNumber} created — awaiting ${selectedMethod?.name ?? 'payment'}`
        toast.success(msg)
        onDone(visit.id)
        return
      }

      // 3b. Online payment — create Dibsy link + send Wati
      const res = await fetch('/api/payments/dibsy/create-tl-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id:     invoiceId,
          amount:         totalAmount,
          order_id:       visit.order_id ?? invoiceNumber,
          customer_phone: visit.customer_phone ?? '',
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }))
        toast.error(`Invoice created but payment link failed: ${(err as { error?: string }).error ?? 'Unknown error'}`)
      } else {
        toast.success(`${invoiceNumber} created — payment link sent`)
      }

      onDone(visit.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full max-w-2xl h-full sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-xl flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b shrink-0">
          <DialogTitle>
            Create Invoice
            {visit.order_id && (
              <span className="ml-2 text-muted-foreground font-normal text-sm">— {visit.order_id}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-5 p-4">
            {/* Customer */}
            <div>
              <p className="font-semibold">{visit.customer_name}</p>
              <p className="text-sm text-muted-foreground">{visit.address}</p>
            </div>

            {/* Services breakdown */}
            <div className="rounded-lg border overflow-hidden">
              <div className="px-3 py-2 bg-muted text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Services Breakdown
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-1.5">Service</th>
                      <th className="text-center px-3 py-1.5 hidden sm:table-cell">Qty</th>
                      <th className="text-right px-3 py-1.5 hidden sm:table-cell">Unit</th>
                      <th className="text-right px-3 py-1.5">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allItems.map((item, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2">{item.name}</td>
                        <td className="text-center px-3 py-2 hidden sm:table-cell">{item.qty}</td>
                        <td className="text-right px-3 py-2 hidden sm:table-cell">{item.unit_price.toFixed(2)}</td>
                        <td className="text-right px-3 py-2">{item.total.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals */}
            <div className="space-y-1 text-sm rounded-lg border p-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Grand Total</span>
                <span>{subtotal.toFixed(2)} QAR</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Discount</span>
                  <span>− {discount.toFixed(2)} QAR</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base border-t pt-2 mt-1">
                <span>Amount Due</span>
                <span className="text-primary">{totalAmount.toFixed(2)} QAR</span>
              </div>
            </div>

            {/* Discount input */}
            <div className="space-y-1.5">
              <Label htmlFor="discount-input">Discount (QAR)</Label>
              <Input
                id="discount-input"
                type="number"
                min={0}
                max={subtotal}
                step={0.01}
                value={discountAmount === 0 ? '' : discountAmount}
                placeholder="0"
                onChange={(e) => setDiscountAmount(Math.max(0, Number(e.target.value) || 0))}
                className="h-11"
              />
            </div>

            {/* Payment method */}
            <div className="space-y-1.5">
              <Label htmlFor="payment-method-select">Payment Method</Label>
              <Select value={paymentMethodId} onValueChange={(v) => { if (v) setPaymentMethodId(v) }}>
                <SelectTrigger id="payment-method-select" className="h-11">
                  <SelectValue placeholder="Select payment method…" />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.length === 0 && (
                    <SelectItem value="__none" disabled>No active payment methods</SelectItem>
                  )}
                  {paymentMethods.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="invoice-notes">Invoice Notes (Optional)</Label>
              <Textarea
                id="invoice-notes"
                placeholder="Add any notes for the invoice…"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

          </div>
        </ScrollArea>

        <div className="px-4 pb-4 pt-2 border-t shrink-0">
          <Button
            className="w-full min-h-11"
            onClick={handleConfirm}
            disabled={!paymentMethodId || submitting}
          >
            {submitting
              ? 'Processing…'
              : effectivePaid
                ? 'Confirm & Mark Paid'
                : requiresPaymentLink
                  ? 'Confirm & Send Payment Link'
                  : 'Confirm & Create Invoice'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
