'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface PaymentDetail {
  label: string
  value: string
}

interface PaymentConfirmationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isPending: boolean
  title: string
  details: PaymentDetail[]
  countdownSeconds?: number
}

export function PaymentConfirmationDialog({
  open, onOpenChange, onConfirm, isPending,
  title, details, countdownSeconds = 3,
}: PaymentConfirmationDialogProps) {
  const [countdown, setCountdown] = useState(countdownSeconds)

  useEffect(() => {
    if (!open) { setCountdown(countdownSeconds); return }
    if (countdown <= 0) return

    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [open, countdown, countdownSeconds])

  const handleConfirm = useCallback(() => {
    if (countdown > 0 || isPending) return
    onConfirm()
  }, [countdown, isPending, onConfirm])

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isPending) onOpenChange(v) }}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-md sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Review the payment details below. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 rounded-lg border bg-muted/30 p-4">
          {details.map((d) => (
            <div key={d.label} className="flex justify-between gap-4 text-sm py-1.5">
              <span className="text-muted-foreground shrink-0">{d.label}</span>
              <span className="font-medium text-right">{d.value}</span>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-3 sm:gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="min-w-24"
          >
            Go Back
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={countdown > 0 || isPending}
            variant="destructive"
            className="min-w-40 font-semibold"
          >
            {isPending
              ? 'Recording...'
              : countdown > 0
                ? `Confirm (${countdown}s)`
                : 'Confirm Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
