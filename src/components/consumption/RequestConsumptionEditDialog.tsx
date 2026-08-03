'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Send } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useRequestConsumptionEdit } from '@/hooks/useConsumption'

interface Props {
  open:          boolean
  onOpenChange:  (open: boolean) => void
  consumptionId: string | null
  ceNumber:      string | null
}

/**
 * Files a pending consumption_edit_requests row asking to cancel the
 * consumption. Any signed-in user can open; an approver configured on
 * the consumption_edit workflow decides.
 */
export function RequestConsumptionEditDialog({
  open, onOpenChange, consumptionId, ceNumber,
}: Props) {
  const [reason, setReason] = useState('')
  const request = useRequestConsumptionEdit()

  useEffect(() => {
    if (!open) setReason('')
  }, [open])

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
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit request')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
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

        <div className="space-y-3 py-1">
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

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" size="sm" className="text-[11px] h-8" onClick={() => onOpenChange(false)} disabled={request.isPending}>
            Cancel
          </Button>
          <Button size="sm" className="text-[11px] h-8" disabled={!reason.trim() || request.isPending} onClick={handleSubmit}>
            {request.isPending ? 'Submitting…' : 'Submit request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
