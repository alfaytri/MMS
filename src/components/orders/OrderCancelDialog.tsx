// src/components/orders/OrderCancelDialog.tsx
'use client'
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useReasonLists } from '@/hooks/useReasonLists'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  orderId: string
  orderDisplayId: string
  customerName: string
  onConfirm: (reason: string, notes: string) => void
  isLoading?: boolean
}

export function OrderCancelDialog({
  open,
  onOpenChange,
  orderId: _orderId,
  orderDisplayId,
  customerName,
  onConfirm,
  isLoading,
}: Props) {
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const { reasons } = useReasonLists('cancellation')

  function handleClose() {
    setReason('')
    setNotes('')
    onOpenChange(false)
  }

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <AlertDialogContent className="w-full sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-red-600">Cancel Order</AlertDialogTitle>
        </AlertDialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-slate-600">
            <strong>{orderDisplayId}</strong> — {customerName}
          </p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Cancellation Reason *</label>
            <Select value={reason} onValueChange={(v) => setReason(v ?? '')}>
              <SelectTrigger className="min-h-11">
                <SelectValue placeholder="Select reason…" />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((r) => (
                  <SelectItem key={r.id} value={r.label}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Notes</label>
            <Textarea
              placeholder="Optional notes…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => handleClose()}>
            Keep Order
          </Button>
          <Button
            variant="destructive"
            disabled={!reason || isLoading}
            onClick={() => onConfirm(reason, notes)}
          >
            {isLoading ? 'Cancelling…' : 'Confirm Cancellation'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
