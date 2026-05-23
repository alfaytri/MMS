'use client'

import { useState } from 'react'
import { Ban } from 'lucide-react'
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useReasonLists } from '@/hooks/useReasonLists'
import { useVoidInvoice } from '@/hooks/useInvoices'
import type { FinanceInvoice } from '@/hooks/useInvoices'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  invoice: FinanceInvoice | null
}

export function VoidInvoiceDialog({ open, onOpenChange, invoice }: Props) {
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const { reasons, isLoading: loadingReasons } = useReasonLists('invoice_cancel')
  const voidMutation = useVoidInvoice()

  const handleVoid = async () => {
    if (!invoice || !reason) return
    try {
      await voidMutation.mutateAsync({
        invoiceId: invoice.id,
        invoiceDisplay: invoice.invoice_id,
        customerName: invoice.customer_name ?? 'Unknown',
        reason,
        notes: notes.trim() || null,
      })
      toast.success(`${invoice.invoice_id} voided`)
      onOpenChange(false)
      setReason('')
      setNotes('')
    } catch {
      toast.error('Failed to void invoice')
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-red-600">
            <Ban className="h-5 w-5" /> Void Invoice
          </AlertDialogTitle>
          <AlertDialogDescription>
            Voiding {invoice?.invoice_id} for {invoice?.customer_name ?? 'Unknown'}.
            A notification will be sent to accounting.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Reason *</Label>
            <Select value={reason} onValueChange={(v) => setReason(v ?? '')} disabled={loadingReasons}>
              <SelectTrigger><SelectValue placeholder="Select reason..." /></SelectTrigger>
              <SelectContent>
                {reasons.map((r) => (<SelectItem key={r.id} value={r.label}>{r.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional details..." rows={3} />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => { setReason(''); setNotes('') }}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={!reason || voidMutation.isPending} onClick={handleVoid}>
            {voidMutation.isPending ? 'Voiding...' : 'Void Invoice'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
