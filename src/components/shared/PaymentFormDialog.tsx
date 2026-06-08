'use client'

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

const paymentSchema = z.object({
  amount: z.coerce.number().positive('Amount must be positive'),
  method: z.string().min(1, 'Select a method'),
  date: z.string().min(1, 'Date is required'),
  reference: z.string().optional().default(''),
  notes: z.string().optional().default(''),
})

export type PaymentFormValues = z.infer<typeof paymentSchema>

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
}

export function PaymentFormDialog({
  open, onOpenChange, title, currency, methods,
  defaultMethod, isPending, onSubmit,
}: PaymentFormDialogProps) {
  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema) as never,
    defaultValues: {
      amount: 0,
      method: defaultMethod ?? methods[0]?.value ?? '',
      date: new Date().toISOString().split('T')[0],
      reference: '',
      notes: '',
    },
  })

  function handleSubmit(values: PaymentFormValues) {
    onSubmit(values)
    form.reset()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-md sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="amount" render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount ({currency}) *</FormLabel>
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
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving…' : 'Record Payment'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
