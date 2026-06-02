'use client'

import { useState } from 'react'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  contractId: string
  onConfirm: (reason: string) => void
  isPending: boolean
}

export function CancelContractDialog({ open, onOpenChange, contractId, onConfirm, isPending }: Props) {
  const [reason, setReason] = useState('')

  function handleConfirm() {
    if (reason.trim().length < 10) return
    onConfirm(reason.trim())
    setReason('')
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel Contract {contractId}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will cancel the contract and remove all future unfinished visits.
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 py-4">
          <Label>Cancellation Reason *</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Explain why this contract is being cancelled (min 10 characters)..."
          />
          {reason.length > 0 && reason.length < 10 && (
            <p className="text-xs text-red-500">Minimum 10 characters required</p>
          )}
        </div>
        <AlertDialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Keep Contract
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={reason.trim().length < 10 || isPending}
          >
            {isPending ? 'Cancelling...' : 'Cancel Contract'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
