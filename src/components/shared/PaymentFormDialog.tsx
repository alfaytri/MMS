'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { PaymentConfirmationDialog } from '@/components/shared/PaymentConfirmationDialog'

function formatWithCommas(value: string | number): string {
  const str = String(value)
  const [intPart, decPart] = str.split('.')
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return decPart !== undefined ? `${formatted}.${decPart}` : formatted
}

function stripCommas(value: string): string {
  return value.replace(/,/g, '')
}

function FormattedAmountInput({
  value, onChange, currency, outstanding, onPayFull,
}: {
  value: number
  onChange: (num: number) => void
  currency: string
  outstanding: number
  onPayFull: () => void
}) {
  const [displayValue, setDisplayValue] = useState(
    formatWithCommas(Number(value).toFixed(2))
  )

  useEffect(() => {
    const numDisplay = Number(stripCommas(displayValue))
    if (numDisplay !== Number(value)) {
      setDisplayValue(formatWithCommas(Number(value).toFixed(2)))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sync pattern: runs on external value change only; adding displayValue would create infinite loop
  }, [value])

  return (
    <FormItem>
      <FormLabel>Amount ({currency}) *</FormLabel>
      <div className="relative">
        <FormControl>
          <Input
            type="text"
            inputMode="decimal"
            value={displayValue}
            onChange={(e) => {
              const raw = stripCommas(e.target.value)
              if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) {
                setDisplayValue(formatWithCommas(raw))
                const num = Number(raw)
                if (!isNaN(num)) onChange(num)
              }
            }}
            onBlur={() => {
              const num = Number(stripCommas(displayValue))
              if (!isNaN(num)) {
                setDisplayValue(formatWithCommas(num.toFixed(2)))
                onChange(num)
              }
            }}
          />
        </FormControl>
        {Number(value) !== Number(outstanding.toFixed(2)) && outstanding > 0 && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 hover:bg-orange-200"
            onClick={() => {
              onPayFull()
              setDisplayValue(formatWithCommas(outstanding.toFixed(2)))
            }}
          >
            Pay Full
          </button>
        )}
      </div>
      <FormMessage />
    </FormItem>
  )
}

export interface PaymentMethod {
  value: string
  label: string
}

interface PaymentFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  currency: string
  methods: PaymentMethod[]
  defaultMethod?: string
  isPending: boolean
  onSubmit: (values: PaymentFormValues) => void
  totalAmount: number
  paidAmount: number
  showExchangeRate?: boolean
  /** Rendered between the payment summary and the amount input. Used to
   *  surface e.g. an "Apply store credit" panel above the cash inputs. */
  headerSlot?: React.ReactNode
  /** When set, further constrains the max amount the form allows below the
   *  natural outstanding. Used when part of the invoice is being paid by a
   *  separate flow (store credit) inside the same submit. */
  outstandingOverride?: number
  /** Extra rows prepended to the confirmation dialog (e.g. "Store Credit" +
   *  amount). Parent supplies these so the confirm step reflects the full
   *  transaction, not just the cash portion. */
  extraConfirmationLines?: { label: string; value: string }[]
}

export type PaymentFormValues = {
  amount: number
  method: string
  date: string
  reference: string
  notes: string
  exchange_rate?: number
}

