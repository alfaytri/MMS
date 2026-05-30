'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Plus, Save, CheckCircle2, Building2,
  Package, StickyNote,
} from 'lucide-react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { PoLineItemsEditor, type LineItemRow } from '@/components/purchase/PoLineItemsEditor'
import { PoTermsSection, DEFAULT_TERMS, type PoTermsValues } from '@/components/purchase/PoTermsSection'
import { AddSupplierDialog } from '@/components/purchase/AddSupplierDialog'
import { useCreatePO, useSubmitPOForApproval } from '@/hooks/usePurchaseOrders'
import { useSuppliers } from '@/hooks/useSuppliers'
import { useUserDivisionScope } from '@/hooks/useUserDivisionScope'
import { useCompanies } from '@/hooks/useCompanies'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select'

const CURRENCIES = ['QAR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'KWD'] as const

const CURRENCY_SYMBOLS: Record<string, string> = {
  QAR: 'QAR ', USD: '$', EUR: '€', GBP: '£', AED: 'AED ', SAR: 'SAR ', KWD: 'KWD ',
}

const CURRENCY_NAMES: Record<string, string> = {
  QAR: 'Qatari Riyal', USD: 'US Dollar', EUR: 'Euro',
  GBP: 'British Pound', AED: 'UAE Dirham', SAR: 'Saudi Riyal', KWD: 'Kuwaiti Dinar',
}

function sym(currency: string) {
  return CURRENCY_SYMBOLS[currency] ?? `${currency} `
}

function formatAmt(amount: number, currency: string) {
  return `${sym(currency)}${amount.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function CreatePOPage() {
  const router = useRouter()
  const createPO = useCreatePO()
  const submitForApproval = useSubmitPOForApproval()
  const { data: suppliers } = useSuppliers()

  const { userDivisionIds, divisions } = useUserDivisionScope()
  const { data: companies = [] } = useCompanies()
  const isMultiDivision = userDivisionIds.length > 1
  const [divisionId, setDivisionId] = useState<string>('')

  // Auto-select the only division once scope data loads
  useEffect(() => {
    if (userDivisionIds.length === 1 && !divisionId) {
      setDivisionId(userDivisionIds[0])
    }
  }, [userDivisionIds, divisionId])

  const [supplierId, setSupplierId] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [addSupplierOpen, setAddSupplierOpen] = useState(false)
  const [currency, setCurrency] = useState<string>('QAR')
  const [exchangeRate, setExchangeRate] = useState(1)
  const [lineItems, setLineItems] = useState<LineItemRow[]>([])
  const [terms, setTerms] = useState<PoTermsValues>(DEFAULT_TERMS)
  const [discountAmount, setDiscountAmount] = useState(0)
  const [discountLabel, setDiscountLabel] = useState('')
  const [isPriceLoading, setIsPriceLoading] = useState(false)

  const companiesWithDivisions = useMemo(() => {
    const map = new Map<string, { companyName: string; items: typeof divisions }>()
    for (const d of divisions) {
      const companyId = d.company_id ?? 'unknown'
      if (!map.has(companyId)) {
        const co = companies.find((c) => c.id === companyId)
        map.set(companyId, { companyName: co?.name_en ?? companyId, items: [] })
      }
      map.get(companyId)!.items.push(d)
    }
    return Array.from(map.values())
  }, [divisions, companies])

  const subtotal = lineItems.reduce((s, li) => s + li.total_price, 0)
  const grandTotal = subtotal - discountAmount

  function handleSelectSupplier(s: { id: string; name: string }) {
    setSupplierId(s.id)
    setSupplierName(s.name)
    setSupplierOpen(false)
  }

  function buildPayload() {
    return {
      supplier_id: supplierId,
      supplier_name: supplierName,
      currency,
      exchange_rate: exchangeRate,
      expected_delivery: terms.expected_delivery || null,
      payment_terms: terms.payment_terms || null,
      payment_terms_notes: terms.payment_terms_notes || null,
      payment_milestones: terms.payment_milestones.length > 0
        ? terms.payment_milestones.map(({ label, percent }) => ({ label, percent }))
        : null,
      delivery_terms: terms.delivery_terms || null,
      delivery_terms_notes: terms.delivery_terms_notes || null,
      vendor_notes: terms.vendor_notes || null,
      discount_amount: discountAmount,
      discount_label: discountLabel || null,
      line_items: lineItems.map(({ item_name, sku, qty, unit, unit_price, total_price, brand_variant_id, tool_asset_item_id, free_qty }) => ({
        item_name: item_name.trim(),
        sku, qty, unit, unit_price, total_price, brand_variant_id, tool_asset_item_id, free_qty,
      })),
      division_id: divisionId || null,
    }
  }

  function validate() {
    if (isMultiDivision && !divisionId) { toast.error('Select a division before creating the order.'); return false }
    if (!supplierId) { toast.error('Please select a supplier'); return false }
    if (lineItems.length === 0) { toast.error('Add at least one line item'); return false }
    if (discountAmount > subtotal) { toast.error('Discount cannot exceed subtotal'); return false }
    return true
  }

  function saveAsType(poType: 'draft' | 'rfq') {
    if (!validate()) return
    createPO.mutate({ ...buildPayload(), po_type: poType }, {
      onSuccess: () => { toast.success(poType === 'rfq' ? 'Saved as RFQ' : 'Saved as Draft'); router.push('/purchase/orders') },
      onError: (err) => toast.error(err.message),
    })
  }

  function submitApproval() {
    if (!validate()) return
    createPO.mutate(buildPayload(), {
      onSuccess: (po) => {
        submitForApproval.mutate(
          { id: po.id },
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
  const validCount = lineItems.filter((li) => li.brand_variant_id || li.tool_asset_item_id).length

  return (
    <div className="flex flex-col h-full">
      {/* ── Sticky Header ── */}
      <div className="shrink-0 flex items-center justify-between px-4 md:px-6 py-4 border-b bg-background">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push('/purchase/orders')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Create Purchase Order</h1>
            <p className="text-xs text-muted-foreground">Direct PO to supplier with multi-currency support</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => saveAsType('rfq')} disabled={isPending || isPriceLoading}>
            <Save className="h-3.5 w-3.5" />
            {isPending ? 'Please wait…' : 'Save as RFQ'}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => saveAsType('draft')} disabled={isPending || isPriceLoading}>
            <Save className="h-3.5 w-3.5" />
            {isPending ? 'Please wait…' : 'Save as Draft'}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={submitApproval} disabled={isPending || isPriceLoading}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            {isPending ? 'Submitting…' : isPriceLoading ? 'Fetching price…' : 'Submit for Approval'}
          </Button>
        </div>
      </div>

      {/* ── Scrollable Body ── */}
      <div className="flex-1 overflow-auto px-4 md:px-6 py-6 space-y-6">

        {/* ① Supplier & Details */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <Building2 className="h-4 w-4 text-primary" />
            Supplier &amp; Details
          </h2>
          {isMultiDivision && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Division <span className="text-destructive">*</span>
              </label>
              <Select value={divisionId} onValueChange={(v) => { if (v) setDivisionId(v) }}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="Select division…" />
                </SelectTrigger>
                <SelectContent>
                  {companiesWithDivisions.map((group) => (
                    <SelectGroup key={group.companyName}>
                      <SelectLabel>{group.companyName}</SelectLabel>
                      {group.items.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
            {/* Supplier combobox */}
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                SUPPLIER *
              </label>
              <div className="flex gap-2">
                <Popover open={supplierOpen} onOpenChange={setSupplierOpen}>
                  <PopoverTrigger
                    className="h-9 flex-1 inline-flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm font-normal shadow-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    render={(props) => <button type="button" {...props} />}
                  >
                    <span className={supplierName ? '' : 'text-muted-foreground'}>
                      {supplierName || 'Search suppliers…'}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 opacity-50" />
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0">
                    <Command>
                      <CommandInput placeholder="Search suppliers..." />
                      <CommandList>
                        <CommandEmpty>No suppliers found.</CommandEmpty>
                        <CommandGroup>
                          {(suppliers ?? []).map((s) => (
                            <CommandItem
                              key={s.id}
                              value={s.name}
                              onSelect={() => handleSelectSupplier(s)}
                            >
                              <Check
                                className={`mr-2 h-4 w-4 ${supplierId === s.id ? 'opacity-100' : 'opacity-0'}`}
                              />
                              <span>{s.name}</span>
                              {s.category && (
                                <span className="ml-2 text-xs text-muted-foreground">({s.category})</span>
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  title="Add new supplier"
                  onClick={() => setAddSupplierOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Currency */}
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                CURRENCY
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="flex h-9 min-w-[130px] rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {sym(c)}{c} — {CURRENCY_NAMES[c]}
                  </option>
                ))}
              </select>
            </div>

            {/* Subtotal display */}
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                SUBTOTAL ({currency})
              </label>
              <div className="h-9 px-3 flex items-center rounded-md border bg-muted/30 text-sm font-semibold min-w-[120px]">
                {formatAmt(subtotal, currency)}
              </div>
            </div>

            {/* Grand total (only when discount > 0) */}
            {discountAmount > 0 && (
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  GRAND TOTAL ({currency})
                </label>
                <div className="h-9 px-3 flex items-center rounded-md border border-primary/30 bg-primary/5 text-primary font-bold min-w-[120px]">
                  {formatAmt(grandTotal, currency)}
                </div>
              </div>
            )}
          </div>

          {/* Exchange rate (non-QAR) */}
          {currency !== 'QAR' && (
            <div className="flex items-center gap-3">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                Exchange Rate (to QAR)
              </label>
              <Input
                type="number"
                min="0.0001"
                step="0.0001"
                className="h-8 w-32 text-sm"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(Number(e.target.value))}
              />
            </div>
          )}
        </section>

        <Separator />

        {/* ② Line Items */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <Package className="h-4 w-4 text-primary" />
              Line Items
            </h2>
            <Badge variant="outline" className="text-[9px]">
              {validCount} valid
            </Badge>
          </div>
          <PoLineItemsEditor value={lineItems} onChange={setLineItems} currency={currency} onPriceLoading={setIsPriceLoading} />
        </section>

        <Separator />

        {/* ③ Discount */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Discount</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Label
              </label>
              <Input
                className="h-9 text-sm"
                placeholder="e.g. Volume Discount"
                value={discountLabel}
                onChange={(e) => setDiscountLabel(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Amount ({currency})
              </label>
              <Input
                type="number"
                min="0"
                max={subtotal}
                step="0.01"
                className="h-9 text-sm"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(Number(e.target.value))}
              />
            </div>
          </div>
        </section>

        <Separator />

        {/* ④⑤ Payment & Delivery Terms */}
        <PoTermsSection value={terms} onChange={setTerms} />

        <Separator />

        {/* ⑥ Vendor Notes */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <StickyNote className="h-4 w-4 text-primary" />
            Vendor Notes
            <span className="text-xs text-muted-foreground font-normal">(shown on printed PO)</span>
          </h2>
          <Textarea
            className="min-h-[60px] text-xs resize-none"
            placeholder="Notes visible to the vendor…"
            value={terms.vendor_notes}
            onChange={(e) => setTerms({ ...terms, vendor_notes: e.target.value })}
          />
        </section>


      </div>

      {/* Add Supplier Dialog */}
      <AddSupplierDialog
        open={addSupplierOpen}
        onOpenChange={setAddSupplierOpen}
        onCreated={handleSelectSupplier}
      />
    </div>
  )
}
