'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Send } from 'lucide-react'
import { toast } from 'sonner'
import {
  DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  GuardedDialog,
  type GuardedFormDialogHandle,
} from '@/components/shared/GuardedFormDialog'
import { useRequestConsumptionEdit } from '@/hooks/useConsumption'

interface Props {
  open:          boolean
  onOpenChange:  (open: boolean) => void
  consumptionId: string | null
  ceNumber:      string | null
}

export function RequestConsumptionEditDialog({
  open, onOpenChange, consumptionId, ceNumber,
}: Props) {
  const [reason, setReason] = useState('')
  const request = useRequestConsumptionEdit()
  const guardRef = useRef<GuardedFormDialogHandle>(null)

  useEffect(() => {
    if (!open) setReason('')
  }, [open])

  const isDirty = reason.trim().length > 0

  async function handleSubmit() {
    if (!consumptionId) return
    const trimmed = reason.trim()
    if (!trimmed) {
      toast.error('Reason is required')
      return
    }
    try {
      await request.mutateAsync({ consumption_id: consumptionId, reason: trimmed })
      toast.success('Cancellation request submitted — awaiting approver')
      guardRef.current?.closeAfterSubmit()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit request')
    }
  }

  return (
    <GuardedDialog open={open} onOpenChange={onOpenChange} isDirty={isDirty} ref={guardRef}>
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-md sm:rounded-xl max-h-[100vh] sm:max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold flex items-center gap-1.5">
            <Send className="h-4 w-4 text-primary" />
            Request cancellation
          </DialogTitle>
          <DialogDescription className="text-[11px] text-muted-foreground">
            {ceNumber ? `Consumption ${ceNumber}. ` : ''}
            An approver configured on the Consumption Edit workflow will review this request. On approval the stock is restored and COGS is reversed.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-3 py-1">
          <div className="rounded-md border border-warning/40 bg-warning/10 p-2.5 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
            <p className="text-[11px] text-warning-foreground leading-snug">
              Cancellations reverse FIFO consumption. Only submit if the entry was posted incorrectly — repeated stock churn distorts weighted-average costs.
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-medium">Reason</Label>
            <Textarea
              className="text-[11px] min-h-[96px] resize-none"
              placeholder="e.g. Posted 12 units by mistake — the actual job used 3. Approve to reverse so I can re-post correctly."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
            <p className="text-[10px] text-muted-foreground">
              The approver sees this verbatim. Be specific.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2 sticky bottom-0 bg-background pt-3 border-t">
          <Button variant="outline" size="sm" className="text-[11px] h-11 sm:h-8" onClick={() => guardRef.current?.requestClose()} disabled={request.isPending}>
            Cancel
          </Button>
          <Button size="sm" className="text-[11px] h-11 sm:h-8" disabled={!reason.trim() || request.isPending} onClick={handleSubmit}>
            {request.isPending ? 'Submitting…' : 'Submit request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </GuardedDialog>
  )
}