export function PaymentFormDialog({
  open, onOpenChange, title, currency, methods,
  defaultMethod, isPending, onSubmit,
  totalAmount, paidAmount,
  showExchangeRate = false,
  headerSlot,
  outstandingOverride,
  extraConfirmationLines,
}: PaymentFormDialogProps) {
  const rawOutstanding = Math.max(0, totalAmount - paidAmount)
  const outstanding = outstandingOverride !== undefined
    ? Math.max(0, Math.min(outstandingOverride, rawOutstanding))
    : rawOutstanding
  const progressPct = totalAmount > 0 ? Math.min(100, (paidAmount / totalAmount) * 100) : 0

  // When outstandingOverride === 0, the whole invoice is being paid by a
  // parent flow (e.g. store credit) and the cash amount is legitimately 0.
  // Otherwise the amount must be positive.
  const allowZeroAmount = outstandingOverride === 0
  const paymentSchema = z.object({
    amount: allowZeroAmount
      ? z.coerce.number().min(0, 'Amount cannot be negative').max(0.01, 'No additional payment needed')
      : z.coerce.number()
          .positive('Amount must be positive')
          .max(outstanding + 0.01, `Amount exceeds outstanding (${currency} ${outstanding.toLocaleString('en', { minimumFractionDigits: 2 })})`),
    method: z.string().min(1, 'Select a method'),
    date: z.string().min(1, 'Date is required'),
    reference: z.string().optional().default(''),
    notes: z.string().optional().default(''),
    exchange_rate: showExchangeRate
      ? z.coerce.number({ message: 'Enter exchange rate' }).positive('Enter exchange rate')
      : z.coerce.number().positive().optional(),
  })

  const freshDefaults = () => ({
    amount: outstanding > 0 ? Number(outstanding.toFixed(2)) : 0,
    method: defaultMethod ?? methods[0]?.value ?? '',
    date: new Date().toISOString().split('T')[0],
    reference: '',
    notes: '',
    exchange_rate: undefined as unknown as number,
  })

  const form = useForm<z.infer<typeof paymentSchema>>({
    resolver: zodResolver(paymentSchema) as never,
    defaultValues: freshDefaults(),
  })

  useEffect(() => {
    if (open) form.reset(freshDefaults())
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dialog-reset pattern: runs on open only; freshDefaults is an inline function
  }, [open])

  // Auto-sync the amount when the parent lowers outstandingOverride (e.g. the
  // user toggles "Apply store credit"). Snap amount to the new remaining so
  // the user isn't stuck fixing a stale value. Only fires while the dialog
  // is open, and only when the override actually changes.
  useEffect(() => {
    if (!open || outstandingOverride === undefined) return
    form.setValue('amount', Number(outstanding.toFixed(2)), { shouldValidate: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only re-sync on override change
  }, [outstandingOverride, open])

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingValues, setPendingValues] = useState<PaymentFormValues | null>(null)

  const watchedAmount = form.watch('amount') || 0
  const watchedRate = form.watch('exchange_rate') || 1
  const qarEquivalent = watchedAmount * watchedRate
  const newPaidPct = totalAmount > 0
    ? Math.min(100, ((paidAmount + watchedAmount) / totalAmount) * 100)
    : 0

  const methodLabel = (val: string) => methods.find((m) => m.value === val)?.label ?? val

  function handleSubmit(values: z.infer<typeof paymentSchema>) {
    setPendingValues(values as PaymentFormValues)
    setConfirmOpen(true)
  }

  function handleConfirm() {
    if (!pendingValues) return
    onSubmit(pendingValues)
    setConfirmOpen(false)
    setPendingValues(null)
  }

  if (confirmOpen && pendingValues) {
    return (
      <PaymentConfirmationDialog
        open
        onOpenChange={(v) => { if (!v) { setConfirmOpen(false); setPendingValues(null) } }}
        onConfirm={handleConfirm}
        isPending={isPending}
        title={`Confirm Payment — ${title.replace('Record Payment — ', '')}`}
        details={[
          ...(extraConfirmationLines ?? []),
          ...(pendingValues.amount > 0
            ? [
                { label: 'Amount', value: `${currency} ${pendingValues.amount.toLocaleString('en', { minimumFractionDigits: 2 })}` },
                ...(showExchangeRate && pendingValues.exchange_rate
                  ? [
                      { label: 'Exchange Rate', value: String(pendingValues.exchange_rate) },
                      { label: 'QAR Equivalent', value: `QAR ${(pendingValues.amount * pendingValues.exchange_rate).toLocaleString('en', { minimumFractionDigits: 2 })}` },
                    ]
                  : []),
                { label: 'Method', value: methodLabel(pendingValues.method) },
                ...(pendingValues.reference ? [{ label: 'Reference', value: pendingValues.reference }] : []),
              ]
            : []),
          { label: 'Date', value: pendingValues.date },
          ...(pendingValues.notes ? [{ label: 'Notes', value: pendingValues.notes }] : []),
        ]}
      />
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-lg sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col min-h-0">
            {/* Scrollable body */}
            <div className="overflow-y-auto overflow-x-hidden flex-1 min-h-0 space-y-4 px-0.5 pb-1">
              {/* Payment Summary Header */}
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <div className="flex flex-wrap justify-between text-sm gap-x-4 gap-y-1">
                  <span className="whitespace-nowrap">Total: <span className="font-semibold">{currency} {totalAmount.toLocaleString('en', { minimumFractionDigits: 2 })}</span></span>
                  <span className="whitespace-nowrap">Paid: <span className="font-semibold">{currency} {paidAmount.toLocaleString('en', { minimumFractionDigits: 2 })}</span></span>
                  <span className="whitespace-nowrap">Due: <span className="font-semibold text-orange-600">{currency} {outstanding.toLocaleString('en', { minimumFractionDigits: 2 })}</span></span>
                </div>
                <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-green-500 transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                  {watchedAmount > 0 && (
                    <div
                      className="absolute inset-y-0 rounded-full bg-green-300 transition-all"
                      style={{
                        left: `${progressPct}%`,
                        width: `${Math.max(0, Math.min(newPaidPct - progressPct, 100 - progressPct))}%`,
                      }}
                    />
                  )}
                </div>
              </div>

              {headerSlot}

              {/* Row 1: Amount + Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="amount" render={({ field }) => (
                  <FormattedAmountInput
                    value={field.value}
                    onChange={field.onChange}
                    currency={currency}
                    outstanding={outstanding}
                    onPayFull={() => form.setValue('amount', Number(outstanding.toFixed(2)))}
                  />
                )} />

                <FormField control={form.control} name="date" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Row 2: Exchange Rate (PO only) */}
              {showExchangeRate && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField control={form.control} name="exchange_rate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Exchange Rate *</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.0001" min="0" placeholder="Enter rate" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div>
                    <p className="text-sm font-medium mb-1">QAR Equivalent</p>
                    <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm font-semibold">
                      = QAR {qarEquivalent.toLocaleString('en', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              )}

              {/* Row 3: Method + Reference — hidden when amount = 0 (the whole
                  invoice is being paid via credit or another parent flow, so
                  a cash-side method would just confuse users). */}
              {watchedAmount > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField control={form.control} name="method" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Method *</FormLabel>
                      <FormControl>
                        <select
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                          value={field.value}
                          onChange={field.onChange}
                        >
                          <option value="">Select...</option>
                          {methods.map((m) => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="reference" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reference</FormLabel>
                      <FormControl>
                        <Input placeholder="Transaction / cheque #" {...field} />
                      </FormControl>
                    </FormItem>
                  )} />
                </div>
              )}

              {/* Row 4: Notes */}
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Input placeholder="Optional notes" {...field} />
                  </FormControl>
                </FormItem>
              )} />
            </div>

            {/* Sticky footer — outside scrollable area */}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                Cancel
              </Button>
              {/* Gate on the RAW outstanding, not the credit-adjusted one —
                  when store credit covers the full remaining, the amount input
                  legitimately goes to 0 but the submit still needs to fire
                  (so the credit redemption records). */}
              <Button type="submit" disabled={isPending || rawOutstanding <= 0}>
                {isPending ? 'Recording…' : 'Record Payment'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
