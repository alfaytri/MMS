'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSupplierBills } from '@/hooks/useSupplierBills'
import { useUnlinkedOutgoingPayments } from '@/hooks/useSupplierPayments'
import { useAttachPaymentToBill } from '@/hooks/useAttachPaymentToBill'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 'attach-bill': called from Payments page — paymentId is set, user picks a bill */
  mode: 'attach-bill' | 'link-payment'
  paymentId?: string   // required when mode = 'attach-bill'
  billId?: string      // required when mode = 'link-payment'
  supplierId?: string | null
}

export function AttachBillDialog({ open, onOpenChange, mode, paymentId, billId, supplierId }: Props) {
  const [selectedId, setSelectedId] = useState<string>('')
  const [allocationAmount, setAllocationAmount] = useState('')
  const attach = useAttachPaymentToBill()

  // attach-bill mode: fetch unpaid/partially_paid bills for this supplier.
  // Query is suppressed when supplierId is absent — prevents pulling every bill in the DB.
  const { data: bills = [], isLoading: loadingBills } = useSupplierBills(
    { supplier_id: supplierId ?? undefined },
    { enabled: mode === 'attach-bill' && !!supplierId }
  )
  const availableBills = bills.filter(
    (b) => b.payment_status === 'unpaid' || b.payment_status === 'partially_paid'
  )

  // link-payment mode: fetch unlinked outgoing payments for this supplier (kept for fallback)
  const { data: _payments = [], isLoading: loadingPayments } = useUnlinkedOutgoingPayments(
    mode === 'link-payment' ? supplierId : undefined
  )

  type AvailablePayment = { id: string; payment_id: string; amount: number; method: string; date: string; reference: string | null; allocated: number; remaining: number }

  // link-payment mode: fetch all outgoing payments for this supplier with their allocated amounts
  const { data: availablePayments = [], isLoading: loadingAvailable } = useQuery<AvailablePayment[]>({
    queryKey: ['supplier-payments-available', supplierId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('payments')
        .select(`
          id, payment_id, amount, method, date, reference,
          payment_bill_allocations(amount)
        `)
        .eq('supplier_id', supplierId)
        .eq('direction', 'outgoing')
        .order('date', { ascending: false })
      if (error) throw error
      type RawPayment = { id: string; payment_id: string; amount: number; method: string; date: string; reference: string | null; payment_bill_allocations: { amount: number }[] }
      return (data ?? []).map((p: RawPayment) => {
        const allocated = (p.payment_bill_allocations ?? []).reduce((s: number, a: { amount: number }) => s + a.amount, 0)
        return {
          ...p,
          allocated,
          remaining: p.amount - allocated,
        }
      }).filter((p: RawPayment & { remaining: number }) => p.remaining > 0.001)
    },
    enabled: mode === 'link-payment' && !!supplierId,
  })

  // attach-bill mode: fetch the payment's full amount so we can pass it to allocate_payment_to_bill
  const { data: paymentForAmount } = useQuery({
    queryKey: ['payment-amount', paymentId],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await (supabase as any)
        .from('payments')
        .select('amount')
        .eq('id', paymentId)
        .single()
      return data?.amount ?? 0
    },
    enabled: mode === 'attach-bill' && !!paymentId,
  })

  const missingSupplier = mode === 'attach-bill' && !supplierId
  const isLoading = !missingSupplier && (mode === 'attach-bill' ? loadingBills : loadingPayments)
  const isEmpty   = !missingSupplier && (mode === 'attach-bill' ? availableBills.length === 0 : false)

  function handleOpenChange(v: boolean) {
    if (!v) { setSelectedId(''); setAllocationAmount('') }
    onOpenChange(v)
  }

  function handlePaymentSelect(pId: string) {
    setSelectedId(pId)
    const p = availablePayments.find((p) => p.id === pId)
    if (p) setAllocationAmount(String(p.remaining.toFixed(2)))
  }

  async function handleConfirm() {
    if (!selectedId) return
    try {
      if (mode === 'attach-bill') {
        await attach.mutateAsync({ paymentId: paymentId!, billId: selectedId, amount: paymentForAmount ?? 0 })
      } else {
        const amount = parseFloat(allocationAmount)
        if (!amount || amount <= 0) return
        await attach.mutateAsync({ paymentId: selectedId, billId: billId!, amount })
      }
      toast.success(mode === 'attach-bill' ? 'Bill attached to payment.' : 'Payment linked to bill.')
      handleOpenChange(false)
    } catch {
      toast.error('Failed to link. Please try again.')
    }
  }

  const title = mode === 'attach-bill' ? 'Attach Bill to Payment' : 'Link Payment to Bill'
  const emptyMsg = mode === 'attach-bill'
    ? 'No unpaid bills found for this supplier.'
    : 'No unlinked payments found for this supplier.'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {missingSupplier ? (
          <p className="text-sm text-destructive py-4">No supplier linked to this payment — cannot search for bills.</p>
        ) : mode === 'attach-bill' ? (
          isLoading ? (
            <p className="text-sm text-muted-foreground py-4">Loading…</p>
          ) : isEmpty ? (
            <p className="text-sm text-muted-foreground py-4">{emptyMsg}</p>
          ) : (
            <Select value={selectedId} onValueChange={(v) => setSelectedId(v ?? '')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {availableBills.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.invoice_id ?? b.id} — {formatCurrency(b.total_amount ?? 0, 'QAR')} ({formatDate(b.created_at ?? '')})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        ) : (
          // link-payment mode
          loadingAvailable ? (
            <p className="text-sm text-muted-foreground py-4">Loading payments…</p>
          ) : availablePayments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No payments with remaining balance for this supplier.</p>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {availablePayments.map((p) => (
                  <div
                    key={p.id}
                    className={cn(
                      'border rounded-md p-3 cursor-pointer transition-colors',
                      selectedId === p.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
                    )}
                    onClick={() => handlePaymentSelect(p.id)}
                  >
                    <div className="flex justify-between text-sm font-medium">
                      <span className="font-mono">{p.payment_id ?? '—'}</span>
                      <span>{formatCurrency(p.amount, 'QAR')}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>{formatDate(p.date)} · {p.method.replace(/_/g, ' ')}</span>
                      <span className="text-green-600 font-medium">
                        Remaining: {formatCurrency(p.remaining, 'QAR')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {selectedId && (
                <div className="space-y-1 pt-1">
                  <Label className="text-sm">Amount to allocate (QAR)</Label>
                  <Input
                    type="number"
                    min={0.01}
                    step="0.01"
                    max={availablePayments.find((p) => p.id === selectedId)?.remaining ?? undefined}
                    value={allocationAmount}
                    onChange={(e) => setAllocationAmount(e.target.value)}
                  />
                </div>
              )}
            </div>
          )
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={
              (mode === 'attach-bill'
                ? (!selectedId || missingSupplier)
                : (!selectedId || !allocationAmount || parseFloat(allocationAmount) <= 0)
              ) || attach.isPending
            }
            onClick={handleConfirm}
          >
            {attach.isPending ? 'Saving…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
