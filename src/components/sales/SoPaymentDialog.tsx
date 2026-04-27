'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useCreateSOPayment, type SaleOrder } from '@/hooks/useSaleOrders'

// Must match the payment_method DB enum exactly
const PAYMENT_METHODS = [
  { value: 'cash',            label: 'Cash' },
  { value: 'bank_transfer',   label: 'Bank Transfer' },
  { value: 'cheque',          label: 'Cheque' },
  { value: 'online',          label: 'Online' },
  { value: 'online_transfer', label: 'Online Transfer' },
  { value: 'pay_later',       label: 'Pay Later' },
  { value: 'fawran',          label: 'Fawran' },
  { value: 'pos',             label: 'POS' },
] as const

type PaymentMethodValue = typeof PAYMENT_METHODS[number]['value']

const schema = z.object({
  amount: z.coerce.number().positive('Amount must be positive'),
  method: z.string().min(1, 'Select a method'),
  date: z.string().min(1, 'Date is required'),
  reference: z.string().optional().default(''),
  notes: z.string().optional().default(''),
})

type FormValues = z.infer<typeof schema>

interface SoPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  so: SaleOrder
}

export function SoPaymentDialog({ open, onOpenChange, so }: SoPaymentDialogProps) {
  const createPayment = useCreateSOPayment()
  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: {
      amount: 0,
      method: 'cash',
      date: new Date().toISOString().split('T')[0],
      reference: '',
      notes: '',
    },
  })

  function onSubmit(values: FormValues) {
    createPayment.mutate(
      {
        so_id: so.id,
        amount: values.amount,
        method: values.method,
        date: values.date,
        reference: values.reference || null,
        notes: values.notes || null,
        currency: 'QAR',
        exchange_rate: 1,
      },
      {
        onSuccess: () => {
          toast.success('Payment recorded')
          onOpenChange(false)
          form.reset()
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-md sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>Record Payment — {so.so_number}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="amount" render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount (QAR) *</FormLabel>
                  <FormControl><Input type="number" step="0.01" min="0" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="date" render={({ field }) => (
                <FormItem>
                  <FormLabel>Date *</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="method" render={({ field }) => (
              <FormItem>
                <FormLabel>Payment Method *</FormLabel>
                <FormControl>
                  <select {...field} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                    {PAYMENT_METHODS.map((m) => (
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
                <FormControl><Input placeholder="Transaction / cheque number" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createPayment.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={createPayment.isPending}>
                {createPayment.isPending ? 'Saving…' : 'Record Payment'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
