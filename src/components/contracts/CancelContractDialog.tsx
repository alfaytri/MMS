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
  /** Unpaid amount due in the current month — surfaced as a warning, not voided. */
  unpaidThisMonth?: number
  onConfirm: (reason: string) => void
  isPending: boolean
}

export function CancelContractDialog({ open, onOpenChange, contractId, unpaidThisMonth = 0, onConfirm, isPending }: Props) {
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
            This will cancel the contract, remove all future unfinished visits, and
            void payments due after this month. Amounts already due or paid are kept.
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {unpaidThisMonth > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
            This month&apos;s payment of {unpaidThisMonth.toLocaleString('en-QA')} QAR is not
            paid yet. It will remain owed after cancellation — collect it first if needed.
          </div>
        )}
        <div className="space-y-2 py-4">
          <Label htmlFor="cancel-reason">Cancellation Reason *</Label>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Explain why this contract is being cancelled (min 10 characters)..."
          />
          {reason.length > 0 && reason.length < 10 && (
            <p className="text-xs text-destructive">Minimum 10 characters required</p>
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
