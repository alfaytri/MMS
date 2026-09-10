// src/components/team-leader/TlInvoiceDialog.tsx
'use client'

import { useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { useCreateTlInvoice } from '@/hooks/useTlActions'
import type { TlVisit, AddedBillableService } from '@/types/team-leader'

interface Props {
  visit: TlVisit
  addedServices: AddedBillableService[]
  profileId: string
  onDone: (visitId: string) => void
  onClose: () => void
}

const fmt = (n: number) =>
  n.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** A labelled QAR amount box. Empty shows the placeholder "0"; never renders NaN. */
function MoneyInput({
  id, label, value, onChange, max, accent,
}: {
  id: string
  label: string
  value: number
  onChange: (v: number) => void
  max?: number
  accent?: 'cash' | 'pos'
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          QAR
        </span>
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          max={max}
          step={0.01}
          value={value === 0 ? '' : value}
          placeholder="0"
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          className={cn(
            'h-11 pl-11 text-right font-medium',
            accent === 'cash' && 'focus-visible:ring-emerald-500',
            accent === 'pos' && 'focus-visible:ring-blue-500',
          )}
        />
      </div>
    </div>
  )
}

export function TlInvoiceDialog({ visit, addedServices, profileId, onDone, onClose }: Props) {
  const createInvoice = useCreateTlInvoice()
  const [spareParts, setSpareParts]   = useState(0)
  const [discount, setDiscount]       = useState(0)
  const [paidCash, setPaidCash]       = useState(0)
  const [paidPos, setPaidPos]         = useState(0)
  const [notes, setNotes]             = useState('')
  const [submitting, setSubmitting]   = useState(false)

  const supabase = useMemo(() => createClient(), [])
  const qc = useQueryClient()

  // Bill lines = original visit services + any added billable services.
  const allItems = [
    ...visit.services.map((s) => ({
      name: s.name, qty: s.qty, unit_price: s.unit_price, total: s.unit_price * s.qty,
    })),
    ...addedServices.map((s) => ({
      name: s.name, qty: s.qty, unit_price: s.unitPrice, total: s.unitPrice * s.qty,
    })),
  ]

  // Live money math — mirrors the server (create_tl_invoice authors the truth).
  const servicesSubtotal = allItems.reduce((sum, i) => sum + i.total, 0)
  const spare            = Math.max(0, spareParts)
  const gross            = servicesSubtotal + spare
  const discountClamped  = Math.min(Math.max(0, discount), gross)
  const net              = gross - discountClamped
  const paidCashC        = Math.max(0, paidCash)
  const paidPosC         = Math.max(0, paidPos)
  const paidTotal        = paidCashC + paidPosC
  const pending          = Math.max(0, net - paidTotal)
  const overpaid         = paidTotal - net > 0.005
  const fullyPaid        = net > 0 ? pending <= 0.005 : true

  function finish() {
    qc.invalidateQueries({ queryKey: queryKeys.teamLeader.orders(visit.team_id) })
    onDone(visit.id)
  }

  async function handleConfirm() {
    if (overpaid) { toast.error('Cash + POS entered exceed the net total'); return }

    setSubmitting(true)
    try {
      const lines = allItems.map(({ name, qty, unit_price }) => ({ name, qty, unit_price }))
      const { id: invoiceId, invoice_number: invoiceNumber } = await createInvoice.mutateAsync({
        visit,
        lines,
        spareParts: spare,
        discount: discountClamped,
        paidCash: paidCashC,
        paidPos: paidPosC,
        notes: notes.trim(),
        createdBy: profileId,
      })

      // Fire-and-forget: warm the PDF, then WhatsApp the invoice to the customer.
      // The send goes through the central helper, which reads the assigned WATI
      // template from notification_config — a no-op if it's unassigned/inactive.
      void (async () => {
        try {
          const { data: sess } = await supabase.auth.getSession()
          const token = sess.session?.access_token
          if (!token) return
          // Warm the PDF first so the WhatsApp document header has a URL to use.
          await fetch(`/api/orders/invoices/${invoiceId}/pdf`, {
            method:  'POST',
            headers: { Authorization: `Bearer ${token}` },
          })
          await fetch('/api/notifications/send-invoice', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body:    JSON.stringify({ invoiceId }),
          })
        } catch (e) {
          console.warn('[TlInvoiceDialog] post-create pdf/whatsapp failed', e)
        }
      })()

      toast.success(
        fullyPaid
          ? `${invoiceNumber} created — fully paid`
          : `${invoiceNumber} created — QAR ${fmt(pending)} pending`,
      )
      finish()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      toast.error(msg === 'invoice_exists' ? 'An invoice already exists for this visit' : msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full max-w-2xl h-full sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-xl flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b shrink-0">
          <DialogTitle className="leading-snug pr-8">
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

            {/* Services breakdown (auto — the system totals these) */}
            <div className="rounded-lg border overflow-hidden">
              <div className="px-3 py-2 bg-muted text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Services Breakdown
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-1.5 font-medium">Service</th>
                      <th className="text-center px-3 py-1.5 font-medium hidden sm:table-cell">Qty</th>
                      <th className="text-right px-3 py-1.5 font-medium hidden sm:table-cell">Unit</th>
                      <th className="text-right px-3 py-1.5 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allItems.map((item, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2">{item.name}</td>
                        <td className="text-center px-3 py-2 tabular-nums hidden sm:table-cell">{item.qty}</td>
                        <td className="text-right px-3 py-2 tabular-nums hidden sm:table-cell">{fmt(item.unit_price)}</td>
                        <td className="text-right px-3 py-2 tabular-nums">{fmt(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-muted/30">
                      <td className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground" colSpan={3}>
                        Services Subtotal
                      </td>
                      <td className="text-right px-3 py-2 tabular-nums font-semibold">{fmt(servicesSubtotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Amount entry — operator fills these; the system computes NET + PENDING */}
            <div className="grid grid-cols-2 gap-3">
              <MoneyInput id="inv-spare"    label="Spare Parts" value={spareParts} onChange={setSpareParts} />
              <MoneyInput id="inv-discount" label="Discount"    value={discount}   onChange={setDiscount} max={gross} />
              <MoneyInput id="inv-cash"     label="Paid Cash"   value={paidCash}   onChange={setPaidCash} accent="cash" />
              <MoneyInput id="inv-pos"      label="Paid POS"    value={paidPos}    onChange={setPaidPos}  accent="pos" />
            </div>

            {/* Live totals */}
            <div className="space-y-1.5 text-sm rounded-lg border p-4">
              <div className="flex justify-between text-muted-foreground">
                <span>Services</span><span className="tabular-nums">{fmt(servicesSubtotal)}</span>
              </div>
              {spare > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>+ Spare Parts</span><span className="tabular-nums">{fmt(spare)}</span>
                </div>
              )}
              {discountClamped > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>− Discount</span><span className="tabular-nums">− {fmt(discountClamped)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base border-t pt-2 mt-1">
                <span>Net Total</span>
                <span className="tabular-nums text-primary">QAR {fmt(net)}</span>
              </div>
              {paidTotal > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Paid ({[paidCashC > 0 ? 'Cash' : null, paidPosC > 0 ? 'POS' : null].filter(Boolean).join(' + ') || 'none'})</span>
                  <span className="tabular-nums text-emerald-600">QAR {fmt(paidTotal)}</span>
                </div>
              )}
              <div className={cn(
                'flex justify-between font-semibold text-base',
                overpaid ? 'text-destructive' : pending > 0 ? 'text-amber-700' : 'text-emerald-600',
              )}>
                <span>{overpaid ? 'Overpaid' : 'Pending Payment'}</span>
                <span className="tabular-nums">
                  QAR {fmt(overpaid ? paidTotal - net : pending)}
                </span>
              </div>
              {overpaid && (
                <p className="text-xs text-destructive pt-1">
                  Cash + POS exceed the net total — reduce a payment box.
                </p>
              )}
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
            disabled={submitting || overpaid}
          >
            {submitting
              ? 'Processing…'
              : fullyPaid
                ? 'Confirm & Mark Paid'
                : `Confirm & Create Invoice · QAR ${fmt(pending)} pending`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
