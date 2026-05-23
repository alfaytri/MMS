// src/components/team-leader/TlInvoiceDialog.tsx
'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SignaturePad } from './shared/SignaturePad'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { TlVisit, OrderCompletionData } from '@/types/team-leader'

const DISCOUNT_OPTIONS = ['0', '5', '10', '15', '20']

interface Props {
  visit: TlVisit
  data: OrderCompletionData
  profileId: string
  onDone: (visitId: string) => void
  onClose: () => void
}

export function TlInvoiceDialog({ visit, data, profileId, onDone, onClose }: Props) {
  const [contractDiscount, setContractDiscount] = useState('0')
  const [ccDiscount,       setCcDiscount]       = useState('0')
  const [signature,        setSignature]        = useState<Blob | null>(data.signature ?? null)
  const [paymentMethod,    setPaymentMethod]    = useState<'cash' | 'card' | 'pending'>('pending')
  const [submitting,       setSubmitting]       = useState(false)

  const subtotal = visit.services.reduce((sum, s) => sum + s.unit_price * s.qty, 0)
  const cDisc    = (subtotal * Number(contractDiscount)) / 100
  const ccDisc   = ((subtotal - cDisc) * Number(ccDiscount)) / 100
  const total    = subtotal - cDisc - ccDisc

  async function handleConfirm() {
    if (!signature) { toast.error('Customer signature required'); return }
    setSubmitting(true)
    try {
      const supabase = createClient()

      // Update visit status with optimistic lock (Fix 5)
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

      // Create invoice
      const { data: invoice, error: invErr } = await (supabase as any)
        .from('invoices')
        .insert({
          visit_id:          visit.id,
          customer_name:     visit.customer_name,
          subtotal,
          contract_discount: Number(contractDiscount),
          cc_discount:       Number(ccDiscount),
          total,
          payment_method:    paymentMethod,
          status:            paymentMethod === 'pending' ? 'pending' : 'paid',
          created_by:        profileId,
        })
        .select('id')
        .single()

      if (invErr) throw invErr

      toast.success(`Invoice #${(invoice as { id: string }).id.slice(0, 8)} created`)
      onDone(visit.id)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full max-w-2xl h-full sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-xl flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b shrink-0">
          <DialogTitle>Invoice</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-6 p-4">
            {/* Customer info */}
            <div>
              <p className="font-semibold">{visit.customer_name}</p>
              <p className="text-sm text-muted-foreground">{visit.address}</p>
            </div>

            {/* Line items */}
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Service</th>
                    <th className="text-right px-3 py-2">Qty</th>
                    <th className="text-right px-3 py-2">Unit</th>
                    <th className="text-right px-3 py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {visit.services.map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="px-3 py-2">{s.name}</td>
                      <td className="text-right px-3 py-2">{s.qty}</td>
                      <td className="text-right px-3 py-2">{s.unit_price.toFixed(2)}</td>
                      <td className="text-right px-3 py-2">{(s.unit_price * s.qty).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Discounts */}
            {visit.type === 'contract' && (
              <div className="space-y-1.5">
                <Label>Contract Discount (%)</Label>
                <Select value={contractDiscount} onValueChange={(v) => { if (v) setContractDiscount(v) }}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DISCOUNT_OPTIONS.map((d) => (
                      <SelectItem key={d} value={d}>{d}%</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>CC Discount (%)</Label>
              <Select value={ccDiscount} onValueChange={(v) => { if (v) setCcDiscount(v) }}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DISCOUNT_OPTIONS.map((d) => (
                    <SelectItem key={d} value={d}>{d}%</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Totals */}
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{subtotal.toFixed(2)}</span></div>
              {Number(contractDiscount) > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Contract discount ({contractDiscount}%)</span><span>-{cDisc.toFixed(2)}</span>
                </div>
              )}
              {Number(ccDiscount) > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>CC discount ({ccDiscount}%)</span><span>-{ccDisc.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base border-t pt-2">
                <span>Total</span><span>{total.toFixed(2)}</span>
              </div>
            </div>

            {/* Payment method */}
            <div className="space-y-1.5">
              <Label>Payment Method</Label>
              <div className="flex gap-2">
                {(['cash', 'card', 'pending'] as const).map((m) => (
                  <Button
                    key={m}
                    type="button"
                    variant={paymentMethod === m ? 'default' : 'outline'}
                    className="flex-1 min-h-11 capitalize"
                    onClick={() => setPaymentMethod(m)}
                  >
                    {m}
                  </Button>
                ))}
              </div>
            </div>

            <SignaturePad visitId={`${visit.id}-invoice`} value={signature} onChange={setSignature} />
          </div>
        </ScrollArea>

        <div className="px-4 pb-4 pt-2 border-t shrink-0">
          <Button
            className="w-full min-h-11"
            onClick={handleConfirm}
            disabled={!signature || submitting}
          >
            {submitting ? 'Creating Invoice…' : 'Confirm & Create Invoice'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
