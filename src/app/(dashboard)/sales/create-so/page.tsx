'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { SoLineItemsEditor, type SOLineItemRow } from '@/components/sales/SoLineItemsEditor'
import {
  useCreateSO,
  useConfirmSO,
  useCustomers,
  useCreateCustomer,
  calcSOSubtotal,
  calcSOTotal,
  hasNegativeMargin,
} from '@/hooks/useSaleOrders'
import { formatCurrency } from '@/lib/utils/formatters'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const customerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email().optional().or(z.literal('')),
})

export default function CreateSOPage() {
  const router = useRouter()
  const createSO = useCreateSO()
  const confirmSO = useConfirmSO()
  const createCustomer = useCreateCustomer()

  const [customerSearch, setCustomerSearch] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [lineItems, setLineItems] = useState<SOLineItemRow[]>([])
  const [discountType, setDiscountType] = useState<'fixed' | 'percentage'>('fixed')
  const [discountAmount, setDiscountAmount] = useState(0)
  const [discountLabel, setDiscountLabel] = useState('')
  const [notes, setNotes] = useState('')
  const [addCustomerOpen, setAddCustomerOpen] = useState(false)

  const { data: customers } = useCustomers(customerSearch || undefined)

  const customerForm = useForm<z.infer<typeof customerSchema>>({
    resolver: zodResolver(customerSchema) as never,
    defaultValues: { name: '', email: '' },
  })

  const subtotal = calcSOSubtotal(lineItems)
  const total = calcSOTotal(subtotal, discountAmount, discountType)
  const negativeMargin = hasNegativeMargin(lineItems)

  function handleSelectCustomer(c: { id: string; name: string }) {
    setCustomerId(c.id)
    setCustomerName(c.name)
    setCustomerSearch(c.name)
  }

  function handleAddCustomer(values: z.infer<typeof customerSchema>) {
    createCustomer.mutate(
      { name: values.name, email: values.email || null },
      {
        onSuccess: (data: any) => {
          toast.success('Customer added')
          handleSelectCustomer({ id: data.id, name: data.name })
          setAddCustomerOpen(false)
          customerForm.reset()
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function validate() {
    if (!customerId) { toast.error('Please select a customer'); return false }
    if (lineItems.length === 0) { toast.error('Add at least one line item'); return false }
    if (lineItems.some((l) => !l.item_name)) { toast.error('All line items need an item name'); return false }
    return true
  }

  function buildPayload() {
    return {
      customer_id: customerId,
      customer_name: customerName,
      notes: notes || null,
      discount_amount: discountAmount,
      discount_label: discountLabel || null,
      discount_type: discountType,
      line_items: lineItems.map(({ _key, ...li }) => li),
    }
  }

  function saveQuotation() {
    if (!validate()) return
    createSO.mutate(buildPayload(), {
      onSuccess: () => { toast.success('Saved as quotation'); router.push('/sales/orders') },
      onError: (err) => toast.error(err.message),
    })
  }

  function confirmOrder() {
    if (!validate()) return
    createSO.mutate(buildPayload(), {
      onSuccess: (so: any) => {
        confirmSO.mutate(
          { id: so.id, lineItems: so.sale_order_lines ?? [] },
          {
            onSuccess: () => { toast.success('Order confirmed'); router.push('/sales/orders') },
            onError: (err) => toast.error(err.message),
          }
        )
      },
      onError: (err) => toast.error(err.message),
    })
  }

  const isPending = createSO.isPending || confirmSO.isPending

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.back()}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">Create Sale Order</h1>
      </div>

      {/* Customer */}
      <section className="rounded-lg border p-4 space-y-3">
        <h2 className="font-semibold">Customer</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Input
              placeholder="Search customers…"
              value={customerSearch}
              onChange={(e) => { setCustomerSearch(e.target.value); setCustomerId(''); setCustomerName('') }}
            />
            {customerSearch && !customerId && (customers ?? []).length > 0 && (
              <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-md border bg-popover shadow-md">
                {(customers ?? []).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
                    onClick={() => handleSelectCustomer(c)}
                  >
                    <span className="font-medium">{c.name}</span>
                    {c.customer_number && <span className="text-xs text-muted-foreground">{c.customer_number}</span>}
                    {c.is_blocked && <Badge variant="destructive" className="text-[10px] h-4">Blocked</Badge>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button type="button" variant="outline" onClick={() => setAddCustomerOpen(true)}>
            + Add Customer
          </Button>
        </div>
        {customerId && (
          <Badge variant="outline" className="text-success border-success">✓ {customerName}</Badge>
        )}
      </section>

      {/* Line Items */}
      <section className="rounded-lg border p-4 space-y-3">
        <h2 className="font-semibold">Line Items</h2>
        {negativeMargin && (
          <div className="flex items-center gap-2 rounded-md border border-warning bg-warning/5 px-3 py-2 text-sm text-warning">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            One or more items are priced below cost. A margin approval will be required.
          </div>
        )}
        <SoLineItemsEditor value={lineItems} onChange={setLineItems} />
      </section>

      {/* Discount */}
      <section className="rounded-lg border p-4 space-y-3">
        <h2 className="font-semibold">Discount</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label>Discount Label</Label>
            <Input placeholder="e.g. Loyalty discount" value={discountLabel} onChange={(e) => setDiscountLabel(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <div className="flex gap-2">
              {(['fixed', 'percentage'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDiscountType(t)}
                  className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${discountType === t ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}
                >
                  {t === 'fixed' ? 'Fixed (QAR)' : 'Percentage (%)'}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label>Amount {discountType === 'percentage' ? '(%)' : '(QAR)'}</Label>
            <Input type="number" min="0" step="0.01" value={discountAmount} onChange={(e) => setDiscountAmount(Number(e.target.value))} />
          </div>
        </div>
      </section>

      {/* Notes */}
      <section className="rounded-lg border p-4 space-y-2">
        <h2 className="font-semibold">Notes</h2>
        <Textarea placeholder="Internal notes…" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </section>

      {/* Footer */}
      <section className="rounded-lg border p-4 space-y-3">
        <div className="space-y-1 text-sm text-right">
          <div className="text-muted-foreground">Subtotal: <span className="text-foreground">{formatCurrency(subtotal, 'QAR')}</span></div>
          {discountAmount > 0 && (
            <div className="text-muted-foreground">
              Discount: <span className="text-destructive">-{formatCurrency(discountType === 'percentage' ? (subtotal * discountAmount / 100) : discountAmount, 'QAR')}</span>
            </div>
          )}
          <div className="font-semibold text-base">Total: {formatCurrency(total, 'QAR')}</div>
        </div>
        <Separator />
        <div className="flex flex-col sm:flex-row gap-2 justify-end">
          <Button variant="outline" onClick={saveQuotation} disabled={isPending}>
            {createSO.isPending ? 'Saving…' : 'Save as Quotation'}
          </Button>
          <Button onClick={confirmOrder} disabled={isPending}>
            {isPending ? 'Confirming…' : 'Confirm Order'}
          </Button>
        </div>
      </section>

      {/* Add Customer Dialog */}
      <Dialog open={addCustomerOpen} onOpenChange={setAddCustomerOpen}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-md sm:rounded-lg">
          <DialogHeader><DialogTitle>Add Customer</DialogTitle></DialogHeader>
          <Form {...customerForm}>
            <form onSubmit={customerForm.handleSubmit(handleAddCustomer)} className="space-y-4">
              <FormField control={customerForm.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Name *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={customerForm.control} name="email" render={({ field }) => (
                <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAddCustomerOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createCustomer.isPending}>{createCustomer.isPending ? 'Adding…' : 'Add Customer'}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
