'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { useQueryClient } from '@tanstack/react-query'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { queryKeys } from '@/lib/queryKeys'
import type { DebitNote } from '@/types/invoice'

type PickableBill = {
  id:              string
  bill_number:     string
  purchase_order_id: string | null
  total_amount:    number
  paid_amount:     number
  payment_status:  string
  issued_date:     string
  outstanding:     number
}

interface Props {
  note:         DebitNote | null
  open:         boolean
  onOpenChange: (open: boolean) => void
}

export function ApplyDebitNoteDialog({ note, open, onOpenChange }: Props) {
  const qc = useQueryClient()
  const [bills, setBills] = useState<PickableBill[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [selectedBillId, setSelectedBillId] = useState<string>('')
  const [amountStr, setAmountStr] = useState<string>('')

  const remainingDn = useMemo(() => {
    if (!note) return 0
    const remaining = (note as unknown as { remaining_amount?: number | null }).remaining_amount
    if (typeof remaining === 'number') return remaining
    return note.total_amount ?? 0
  }, [note])

  // Load candidate bills whenever the note changes.
  useEffect(() => {
    if (!open || !note) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const supabase = createClient()

      // Default: the bill of this PO. Fall back to any of the supplier's
      // unpaid/partial bills if that one is already paid.
      const supplierId = (note as unknown as { supplier_id?: string | null }).supplier_id
      const poId       = (note as unknown as { purchase_order_id?: string | null }).purchase_order_id

      let query = supabase
        .from('bills')
        .select('id, bill_number, purchase_order_id, total_amount, paid_amount, payment_status, issued_date, supplier_id')
        .in('payment_status', ['unpaid', 'partially_paid'])
        .order('issued_date', { ascending: true })
        .limit(200)
      if (supplierId) query = query.eq('supplier_id', supplierId)

      const { data } = await query
      if (cancelled) return

      const rows: PickableBill[] = (data ?? []).map((r) => {
        const total = Number(r.total_amount ?? 0)
        const paid  = Number(r.paid_amount ?? 0)
        return {
          id:              r.id,
          bill_number:     r.bill_number,
          purchase_order_id: r.purchase_order_id,
          total_amount:    total,
          paid_amount:     paid,
          payment_status:  r.payment_status,
          issued_date:     r.issued_date,
          outstanding:     Math.max(0, total - paid),
        }
      }).filter((r) => r.outstanding > 0)

      setBills(rows)
      // Pre-select the DN's own PO bill when present; else oldest outstanding.
      const preferred = poId ? rows.find((r) => r.purchase_order_id === poId) : null
      const initial = preferred ?? rows[0]
      if (initial) setSelectedBillId(initial.id)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [open, note])

  useEffect(() => {
    const bill = bills.find((b) => b.id === selectedBillId)
    if (!bill) { setAmountStr(''); return }
    setAmountStr(String(Math.min(remainingDn, bill.outstanding)))
  }, [selectedBillId, bills, remainingDn])

  if (!note) return null

  const selectedBill = bills.find((b) => b.id === selectedBillId)
  const parsedAmount = Number(amountStr)
  const maxApplicable = selectedBill ? Math.min(remainingDn, selectedBill.outstanding) : 0
  const overCap = Number.isFinite(parsedAmount) && parsedAmount > maxApplicable
  const validAmount = Number.isFinite(parsedAmount) && parsedAmount > 0 && !overCap

  async function handleSubmit() {
    if (!note || !selectedBill || !validAmount) return
    setSubmitting(true)
    try {
      const supabase = createClient()
      // The RPC auto-picks the DN's PO bill. To target a specific bill
      // (partial-apply or a different bill), we pass the amount cap and
      // rely on the RPC's PO-lookup — for now this dialog only ships
      // partial-apply against the same PO. If bills.purchase_order_id
      // differs from note.purchase_order_id, the RPC will still target
      // the DN's PO bill; the picker warns the operator when that
      // happens (see the note below the picker).
      const { error: rpcErr } = await supabase.rpc('rpc_apply_debit_note_to_bill', {
        p_debit_note_id: note.id,
        p_amount:        parsedAmount,
        p_bill_id:       selectedBill.id,
      })
      if (rpcErr) {
        throw new Error(
          `Apply DN to bill failed: ${rpcErr.code} ${rpcErr.message}` +
          `${rpcErr.details ? ' — ' + rpcErr.details : ''}` +
          `${rpcErr.hint ? ' (' + rpcErr.hint + ')' : ''}`,
        )
      }

      // Flip the resolution flag now that the offset landed.
      await supabase
        .from('debit_notes')
        .update({ resolution_type: 'supplier_credit', status: 'resolved' })
        .eq('id', note.id)

      toast.success(`DN applied — ${formatCurrency(parsedAmount, 'QAR')} against ${selectedBill.bill_number}`)
      qc.invalidateQueries({ queryKey: queryKeys.creditNotes.debitNotes })
      qc.invalidateQueries({ queryKey: queryKeys.supplierBills.all })
      qc.invalidateQueries({ queryKey: queryKeys.purchaseReturns.all })
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to apply debit note')
    } finally {
      setSubmitting(false)
    }
  }

  const notePoId = (note as unknown as { purchase_order_id?: string | null }).purchase_order_id
  const targetsDifferentPo = selectedBill && notePoId && selectedBill.purchase_order_id !== notePoId

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply {(note as unknown as { debit_note_id?: string }).debit_note_id ?? 'debit note'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border p-3 text-sm space-y-1 bg-muted/40">
            <div className="flex justify-between">
              <span className="text-muted-foreground">DN remaining</span>
              <span className="font-mono tabular-nums">{formatCurrency(remainingDn, 'QAR')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">DN total</span>
              <span className="font-mono tabular-nums">{formatCurrency(note.total_amount ?? 0, 'QAR')}</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Apply to bill</label>
            {loading ? (
              <p className="text-xs text-muted-foreground">Loading bills…</p>
            ) : bills.length === 0 ? (
              <p className="text-xs text-destructive">
                No open bills for this supplier. Issue a bill first.
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto rounded-md border p-1">
                {bills.map((b) => {
                  const isSelected = b.id === selectedBillId
                  const isDnPo = notePoId && b.purchase_order_id === notePoId
                  return (
                    <button
                      type="button"
                      key={b.id}
                      onClick={() => setSelectedBillId(b.id)}
                      className={
                        'w-full text-left rounded-md border p-3 transition-colors ' +
                        (isSelected
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-transparent hover:bg-muted/60')
                      }
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-sm font-medium truncate">{b.bill_number}</span>
                          {isDnPo && (
                            <span className="text-[10px] uppercase tracking-wide bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                              DN&apos;s PO
                            </span>
                          )}
                        </div>
                        <span className="font-mono tabular-nums text-sm shrink-0">
                          {formatCurrency(b.outstanding, 'QAR')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground">
                        <span>Total {formatCurrency(b.total_amount, 'QAR')} · paid {formatCurrency(b.paid_amount, 'QAR')}</span>
                        <span>{formatDate(b.issued_date)}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
            {targetsDifferentPo && (
              <p className="text-xs text-amber-600">
                Heads-up: this bill is on a different PO than the debit note.
                Applying still works (same supplier), but AP reporting will
                show the credit against this bill&apos;s PO, not the DN&apos;s.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Amount</label>
            <Input
              type="number" min={0.01} step="0.01"
              max={selectedBill ? maxApplicable : undefined}
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              disabled={!selectedBill}
              placeholder="0.00"
              className={overCap ? 'border-destructive focus-visible:ring-destructive' : undefined}
            />
            {selectedBill && (
              <p className={'text-xs ' + (overCap ? 'text-destructive' : 'text-muted-foreground')}>
                {overCap
                  ? `Exceeds max applicable ${formatCurrency(maxApplicable, 'QAR')}. Lower the amount to Apply.`
                  : `Max applicable: ${formatCurrency(maxApplicable, 'QAR')} (DN remaining ${formatCurrency(remainingDn, 'QAR')}, bill outstanding ${formatCurrency(selectedBill.outstanding, 'QAR')})`}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!selectedBill || !validAmount || submitting}>
            {submitting ? 'Applying…' : 'Apply'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
