'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { formatCurrency } from '@/lib/utils/formatters'
import { humanizeDbError } from '@/lib/dbErrors'
import { useSettleRefund, type RefundPayable } from '@/hooks/useRefundsPayable'

const METHODS = ['cash', 'bank_transfer', 'cheque', 'card'] as const

/** Record a cash refund against an open refund credit note (settles the liability). */
export function SettleRefundDialog({ refund, onClose }: { refund: RefundPayable | null; onClose: () => void }) {
  const settle = useSettleRefund()
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<string>('cash')
  const [reference, setReference] = useState('')

  useEffect(() => {
    if (refund) { setAmount(String(refund.amount_remaining)); setMethod('cash'); setReference('') }
  }, [refund])

  if (!refund) return null
  const max = refund.amount_remaining
  const amt = Number(amount)
  const valid = amt > 0 && amt <= max

  async function submit() {
    if (!refund || !valid) return
    try {
      await settle.mutateAsync({ creditNoteId: refund.credit_note_id, amount: amt, method, reference: reference.trim() || null })
      toast.success(`Refund of ${formatCurrency(amt, refund.currency)} recorded for ${refund.note_number}`)
      onClose()
    } catch (e) {
      toast.error(humanizeDbError(e))
    }
  }

  return (
    <Dialog open={!!refund} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record refund — {refund.note_number}</DialogTitle>
          <DialogDescription>
            {refund.so_number ? `${refund.so_number} · ` : ''}Owed: {formatCurrency(max, refund.currency)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="refund-amount">Amount ({refund.currency})</Label>
            <Input
              id="refund-amount" type="number" min={0} max={max} step="0.01"
              value={amount} onChange={(e) => setAmount(e.target.value)}
            />
            {!valid && amount !== '' && (
              <p className="text-xs text-destructive">Enter an amount between 0 and {formatCurrency(max, refund.currency)}.</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="refund-method">Method</Label>
            <select
              id="refund-method" value={method} onChange={(e) => setMethod(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm capitalize"
            >
              {METHODS.map((m) => <option key={m} value={m} className="capitalize">{m.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="refund-ref">Reference (optional)</Label>
            <Input id="refund-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Cheque #, transfer ref…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={settle.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={!valid || settle.isPending}>
            {settle.isPending ? 'Recording…' : 'Record refund'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
