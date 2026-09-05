'use client'
import { useEffect, useState } from 'react'
import { CreditCard } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter,
         DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { useCurrentUserProfile } from '@/hooks/useProfiles'
import {
  useRegisterTlInvoicePayment, validateTlPaymentAmount, type TlInvoice,
} from '@/hooks/useTlInvoices'
import { formatCurrency } from '@/lib/utils/formatters'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  invoice: TlInvoice | null
}

export function RegisterTlPaymentDialog({ open, onOpenChange, invoice }: Props) {
  const [amount, setAmount]     = useState('')
  const [methodId, setMethodId] = useState('')
  const [notes, setNotes]       = useState('')

  const { data: methods = [] } = usePaymentMethods()
  const { data: profile }      = useCurrentUserProfile()
  const registerMutation       = useRegisterTlInvoicePayment()

  const total     = invoice?.total_amount ?? 0
  const paid      = invoice?.paid_amount  ?? 0
  const remaining = Math.max(0, total - paid)

  useEffect(() => {
    if (open) { setAmount(''); setMethodId(''); setNotes('') }
  }, [open])

  const parsedAmount = parseFloat(amount.replace(/,/g, '')) || 0
  const clientError  = validateTlPaymentAmount({ total, alreadyPaid: paid, newAmount: parsedAmount })

  const handleFullAmount = () => setAmount(remaining > 0 ? remaining.toFixed(2) : '')
  const formatDisplay = (v: string) => {
    const n = parseFloat(v.replace(/,/g, ''))
    return isNaN(n) ? v : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const selectedMethod = methods.find((m) => m.id === methodId)

  const handleSubmit = async () => {
    if (!invoice) return
    if (clientError) { toast.error(clientError); return }
    if (!methodId)   { toast.error('Select a payment method'); return }

    try {
      await registerMutation.mutateAsync({
        tlInvoiceId:       invoice.id,
        invoiceNumber:     invoice.invoice_number,
        customerName:      invoice.customer_name,
        amount:            parsedAmount,
        paymentMethodId:   methodId,
        methodSlug:        selectedMethod?.slug ?? null,
        notes:             notes.trim() || null,
        registeredBy:      profile?.id ?? null,
        registeredByName:  profile?.full_name ?? null,
      })
      toast.success('Payment registered')
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to register payment')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" /> Register Payment
          </DialogTitle>
          <DialogDescription>
            For invoice <span className="font-semibold">{invoice?.invoice_number}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/30 p-4">
            <div>
              <p className="text-xs text-muted-foreground">Invoice Total</p>
              <p className="mt-1 font-semibold">{formatCurrency(total)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Paid</p>
              <p className="mt-1 font-semibold text-emerald-600">{formatCurrency(paid)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Remaining</p>
              <p className="mt-1 text-base font-bold">{formatCurrency(remaining)}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="tl-pay-amount">Amount</Label>
              <button type="button" onClick={handleFullAmount}
                      className="text-xs text-primary hover:underline">
                Full amount ({formatCurrency(remaining)})
              </button>
            </div>
            <Input
              id="tl-pay-amount" type="text" inputMode="decimal"
              placeholder="0.00" value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
              onBlur={() => setAmount(formatDisplay(amount))}
              className="h-10 font-mono text-lg"
            />
            {clientError && parsedAmount > 0 && (
              <p className="text-xs text-destructive">{clientError}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="tl-pay-method">Payment Method</Label>
              <Select value={methodId} onValueChange={(v) => { if (v) setMethodId(v) }}>
                <SelectTrigger id="tl-pay-method" className="h-10 w-full">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  {methods.length === 0 ? (
                    <SelectItem value="__none" disabled>No active payment methods</SelectItem>
                  ) : (
                    methods.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Registered By</Label>
              <Input value={profile?.full_name ?? '—'} disabled className="h-10 bg-muted" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tl-pay-notes">Notes (optional)</Label>
            <Textarea id="tl-pay-notes" placeholder="Additional notes…"
                      value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={registerMutation.isPending || parsedAmount <= 0 || !methodId || clientError !== null}
          >
            {registerMutation.isPending ? 'Registering…' : 'Register Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
