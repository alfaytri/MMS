// src/components/sales/CustomerPaymentEditDialog.tsx
'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useEditCustomerPayment } from '@/hooks/useCustomerPayments'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'

export type EditableCustomerPayment = {
  id: string
  amount: number
  method: string
  date: string
  reference: string | null
  notes: string | null
  currency: string
  exchange_rate: number
  invoice_id?: string | null
  sale_order_id?: string | null
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  payment: EditableCustomerPayment | null
}

export function CustomerPaymentEditDialog({ open, onOpenChange, payment }: Props) {
  const edit = useEditCustomerPayment()
  const { data: dbMethods = [] } = usePaymentMethods()
  // Store-credit redemptions are refused by the RPC — filter that method
  // out so operators can't select it while editing a non-CN payment.
  const methods = dbMethods
    .filter((m) => m.slug !== 'credit_note' && m.slug !== 'store_credit')
    .map((m) => ({ value: m.slug, label: m.name }))

  const showExchangeRate = !!payment && payment.currency !== 'QAR'

  const schema = z.object({
    amount:        z.coerce.number().positive('Amount must be positive'),
    method:        z.string().min(1, 'Select a method'),
    date:          z.string().min(1, 'Date is required'),
    reference:     z.string().optional().default(''),
    notes:         z.string().optional().default(''),
    exchange_rate: showExchangeRate
      ? z.coerce.number().positive('Enter exchange rate')
      : z.coerce.number().positive().optional(),
  })

  type FormValues = z.infer<typeof schema>

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: {
      amount: 0, method: '', date: '', reference: '', notes: '',
      exchange_rate: undefined as unknown as number,
    },
  })

  useEffect(() => {
    if (open && payment) {
      form.reset({
        amount:        Number(payment.amount ?? 0),
        method:        payment.method ?? '',
        date:          payment.date ?? '',
        reference:     payment.reference ?? '',
        notes:         payment.notes ?? '',
        exchange_rate: showExchangeRate ? Number(payment.exchange_rate ?? 1) : undefined,
      } as FormValues)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, payment?.id])

  const [confirmOpen, setConfirmOpen] = useState(false)

  async function commit(values: FormValues) {
    if (!payment) return
    try {
      await edit.mutateAsync({
        payment_id:    payment.id,
        amount:        values.amount,
        method:        values.method,
        date:          values.date,
        reference:     values.reference?.trim() ? values.reference.trim() : null,
        notes:         values.notes?.trim()     ? values.notes.trim()     : null,
        exchange_rate: showExchangeRate ? values.exchange_rate ?? null : null,
        invoice_id:    payment.invoice_id ?? null,
        sale_order_id: payment.sale_order_id ?? null,
      })
      toast.success('Payment updated')
      setConfirmOpen(false)
      onOpenChange(false)
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Failed to update payment')
    }
  }

  return (
    <>
      <Dialog open={open && !confirmOpen} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Customer Payment</DialogTitle>
          </DialogHeader>

          {!payment ? (
            <p className="text-sm text-muted-foreground py-6">No payment selected.</p>
          ) : (
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(() => setConfirmOpen(true))}
                className="space-y-3"
              >
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount ({payment.currency})</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min={0.01} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {showExchangeRate && (
                  <FormField
                    control={form.control}
                    name="exchange_rate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Exchange rate ({payment.currency} → QAR)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.0001" min={0.0001} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="method"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Method</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select…" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {methods.map((m) => (
                            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="reference"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reference</FormLabel>
                      <FormControl>
                        <Input placeholder="Cheque / transfer #, receipt no…" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea rows={2} placeholder="Reason for edit, correction context, etc." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter className="pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    disabled={edit.isPending}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={edit.isPending}>
                    Save Changes
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save changes?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The invoice&apos;s outstanding balance and payment status will be recalculated automatically.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={edit.isPending}>
              Back
            </Button>
            <Button onClick={form.handleSubmit(commit)} disabled={edit.isPending}>
              {edit.isPending ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving…</> : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
