'use client'

import { useState, useEffect, useRef } from 'react'
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'
import {
  GuardedDialog,
  type GuardedFormDialogHandle,
} from '@/components/shared/GuardedFormDialog'
import { useChangeDocumentBookedRate } from '@/hooks/useChangeDocumentBookedRate'
import {
  useExchangeRateChangeLog,
  type DocumentType,
} from '@/hooks/useExchangeRateChangeLog'

export function ChangeBookedRateDialog({
  documentType,
  documentId,
  currency,
  currentRate,
  open,
  onOpenChange,
}: {
  documentType: DocumentType
  documentId: string
  currency: string
  currentRate: number
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [newRate, setNewRate] = useState<number>(currentRate)
  const [reason, setReason] = useState('')
  const mutation = useChangeDocumentBookedRate()
  const { data: history = [] } = useExchangeRateChangeLog(documentType, documentId)
  const guardRef = useRef<GuardedFormDialogHandle>(null)

  useEffect(() => {
    if (open) {
      setNewRate(currentRate)
      setReason('')
    }
  }, [open, currentRate])

  const reasonValid = reason.trim().length >= 5
  const rateValid = newRate > 0 && newRate !== currentRate
  const canSubmit = reasonValid && rateValid && !mutation.isPending

  // Dirty when the operator changed the rate away from the current
  // document rate or typed anything into the reason box.
  const isDirty = newRate !== currentRate || reason.trim().length > 0

  async function handleConfirm() {
    await mutation.mutateAsync({
      documentType,
      documentId,
      newRate,
      reason: reason.trim(),
    })
    guardRef.current?.closeAfterSubmit()
  }

  return (
    <GuardedDialog open={open} onOpenChange={onOpenChange} isDirty={isDirty} ref={guardRef}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Change Booked Exchange Rate</DialogTitle>
          <DialogDescription>
            The booked rate is the reference used to calculate exchange
            gain/loss on this {documentType.toUpperCase()}.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 flex gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900 dark:text-amber-200">
            Changing the booked rate will recompute exchange gain/loss on all
            payments for this document. Historical inventory cost is
            unaffected.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Current Rate
            </label>
            <div className="h-9 px-3 flex items-center rounded-md border bg-muted/30 text-sm font-semibold tabular-nums">
              1 {currency} ={' '}
              {currentRate.toLocaleString('en-QA', {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
              })}{' '}
              QAR
            </div>
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              New Rate <span className="text-destructive">*</span>
            </label>
            <Input
              type="number"
              min="0.0001"
              step="0.0001"
              value={newRate || ''}
              onChange={(e) => setNewRate(Number(e.target.value))}
              placeholder="e.g. 3.5800"
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Reason <span className="text-destructive">*</span>{' '}
            <span className="normal-case text-muted-foreground/70">
              (min 5 characters)
            </span>
          </label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Bank confirmed actual settlement rate as 3.58"
            rows={3}
          />
        </div>

        {history.length > 0 && (
          <div className="border-t pt-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Recent changes
            </p>
            <ul className="text-xs space-y-1 max-h-24 overflow-y-auto">
              {history.slice(0, 3).map((h) => (
                <li key={h.id} className="tabular-nums text-muted-foreground">
                  {new Date(h.changed_at).toLocaleDateString('en-QA')} ·{' '}
                  {h.old_rate.toFixed(4)} → {h.new_rate.toFixed(4)} ·{' '}
                  {h.changer_name ?? 'unknown'} —{' '}
                  <span className="italic">{h.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => guardRef.current?.requestClose()}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!canSubmit}>
            {mutation.isPending ? 'Saving…' : 'Confirm change'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </GuardedDialog>
  )
}
