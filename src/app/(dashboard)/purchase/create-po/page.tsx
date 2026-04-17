'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { PoLineItemsEditor, type LineItemRow } from '@/components/purchase/PoLineItemsEditor'
import { PoTermsSection, type PoTermsValues } from '@/components/purchase/PoTermsSection'
import { useCreatePO, useSubmitPOForApproval, calcApprovalLevel } from '@/hooks/usePurchaseOrders'
import { useSuppliers, useCreateSupplier } from '@/hooks/useSuppliers'
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

const CURRENCIES = ['QAR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'KWD'] as const

const supplierSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  contact_name: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  email: z.string().optional().default(''),
})

export default function CreatePOPage() {
  const router = useRouter()
  const createPO = useCreatePO()
  const submitForApproval = useSubmitPOForApproval()
  const { data: suppliers } = useSuppliers()
  const createSupplier = useCreateSupplier()

  const [supplierId, setSupplierId] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [supplierSearch, setSupplierSearch] = useState('')
  const [currency, setCurrency] = useState<string>('QAR')
  const [exchangeRate, setExchangeRate] = useState(1)
  const [expectedDelivery, setExpectedDelivery] = useState('')
  const [lineItems, setLineItems] = useState<LineItemRow[]>([])
  const [terms, setTerms] = useState<PoTermsValues>({
    payment_terms: '', payment_terms_notes: '', delivery_terms: '', delivery_terms_notes: '', vendor_notes: '',
  })
  const [discountAmount, setDiscountAmount] = useState(0)
  const [discountLabel, setDiscountLabel] = useState('')
  const [addSupplierOpen, setAddSupplierOpen] = useState(false)

  const subtotal = lineItems.reduce((s, li) => s + li.total_price, 0)
  const totalQar = (subtotal - discountAmount) * exchangeRate
  const approvalLevel = calcApprovalLevel(totalQar)

  const supplierForm = useForm<z.infer<typeof supplierSchema>>({
    resolver: zodResolver(supplierSchema) as never,
    defaultValues: { name: '', contact_name: '', phone: '', email: '' },
  })

  function handleSelectSupplier(s: { id: string; name: string }) {
    setSupplierId(s.id)
    setSupplierName(s.name)
    setSupplierSearch(s.name)
  }

  function handleAddSupplier(values: z.infer<typeof supplierSchema>) {
    createSupplier.mutate(
      { name: values.name, contact_name: values.contact_name || null, phone: values.phone || null, email: values.email || null },
      {
        onSuccess: (data) => {
          toast.success('Supplier added')
          handleSelectSupplier({ id: data.id, name: data.name })
          setAddSupplierOpen(false)
          supplierForm.reset()
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function buildPayload() {
    return {
      supplier_id: supplierId,
      supplier_name: supplierName,
      currency,
      exchange_rate: exchangeRate,
      expected_delivery: expectedDelivery || null,
      payment_terms: terms.payment_terms || null,
      payment_terms_notes: terms.payment_terms_notes || null,
      delivery_terms: terms.delivery_terms || null,
      delivery_terms_notes: terms.delivery_terms_notes || null,
      vendor_notes: terms.vendor_notes || null,
      discount_amount: discountAmount,
      discount_label: discountLabel || null,
      line_items: lineItems.map(({ _key, ...li }) => li),
    }
  }

  function validate() {
    if (!supplierId) { toast.error('Please select a supplier'); return false }
    if (lineItems.length === 0) { toast.error('Add at least one line item'); return false }
    if (lineItems.some((li) => !li.item_name)) { toast.error('All line items need an item name'); return false }
    return true
  }

  function saveDraft() {
    if (!validate()) return
    createPO.mutate(buildPayload(), {
      onSuccess: () => { toast.success('Saved as draft'); router.push('/purchase/orders') },
      onError: (err) => toast.error(err.message),
    })
  }

  function submitApproval() {
    if (!validate()) return
    createPO.mutate(buildPayload(), {
      onSuccess: (po) => {
        submitForApproval.mutate(
          { id: po.id, approval_level: approvalLevel },
          {
            onSuccess: () => { toast.success('Submitted for approval'); router.push('/purchase/orders') },
            onError: (err) => toast.error(err.message),
          }
        )
      },
      onError: (err) => toast.error(err.message),
    })
  }

  const isPending = createPO.isPending || submitForApproval.isPending

  const filteredSuppliers = (suppliers ?? []).filter((s) =>
    s.name.toLowerCase().includes(supplierSearch.toLowerCase())
  )

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.back()}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">Create Purchase Order</h1>
      </div>

      <section className="rounded-lg border p-4 space-y-3">
        <h2 className="font-semibold">Supplier</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Input
              placeholder="Search suppliers..."
              value={supplierSearch}
              onChange={(e) => { setSupplierSearch(e.target.value); setSupplierId(''); setSupplierName('') }}
              className="w-full"
            />
            {supplierSearch && !supplierId && filteredSuppliers.length > 0 && (
              <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-md border bg-popover shadow-md">
                {filteredSuppliers.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="flex w-full items-center px-3 py-2 text-sm hover:bg-accent"
                    onClick={() => handleSelectSupplier(s)}
                  >
                    <span className="font-medium">{s.name}</span>
                    {s.category && <span className="ml-2 text-xs text-muted-foreground">{s.category}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button type="button" variant="outline" onClick={() => setAddSupplierOpen(true)}>
            + Add Supplier
          </Button>
        </div>
        {supplierId && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-success border-success">{supplierName}</Badge>
          </div>
        )}
      </section>

      <section className="rounded-lg border p-4 space-y-4">
        <h2 className="font-semibold">PO Settings</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label>Currency</Label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {currency !== 'QAR' && (
            <div className="space-y-1">
              <Label>Exchange Rate (to QAR)</Label>
              <Input type="number" min="0.01" step="0.0001" value={exchangeRate} onChange={(e) => setExchangeRate(Number(e.target.value))} />
            </div>
          )}
          <div className="space-y-1">
            <Label>Expected Delivery</Label>
            <Input type="date" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} />
          </div>
        </div>
      </section>

      <section className="rounded-lg border p-4 space-y-3">
        <h2 className="font-semibold">Line Items</h2>
        <PoLineItemsEditor value={lineItems} onChange={setLineItems} currency={currency} />
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="font-semibold mb-4">Terms</h2>
        <PoTermsSection value={terms} onChange={setTerms} />
      </section>

      <section className="rounded-lg border p-4 space-y-3">
        <h2 className="font-semibold">Discount</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Discount Label</Label>
            <Input placeholder="e.g. Loyalty discount" value={discountLabel} onChange={(e) => setDiscountLabel(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Discount Amount ({currency})</Label>
            <Input type="number" min="0" step="0.01" value={discountAmount} onChange={(e) => setDiscountAmount(Number(e.target.value))} />
          </div>
        </div>
      </section>

      <section className="rounded-lg border p-4 space-y-3">
        <div className="space-y-1 text-sm text-right">
          <div className="text-muted-foreground">Subtotal: <span className="text-foreground">{formatCurrency(subtotal, currency)}</span></div>
          {discountAmount > 0 && (
            <div className="text-muted-foreground">Discount: <span className="text-destructive">-{formatCurrency(discountAmount, currency)}</span></div>
          )}
          <div className="font-semibold text-base">Total (QAR): {formatCurrency(totalQar, 'QAR')}</div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">
            Approval level: <span className="font-semibold text-foreground">Level {approvalLevel}</span>
            {' '}({approvalLevel === 1 ? 'Purchase Manager' : approvalLevel === 2 ? 'PM + Accountant' : 'PM + Accountant + Owner'})
          </span>
        </div>
        <Separator />
        <div className="flex flex-col sm:flex-row gap-2 justify-end">
          <Button variant="outline" onClick={saveDraft} disabled={isPending}>
            {createPO.isPending ? 'Saving...' : 'Save as Draft'}
          </Button>
          <Button onClick={submitApproval} disabled={isPending}>
            {isPending ? 'Submitting...' : 'Submit for Approval'}
          </Button>
        </div>
      </section>

      <Dialog open={addSupplierOpen} onOpenChange={setAddSupplierOpen}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-md sm:rounded-lg">
          <DialogHeader><DialogTitle>Add Supplier</DialogTitle></DialogHeader>
          <Form {...supplierForm}>
            <form onSubmit={supplierForm.handleSubmit(handleAddSupplier)} className="space-y-4">
              <FormField control={supplierForm.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Name *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={supplierForm.control} name="contact_name" render={({ field }) => (
                <FormItem><FormLabel>Contact Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={supplierForm.control} name="phone" render={({ field }) => (
                  <FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={supplierForm.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>Email</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAddSupplierOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createSupplier.isPending}>{createSupplier.isPending ? 'Adding...' : 'Add Supplier'}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
