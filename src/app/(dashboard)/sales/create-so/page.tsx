'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Save, CheckCircle2, Users, Package, AlertTriangle } from 'lucide-react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { SoLineItemsEditor, type SoLineItemRow } from '@/components/sales/SoLineItemsEditor'
import { SoTermsSection, DEFAULT_TERMS, type SoTermsValues } from '@/components/sales/SoTermsSection'
import {
  useCreateSO, useCustomers, useCreateCustomer,
  calcSOSubtotal, calcSOTotal, hasNegativeMargin,
} from '@/hooks/useSaleOrders'
import { useCreditGroups } from '@/hooks/useCreditGroups'
import { useUserDivisionScope } from '@/hooks/useUserDivisionScope'
import { useCompanies } from '@/hooks/useCompanies'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select'

const CURRENCIES = ['QAR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'KWD'] as const
const CURRENCY_SYMBOLS: Record<string, string> = { QAR: 'QAR ', USD: '$', EUR: '€', GBP: '£', AED: 'AED ', SAR: 'SAR ', KWD: 'KWD ' }
const CURRENCY_NAMES: Record<string, string> = { QAR: 'Qatari Riyal', USD: 'US Dollar', EUR: 'Euro', GBP: 'British Pound', AED: 'UAE Dirham', SAR: 'Saudi Riyal', KWD: 'Kuwaiti Dinar' }

function sym(c: string) { return CURRENCY_SYMBOLS[c] ?? `${c} ` }
function fmtAmt(amount: number, currency: string) {
  return `${sym(currency)}${amount.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function CreateSOPage() {
  const router     = useRouter()
  const createSO   = useCreateSO()
  const createCust = useCreateCustomer()

  const [customerSearch, setCustomerSearch]                   = useState('')
  const [customerId, setCustomerId]                           = useState('')
  const [customerName, setCustomerName]                       = useState('')
  const [customerCreditGroupId, setCustomerCreditGroupId]     = useState<string | null>(null)
  const [customerCreditGroupName, setCustomerCreditGroupName] = useState<string | null>(null)
  const [customerCreditLimit, setCustomerCreditLimit]         = useState<number | null>(null)
  const [customerType, setCustomerType]                       = useState<'cash' | 'credit' | null>(null)
  const [customerOpen, setCustomerOpen]                       = useState(false)
  const [addOpen, setAddOpen]                                 = useState(false)
  const [newName, setNewName]                                 = useState('')
  const [newPhone, setNewPhone]                               = useState('')
  const [newEmail, setNewEmail]                               = useState('')
  const [newCreditGroupId, setNewCreditGroupId]               = useState('')
  const [newCustomerType, setNewCustomerType]                 = useState<'cash' | 'credit'>('credit')

  const { data: creditGroups = [] } = useCreditGroups()

  const { userDivisionIds, divisions } = useUserDivisionScope()
  const { data: companies = [] } = useCompanies()
  const isMultiDivision = userDivisionIds.length > 1
  const [divisionId, setDivisionId] = useState<string>('')

  // Auto-select the only division once JWT scope data loads
  useEffect(() => {
    if (userDivisionIds.length === 1 && !divisionId) {
      setDivisionId(userDivisionIds[0])
    }
  }, [userDivisionIds, divisionId])

  const companiesWithDivisions = useMemo(() => {
    const map = new Map<string, { companyName: string; items: typeof divisions }>()
    for (const d of divisions) {
      if (!map.has(d.company_id ?? '')) {
        const co = companies.find((c) => c.id === d.company_id)
        map.set(d.company_id ?? '', { companyName: co?.name_en ?? (d.company_id ?? ''), items: [] })
      }
      map.get(d.company_id ?? '')!.items.push(d)
    }
    return Array.from(map.values())
  }, [divisions, companies])

  const [currency, setCurrency]         = useState('QAR')
  const [exchangeRate, setExchangeRate] = useState(1)
  const [lineItems, setLineItems]       = useState<SoLineItemRow[]>([])
  const [terms, setTerms]               = useState<SoTermsValues>(DEFAULT_TERMS)
  const [discountAmount, setDiscountAmount] = useState(0)
  const [discountLabel, setDiscountLabel]   = useState('')
  const [isPriceLoading, setIsPriceLoading] = useState(false)

  const { data: customers } = useCustomers(customerSearch || undefined)

  const subtotal       = calcSOSubtotal(lineItems)
  const total          = calcSOTotal(subtotal, discountAmount, 'fixed')
  const negativeMargin = hasNegativeMargin(lineItems)
  const isCash         = customerType === 'cash'

  function handleSelectCustomer(c: {
    id: string; name: string
    credit_group_id: string | null
    credit_group_name?: string | null
    credit_group_limit?: number | null
    customer_type?: string | null
  }) {
    setCustomerId(c.id); setCustomerName(c.name); setCustomerSearch(c.name)
    setCustomerCreditGroupId(c.credit_group_id)
    setCustomerCreditGroupName(c.credit_group_name ?? null)
    setCustomerCreditLimit(c.credit_group_limit ?? null)
    setCustomerType((c.customer_type as 'cash' | 'credit') ?? 'credit')
    setCustomerOpen(false)
  }

  function handleAddCustomer() {
    if (!newName.trim() || !newPhone.trim()) { toast.error('Name and phone are required'); return }
    if (newCustomerType === 'credit' && !newCreditGroupId) { toast.error('Please select a credit group'); return }
    const groupId = newCustomerType === 'credit' ? (newCreditGroupId || null) : null
    createCust.mutate(
      { name: newName.trim(), phone: newPhone.trim(), email: newEmail || null, credit_group_id: groupId, customer_type: newCustomerType },
      {
        onSuccess: (data: any) => {
          toast.success('Customer added')
          const group = creditGroups.find((g) => g.id === groupId)
          handleSelectCustomer({
            id:                 data.id,
            name:               data.name,
            credit_group_id:    groupId,
            credit_group_name:  group?.name  ?? null,
            credit_group_limit: group?.credit_limit ?? null,
            customer_type:      newCustomerType,
          })
          setAddOpen(false); setNewName(''); setNewPhone(''); setNewEmail(''); setNewCreditGroupId(''); setNewCustomerType('credit')
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function validate() {
    if (isMultiDivision && !divisionId) { toast.error('Select a division before creating the order.'); return false }
    if (!customerId)            { toast.error('Please select a customer'); return false }
    if (lineItems.length === 0) { toast.error('Add at least one line item'); return false }
    if (lineItems.some((li) => !li.item_name.trim())) { toast.error('All line items need an item name'); return false }
    return true
  }

  function buildPayload(intent: 'quotation' | 'confirm') {
    return {
      customer_id:          customerId,
      intent,
      currency,
      exchange_rate:        exchangeRate,
      expected_delivery:    null,
      payment_terms:        isCash ? null : (terms.payment_terms || null),
      payment_terms_notes:  isCash ? null : (terms.payment_terms_notes || null),
      payment_milestones:   null,
      delivery_terms:       terms.delivery_terms || null,
      delivery_terms_notes: terms.delivery_terms_notes || null,
      customer_notes:       terms.customer_notes || null,
      validity_days:        terms.validity_days,
      discount_amount:      discountAmount,
      discount_label:       discountLabel || null,
      discount_type:        'fixed' as const,
      line_items:           lineItems.map(({ _key, ...li }) => li),
      division_id:          divisionId || null,
    }
  }

  function saveQuotation() {
    if (!validate()) return
    createSO.mutate(buildPayload('quotation'), {
      onSuccess: (result) => {
        if (result.status === 'pending_approval') {
          toast.warning(`Saved — exceeds credit limit (available: ${fmtAmt(result.available, 'QAR')}). Submitted for owner approval.`)
        } else {
          toast.success('Saved as quotation')
        }
        router.push('/sales/orders')
      },
      onError: (err) => toast.error(err.message),
    })
  }

  function confirmOrder() {
    if (!validate()) return
    createSO.mutate(buildPayload('confirm'), {
      onSuccess: (result) => {
        if (result.status === 'pending_approval') {
          toast.warning(`Submitted for approval — exceeds credit limit (available: ${fmtAmt(result.available, 'QAR')}). Owner must approve before order is confirmed.`)
        } else {
          toast.success('Order confirmed')
        }
        router.push('/sales/orders')
      },
      onError: (err) => toast.error(err.message),
    })
  }

  const isPending  = createSO.isPending
  const validCount = lineItems.filter((li) => li.item_name.trim() !== '').length

  return (
    <div className="flex flex-col h-full">
      {/* ── Sticky Header ── */}
      <div className="shrink-0 flex items-center justify-between px-4 md:px-6 py-4 border-b bg-background">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push('/sales/orders')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">New Sales Order</h1>
            <p className="text-xs text-muted-foreground">Create a quotation or confirm an order</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={saveQuotation} disabled={isPending || isPriceLoading}>
            <Save className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{isPending ? 'Saving…' : 'Save as Quotation'}</span>
          </Button>
          <Button size="sm" className="gap-1.5" onClick={confirmOrder} disabled={isPending || isPriceLoading}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{isPending ? 'Confirming…' : 'Confirm Order'}</span>
          </Button>
        </div>
      </div>

      {/* ── Scrollable Body ── */}
      <div className="flex-1 overflow-auto px-4 md:px-6 py-6 space-y-6">

        {/* ① Division (multi-division users only) */}
        {isMultiDivision && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Division</h2>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Division <span className="text-destructive">*</span>
              </label>
              <Select value={divisionId} onValueChange={(v) => v && setDivisionId(v)}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="Select division…" />
                </SelectTrigger>
                <SelectContent>
                  {companiesWithDivisions.map((group) => (
                    <SelectGroup key={group.companyName}>
                      <SelectLabel>{group.companyName}</SelectLabel>
                      {group.items.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name ?? d.id}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Separator />
          </section>
        )}

        {/* ② Customer */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-1.5"><Users className="h-4 w-4 text-primary" />Customer</h2>
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">CUSTOMER *</label>
              <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
                <PopoverTrigger
                  className="h-9 w-full inline-flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm font-normal shadow-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <span className={customerName ? '' : 'text-muted-foreground'}>{customerName || 'Search customers…'}</span>
                  <ChevronsUpDown className="h-4 w-4 opacity-50" />
                </PopoverTrigger>
                <PopoverContent className="w-[min(400px,90vw)] p-0">
                  <Command shouldFilter={false}>
                    <CommandInput placeholder="Search customers..." value={customerSearch} onValueChange={setCustomerSearch} />
                    <CommandList>
                      <CommandEmpty>No customers found.</CommandEmpty>
                      <CommandGroup>
                        {(customers ?? []).map((c) => (
                          <CommandItem key={c.id} value={c.name} onSelect={() => handleSelectCustomer(c)}>
                            <Check className={`mr-2 h-4 w-4 ${customerId === c.id ? 'opacity-100' : 'opacity-0'}`} />
                            <div className="flex-1">
                              <span>{c.name}</span>
                              {c.customer_type === 'cash' && (
                                <span className="ml-2 text-[10px] text-orange-600 font-medium">Cash</span>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" title="Add new customer" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {customerId && isCash && (
            <div className="flex items-center gap-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
              <Badge className="bg-orange-500 text-white text-[10px]">Cash Sale</Badge>
              <span>Payment due on delivery. No credit check applied.</span>
            </div>
          )}
          {customerId && !isCash && customerCreditGroupName && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-xs">{customerCreditGroupName}</Badge>
              <span>Limit: {fmtAmt(customerCreditLimit ?? 0, 'QAR')}</span>
            </div>
          )}
        </section>

        <Separator />

        {/* ② Currency */}
        <section className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-end">
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">CURRENCY</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}
                className="flex h-9 min-w-[130px] w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                {CURRENCIES.map((c) => <option key={c} value={c}>{sym(c)}{c} — {CURRENCY_NAMES[c]}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">SUBTOTAL ({currency})</label>
              <div className="h-9 px-3 flex items-center rounded-md border bg-muted/30 text-sm font-semibold min-w-[120px]">{fmtAmt(subtotal, currency)}</div>
            </div>
            {discountAmount > 0 && (
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">GRAND TOTAL ({currency})</label>
                <div className="h-9 px-3 flex items-center rounded-md border border-primary/30 bg-primary/5 text-primary font-bold min-w-[120px]">{fmtAmt(total, currency)}</div>
              </div>
            )}
          </div>
          {currency !== 'QAR' && (
            <div className="flex items-center gap-3">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Exchange Rate (to QAR)</label>
              <Input type="number" min="0.0001" step="0.0001" className="h-8 w-32 text-sm" value={exchangeRate} onChange={(e) => setExchangeRate(Number(e.target.value))} />
            </div>
          )}
        </section>

        <Separator />

        {/* ③ Line Items */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold flex items-center gap-1.5"><Package className="h-4 w-4 text-primary" />Line Items</h2>
            <Badge variant="outline" className="text-[9px]">{validCount} valid</Badge>
            {negativeMargin && (
              <Badge variant="outline" className="text-[9px] border-warning text-warning gap-1">
                <AlertTriangle className="h-3 w-3" /> Negative margin
              </Badge>
            )}
          </div>
          <SoLineItemsEditor value={lineItems} onChange={setLineItems} currency={currency} onPriceLoading={setIsPriceLoading} />
        </section>

        <Separator />

        {/* ④ Discount */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Discount</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Label</label>
              <Input className="h-9 text-sm" placeholder="e.g. Volume Discount" value={discountLabel} onChange={(e) => setDiscountLabel(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Amount ({currency})</label>
              <Input type="number" min="0" step="0.01" className="h-9 text-sm" value={discountAmount} onChange={(e) => setDiscountAmount(Math.max(0, Number(e.target.value)))} />
            </div>
          </div>
        </section>

        <Separator />

        {/* ⑤ Terms */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Terms</h2>
          {isCash ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground rounded-md border border-orange-100 bg-orange-50 px-3 py-2">
                Cash sale — payment terms are not applicable. Delivery terms and notes are still available.
              </p>
              <SoTermsSection value={terms} onChange={setTerms} hidePaymentTerms />
            </div>
          ) : (
            <SoTermsSection value={terms} onChange={setTerms} />
          )}
        </section>

      </div>

      {/* Add Customer Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-md sm:rounded-lg">
          <DialogHeader><DialogTitle>Add Customer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {/* Customer type */}
            <div className="space-y-1">
              <label className="text-xs font-medium">Customer Type *</label>
              <div className="flex gap-2">
                {(['credit', 'cash'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setNewCustomerType(t); if (t === 'cash') setNewCreditGroupId('') }}
                    className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                      newCustomerType === t
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'hover:bg-muted'
                    }`}
                  >
                    {t === 'credit' ? 'Credit' : 'Cash'}
                  </button>
                ))}
              </div>
              {newCustomerType === 'cash' && (
                <p className="text-[10px] text-muted-foreground">Cash customers pay on delivery. No credit limit applies.</p>
              )}
            </div>
            <div className="space-y-1"><label className="text-xs font-medium">Name *</label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Customer name" /></div>
            <div className="space-y-1"><label className="text-xs font-medium">Phone *</label><Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+974 XXXX XXXX" /></div>
            <div className="space-y-1"><label className="text-xs font-medium">Email</label><Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="optional" /></div>
            {newCustomerType === 'credit' && (
              <div className="space-y-1">
                <label className="text-xs font-medium">Credit Group *</label>
                <select
                  value={newCreditGroupId}
                  onChange={(e) => setNewCreditGroupId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Select a credit group…</option>
                  {creditGroups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddCustomer} disabled={createCust.isPending}>{createCust.isPending ? 'Adding…' : 'Add Customer'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
