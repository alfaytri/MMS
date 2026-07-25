'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Wallet } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PaymentFormDialog, type PaymentFormValues } from '@/components/shared/PaymentFormDialog'
import { useCreateSOPayment, useSOPayments, type SaleOrder } from '@/hooks/useSaleOrders'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { useApplyStoreCredit } from '@/hooks/useCustomerPayments'
import { useOpenCreditNotesForCustomer } from '@/hooks/useOpenCreditNotes'
import { useCustomerCreditBalances } from '@/hooks/useCreditBalances'
import { formatCurrency } from '@/lib/utils/formatters'

interface SoPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  so: SaleOrder
}

export function SoPaymentDialog({ open, onOpenChange, so }: SoPaymentDialogProps) {
  const createPayment = useCreateSOPayment()
  const applyStoreCredit = useApplyStoreCredit()
  const { data: payments = [] } = useSOPayments(so.id)
  const { data: dbMethods = [] } = usePaymentMethods()
  // The balance view is the source of truth for panel visibility (same one
  // the customers list badge uses). openCNs is only needed at redemption
  // time to iterate FIFO — its complex nested join sometimes returns empty
  // when the CN's FK path doesn't resolve, so we can't gate the panel on it.
  const { data: balances = [] } = useCustomerCreditBalances()
  const { data: openCNs = [] } = useOpenCreditNotesForCustomer(open ? so.customer_id : null)

  const methods = dbMethods.map((m) => ({ value: m.slug, label: m.name }))
  const showExchangeRate = so.currency !== 'QAR'

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0)
  const outstanding = Math.max(0, (so.total ?? 0) - totalPaid)

  const availableCredit = useMemo(() => {
    const row = balances.find(
      (b) => b.party_id === so.customer_id && b.currency === so.currency,
    )
    return row?.open_amount ?? 0
  }, [balances, so.customer_id, so.currency])
  const availableCreditForThisSo = Math.min(availableCredit, outstanding)

  const [useCredit, setUseCredit] = useState(false)
  const [creditAmount, setCreditAmount] = useState('0')

  const creditPortion = useCredit
    ? Math.max(0, Math.min(Number(creditAmount) || 0, availableCreditForThisSo))
    : 0
  const outstandingAfterCredit = Math.max(0, outstanding - creditPortion)

  function toggleCredit(next: boolean) {
    setUseCredit(next)
    if (next) setCreditAmount(availableCreditForThisSo.toFixed(2))
    else      setCreditAmount('0')
  }

  async function handleSubmit(values: PaymentFormValues) {
    const rate = values.exchange_rate ?? so.exchange_rate ?? 1

    try {
      // 1. Redeem store credit (FIFO across CNs in SO's currency).
      if (creditPortion > 0) {
        const eligible = openCNs.filter((n) => n.currency === so.currency)
        const redemptions: { credit_note_id: string; amount: number }[] = []
        let remaining = creditPortion
        for (const cn of eligible) {
          if (remaining <= 0) break
          const take = Math.min(cn.amount, remaining)
          redemptions.push({ credit_note_id: cn.id, amount: take })
          remaining -= take
        }
        await applyStoreCredit.mutateAsync({
          source_type: 'sale_order',
          source_id:   so.id,
          customer_id: so.customer_id,
          redemptions,
          date:        values.date,
          reference:   values.reference || null,
          notes:       'Store-credit redemption',
          currency:    so.currency,
          exchange_rate: rate,
        })
      }

      // 2. Cash portion — whatever's left as a normal payment.
      if (values.amount > 0) {
        await new Promise<void>((resolve, reject) => {
          createPayment.mutate(
            {
              so_id: so.id,
              amount: values.amount,
              method: values.method,
              date: values.date,
              reference: values.reference || null,
              notes: values.notes || null,
              currency: so.currency,
              exchange_rate: rate,
            },
            { onSuccess: () => resolve(), onError: (e) => reject(e) },
          )
        })
      }

      toast.success(
        creditPortion > 0 && values.amount > 0
          ? `Applied ${formatCurrency(creditPortion, so.currency)} store credit + ${formatCurrency(values.amount, so.currency)}`
          : creditPortion > 0
            ? `Redeemed ${formatCurrency(creditPortion, so.currency)} in store credit`
            : 'Payment recorded',
      )
      onOpenChange(false)
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Payment failed')
    }
  }

  const isPending = createPayment.isPending || applyStoreCredit.isPending

  const headerSlot = availableCredit > 0 ? (
    <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2.5 space-y-2">
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={useCredit}
          onChange={(e) => toggleCredit(e.target.checked)}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            <Wallet className="h-3.5 w-3.5" />
            Apply store credit — {formatCurrency(availableCredit, so.currency)} available
          </div>
          <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
            {availableCredit >= outstanding
              ? `Covers this SO fully — remainder stays on the customer's balance.`
              : `Covers ${formatCurrency(availableCredit, so.currency)} of ${formatCurrency(outstanding, so.currency)}; the rest needs a real payment method.`}
          </p>
        </div>
      </label>
      {useCredit && (
        <div className="pl-6">
          <Label htmlFor="so-pay-credit" className="text-[11px] text-emerald-700 dark:text-emerald-400">Credit to apply</Label>
          <Input
            id="so-pay-credit"
            type="number"
            value={creditAmount}
            onChange={(e) => setCreditAmount(e.target.value)}
            step="0.01"
            min={0}
            max={availableCreditForThisSo}
            className="h-9 mt-1"
          />
        </div>
      )}
    </div>
  ) : null

  const extraConfirmationLines = creditPortion > 0
    ? [{ label: 'Credit Note Applied', value: `${so.currency} ${creditPortion.toLocaleString('en', { minimumFractionDigits: 2 })}` }]
    : undefined

  return (
    <PaymentFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Record Payment — ${so.so_number}`}
      currency={so.currency}
      methods={methods}
      defaultMethod={methods[0]?.value ?? 'cash'}
      isPending={isPending}
      onSubmit={handleSubmit}
      totalAmount={so.total}
      paidAmount={totalPaid}
      showExchangeRate={showExchangeRate}
      headerSlot={headerSlot}
      outstandingOverride={outstandingAfterCredit}
      extraConfirmationLines={extraConfirmationLines}
    />
  )
}
