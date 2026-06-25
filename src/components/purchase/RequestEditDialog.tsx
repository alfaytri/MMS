'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useCreateEditRequest } from '@/hooks/usePoEditRequests'

interface Props {
  open:         boolean
  onOpenChange: (open: boolean) => void
  poId:         string
  poNumber:     string | null
}

export function RequestEditDialog({ open, onOpenChange, poId, poNumber }: Props) {
  const [reason, setReason] = useState('')
  const create = useCreateEditRequest()
  const tooShort = reason.trim().length > 0 && reason.trim().length < 10

  function handleSend() {
    create.mutate(
      { poId, reason },
      {
        onSuccess: () => {
          toast.success('Edit request sent — awaiting approval')
          setReason('')
          onOpenChange(false)
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setReason(''); onOpenChange(false) } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request Edit{poNumber ? ` — ${poNumber}` : ''}</DialogTitle>
          <DialogDescription>
            Explain what needs to change. An approver will review and grant the edit.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Qty for line 2 should be 10, not 1."
            rows={4}
            autoFocus
          />
          <p className={`text-xs ${tooShort ? 'text-destructive' : 'text-muted-foreground'}`}>
            {tooShort ? 'At least 10 characters required.' : `${reason.trim().length} / 10+ characters`}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setReason(''); onOpenChange(false) }} disabled={create.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={create.isPending || reason.trim().length < 10}
          >
            {create.isPending ? 'Sending…' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
