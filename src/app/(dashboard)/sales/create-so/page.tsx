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
import { CustomerDialog } from '@/components/master-data/CustomerDialog'
import { SoLineItemsEditor, type SoLineItemRow } from '@/components/sales/SoLineItemsEditor'
import { SoTermsSection, DEFAULT_TERMS, PAYMENT_PRESETS, type SoTermsValues } from '@/components/sales/SoTermsSection'
import { useCustomerCredit } from '@/hooks/useCustomerCredit'
import { CreditUtilizationBar } from '@/components/shared/CreditUtilizationBar'
import {
  useCreateSO, useCustomers,
  calcSOSubtotal, calcSOTotal, hasNegativeMargin,
} from '@/hooks/useSaleOrders'
import { useCreditGroups } from '@/hooks/useCreditGroups'
import { useUserDivisionScope } from '@/hooks/useUserDivisionScope'
import { useCompanies } from '@/hooks/useCompanies'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useCurrencies } from '@/hooks/useCurrencies'

function formatAmt(amount: number, currencyCode: string, symbol?: string) {
  const prefix = symbol ?? `${currencyCode} `
  return `${prefix}${amount.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function CreateSOPage() {
  const router     = useRouter()
  const createSO   = useCreateSO()
  const [customerSearch, setCustomerSearch]                   = useState('')
  const [customerId, setCustomerId]                           = useState('')
  const [customerName, setCustomerName]                       = useState('')
  const [_customerCreditGroupId, setCustomerCreditGroupId]     = useState<string | null>(null)
  const [customerCreditGroupName, setCustomerCreditGroupName] = useState<string | null>(null)
  const [customerCreditLimit, setCustomerCreditLimit]         = useState<number | null>(null)
  const [customerType, setCustomerType]                       = useState<'cash' | 'credit' | null>(null)
  const [customerOpen, setCustomerOpen]                       = useState(false)
  const [addOpen, setAddOpen]                                 = useState(false)

  const { data: creditGroups = [] } = useCreditGroups()
  const { data: currencies = [] } = useCurrencies()

  const { divisions } = useUserDivisionScope()
  const { data: companies = [] } = useCompanies()
  const isMultiDivision = divisions.length > 1
  const [divisionId, setDivisionId] = useState<string>('')

  // Auto-select when only one division is visible
  useEffect(() => {
    if (divisions.length === 1 && !divisionId) {
      setDivisionId(divisions[0].id)
    }
  }, [divisions, divisionId])

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
  const [exchangeRate, setExchangeRate] = useState<number>(1)
  const currencySymbol = currencies.find((c) => c.code === currency)?.symbol ?? `${currency} `
  const needsExchangeRate = currency !== 'QAR'
  const exchangeRateValid = !needsExchangeRate || exchangeRate > 0

  useEffect(() => {
    // When user picks QAR, force rate back to 1 so it doesn't linger from a
    // prior non-QAR selection. Non-QAR keeps its user-entered value.
    if (currency === 'QAR' && exchangeRate !== 1) setExchangeRate(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency])
  const [lineItems, setLineItems]       = useState<SoLineItemRow[]>([])
  const [terms, setTerms]               = useState<SoTermsValues>(DEFAULT_TERMS)
  const [discountAmount, setDiscountAmount] = useState(0)
  const [discountLabel, setDiscountLabel]   = useState('')
  const [isPriceLoading, setIsPriceLoading] = useState(false)

  const { data: customers } = useCustomers(customerSearch || undefined)
  const { data: creditInfo } = useCustomerCredit(customerId || null)

  const subtotal       = calcSOSubtotal(lineItems)
  const total          = calcSOTotal(subtotal, discountAmount, 'fixed')
  const negativeMargin = hasNegativeMargin(lineItems)
  const isCash         = customerType === 'cash'

  // Approval pre-check — does this SO look like it'll trip a gate when confirmed?
  // (UI hint only; the SQL still authoritatively decides on submit.)
  //   margin gate: any line priced below avg_cost (client-side, exact)
  //   credit gate: customer total > credit_limit (approx — ignores other open SOs)
  const wouldNeedApproval = useMemo(() => {
    if (!customerId || lineItems.length === 0) return false
    const hasBelowCost = lineItems.some((li) => li.avg_cost > 0 && li.unit_price < li.avg_cost)
    const totalQar     = total * (exchangeRate || 1)
    const exceedsCredit = !isCash
      && customerCreditLimit !== null
      && customerCreditLimit > 0
      && totalQar > customerCreditLimit
    return hasBelowCost || exceedsCredit
  }, [customerId, lineItems, total, exchangeRate, isCash, customerCreditLimit])

  function handleSelectCustomer(c: {
    id: string; name: string
    credit_group_id: string | null
    credit_group_name?: string | null
    credit_group_limit?: number | null
    credit_group_default_terms?: string | null
    customer_type?: string | null
  }) {
    setCustomerId(c.id); setCustomerName(c.name); setCustomerSearch(c.name)
    setCustomerCreditGroupId(c.credit_group_id)
    setCustomerCreditGroupName(c.credit_group_name ?? null)
    setCustomerCreditLimit(c.credit_group_limit ?? null)
    setCustomerType((c.customer_type as 'cash' | 'credit') ?? 'credit')
    setCustomerOpen(false)

    // Auto-select payment terms from the credit group's default (credit only)
    const defaultTerms = c.credit_group_default_terms ?? null
    if (defaultTerms && c.customer_type !== 'cash') {
      const preset = PAYMENT_PRESETS.find((p) => p.label === defaultTerms)
      setTerms((prev) => ({
        ...prev,
        payment_terms: defaultTerms,
        payment_milestones: preset
          ? preset.milestones.map((m) => ({ ...m, _key: crypto.randomUUID() }))
          : [],
      }))
    }
  }

  function handleCustomerCreated(created: { id: string; name: string; credit_group_id: string | null; customer_type: string }) {
    const group = creditGroups.find((g) => g.id === created.credit_group_id)
    handleSelectCustomer({
      id:                         created.id,
      name:                       created.name,
      credit_group_id:            created.credit_group_id,
      credit_group_name:          group?.name ?? null,
      credit_group_limit:         group?.credit_limit ?? null,
      credit_group_default_terms: group?.default_payment_terms ?? null,
      customer_type:              created.customer_type as 'cash' | 'credit',
    })
  }

  function validate() {
    if (isMultiDivision && !divisionId) { toast.error('Select a division before creating the order.'); return false }
    if (!customerId)            { toast.error('Please select a customer'); return false }
    if (lineItems.length === 0) { toast.error('Add at least one line item'); return false }
    const missingItems = lineItems.filter((li) => !li.brand_variant_id)
    if (missingItems.length > 0) {
      toast.error(missingItems.length === 1
        ? 'One line has no item selected — pick a category, item and brand for every row'
        : `${missingItems.length} lines have no item selected — pick a category, item and brand for every row`)
      return false
    }
    if (lineItems.some((li) => !(li.qty > 0)))        { toast.error('Every line needs a quantity greater than zero'); return false }
    if (lineItems.some((li) => !(li.unit_price > 0))) { toast.error('Every line needs a unit price greater than zero'); return false }
    return true
  }

  function buildPayload(intent: 'quotation' | 'confirm') {
    return {
      customer_id:          customerId,
      intent,
      currency,
      exchange_rate:        exchangeRate,
      expected_delivery:    terms.expected_delivery || null,
      payment_terms:        isCash ? null : (terms.payment_terms || null),
      payment_terms_notes:  isCash ? null : (terms.payment_terms_notes || null),
      payment_milestones:   isCash ? null : (terms.payment_milestones.length > 0 ? terms.payment_milestones.map(({ _key, ...m }) => m) : null),
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
          toast.warning(`Saved — exceeds credit limit (available: ${formatAmt(result.available, 'QAR')}). Submitted for owner approval.`)
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
          toast.warning(`Submitted for approval — exceeds credit limit (available: ${formatAmt(result.available, 'QAR')}). Owner must approve before order is confirmed.`)
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
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={saveQuotation}
            disabled={isPending || isPriceLoading || !exchangeRateValid}
            title={!exchangeRateValid ? 'Enter an exchange rate before saving.' : undefined}
          >
            <Save className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{isPending ? 'Saving…' : 'Save as Quotation'}</span>
          </Button>
          <Button
            size="sm"
            className={
              wouldNeedApproval
                ? 'gap-1.5 bg-amber-500 text-white hover:bg-amber-600 focus-visible:ring-amber-500'
                : 'gap-1.5'
            }
            onClick={confirmOrder}
            disabled={isPending || isPriceLoading || !exchangeRateValid}
            title={
              !exchangeRateValid
                ? 'Enter an exchange rate before confirming.'
                : wouldNeedApproval
                ? 'This order trips an approval gate — it will be sent to the Sales Approvals queue instead of being confirmed.'
                : undefined
            }
          >
            {wouldNeedApproval ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">
              {isPending
                ? (wouldNeedApproval ? 'Submitting…' : 'Confirming…')
                : (wouldNeedApproval ? 'Submit for Approval' : 'Confirm Order')}
            </span>
          </Button>
        </div>
      </div>

      {/* ── Scrollable Body ── */}
      <div className="flex-1 overflow-auto px-4 md:px-6 py-6 space-y-6">

        {/* ① Division (multi-division users only) */}
        {isMultiDivision && (
          <section className="space-y-1.5">
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
            <Separator />
          </section>
        )}

        {/* ② Customer */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-1.5"><Users className="h-4 w-4 text-primary" />Customer</h2>
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">CUSTOMER *</label>
              <Popover open={customerOpen} onOpenChange={(open) => { if (open) setCustomerSearch(''); setCustomerOpen(open) }}>
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
            <div className="flex flex-wrap items-center gap-4 rounded-md border bg-muted/20 px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="text-xs">{customerCreditGroupName}</Badge>
                <span>Limit: {formatAmt(customerCreditLimit ?? 0, 'QAR')}</span>
              </div>
              {creditInfo && (
                <>
                  <div className="h-4 w-px bg-border" />
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Live utilization
                    </span>
                    <CreditUtilizationBar
                      used={Number(creditInfo.credit_used      ?? 0)}
                      limit={Number(creditInfo.credit_limit    ?? 0)}
                      pct={creditInfo.credit_utilization_pct}
                    />
                    <span className="text-xs">
                      Available:{' '}
                      <span className={
                        creditInfo.credit_available <= 0    ? 'font-semibold text-destructive' :
                        (creditInfo.credit_utilization_pct ?? 0) >= 70 ? 'font-semibold text-amber-700' :
                                                                          'font-semibold text-emerald-700'
                      }>
                        {formatAmt(Number(creditInfo.credit_available ?? 0), 'QAR')}
                      </span>
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        <Separator />

        {/* ② Currency */}
        <section className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-[minmax(180px,260px)_auto_auto] gap-3 items-start">
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">CURRENCY</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                {currencies.map((c) => (
                  <option key={c.id} value={c.code}>
                    {c.symbol} {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">SUBTOTAL ({currency})</label>
              <div className="h-9 px-3 flex items-center rounded-md border bg-muted/30 text-sm font-semibold min-w-[120px]">{formatAmt(subtotal, currency, currencySymbol)}</div>
              {needsExchangeRate && exchangeRateValid && (
                <p className="text-[10px] text-muted-foreground tabular-nums">
                  ≈ {formatAmt(subtotal * exchangeRate, 'QAR')}
                </p>
              )}
            </div>
            {discountAmount > 0 && (
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">GRAND TOTAL ({currency})</label>
                <div className="h-9 px-3 flex items-center rounded-md border border-primary/30 bg-primary/5 text-primary font-bold min-w-[120px]">{formatAmt(total, currency, currencySymbol)}</div>
                {needsExchangeRate && exchangeRateValid && (
                  <p className="text-[10px] text-muted-foreground tabular-nums">
                    ≈ {formatAmt(total * exchangeRate, 'QAR')}
                  </p>
                )}
              </div>
            )}
          </div>
          {needsExchangeRate && (
            <div className="flex items-center gap-3">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                Exchange Rate <span className="text-destructive">*</span>{' '}
                <span className="normal-case text-muted-foreground/70">(1 {currency} = ? QAR)</span>
              </label>
              <Input
                type="number"
                min="0.0001"
                step="0.0001"
                className="h-8 w-32 text-sm"
                placeholder="e.g. 3.64"
                value={exchangeRate || ''}
                onChange={(e) => setExchangeRate(Number(e.target.value))}
              />
              {!exchangeRateValid && (
                <span className="text-[10px] text-destructive">Required</span>
              )}
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

      {/* Add Customer Dialog — reuses the full CustomerDialog */}
      <CustomerDialog
        mode="create"
        open={addOpen}
        onOpenChange={setAddOpen}
        groups={creditGroups}
        onCreated={handleCustomerCreated}
      />
    </div>
  )
}
