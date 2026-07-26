'use client'

import { useState, useMemo, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Save, Users, Package, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { SoLineItemsEditor, type SoLineItemRow, type SoLineType } from '@/components/sales/SoLineItemsEditor'
import { SoTermsSection, DEFAULT_TERMS, type SoTermsValues } from '@/components/sales/SoTermsSection'
import { useCustomerCredit } from '@/hooks/useCustomerCredit'
import { CreditUtilizationBar } from '@/components/shared/CreditUtilizationBar'
import {
  useSaleOrder, useUpdateSO,
  calcSOSubtotal, calcSOTotal, hasNegativeMargin,
} from '@/hooks/useSaleOrders'
import { useCurrencies } from '@/hooks/useCurrencies'

function fmtAmt(amount: number, currency: string, symbol?: string | null) {
  const prefix = symbol ? `${symbol} ` : `${currency} `
  return `${prefix}${amount.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function EditSOPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: so, isLoading } = useSaleOrder(id)
  const updateSO = useUpdateSO()
  const { data: creditInfo } = useCustomerCredit(so?.customer_id ?? null)
  const { data: currencies = [] } = useCurrencies()

  const currencySymbol = (code: string) =>
    currencies.find((c) => c.code === code)?.symbol ?? null

  const [initialized, setInitialized] = useState(false)
  const [currency, setCurrency] = useState('QAR')
  const [exchangeRate, setExchangeRate] = useState(1)
  const needsExchangeRate = currency !== 'QAR'
  const exchangeRateValid = !needsExchangeRate || exchangeRate > 0
  const [lineItems, setLineItems] = useState<SoLineItemRow[]>([])
  const [terms, setTerms] = useState<SoTermsValues>(DEFAULT_TERMS)
  const [discountAmount, setDiscountAmount] = useState(0)
  const [discountLabel, setDiscountLabel] = useState('')
  const [isPriceLoading, setIsPriceLoading] = useState(false)

  useEffect(() => {
    if (!so || initialized) return

    setCurrency(so.currency ?? 'QAR')
    setExchangeRate(so.exchange_rate ?? 1)
    setDiscountAmount(so.discount_amount ?? 0)
    setDiscountLabel(so.discount_label ?? '')

    setTerms({
      payment_terms: so.payment_terms ?? '',
      payment_milestones: (so.payment_milestones ?? []).map((m) => ({ ...m, _key: crypto.randomUUID() })),
      payment_terms_notes: so.payment_terms_notes ?? '',
      delivery_terms: so.delivery_terms ?? '',
      delivery_terms_notes: so.delivery_terms_notes ?? '',
      expected_delivery: so.expected_delivery ?? '',
      customer_notes: so.customer_notes ?? '',
      validity_days: so.validity_days ?? 30,
    })

    if (so.sale_order_lines) {
      setLineItems(
        so.sale_order_lines.map((li) => ({
          _key: crypto.randomUUID(),
          item_name: li.item_name,
          sku: li.sku ?? '',
          qty: li.qty,
          unit: li.unit,
          unit_price: li.unit_price,
          total: li.total,
          line_type: (li.line_type as SoLineType) || 'products',
          brand_variant_id: li.brand_variant_id,
          avg_cost: li.avg_cost,
        })),
      )
    }

    setInitialized(true)
  }, [so, initialized])

  const subtotal = calcSOSubtotal(lineItems)
  const total = calcSOTotal(subtotal, discountAmount, 'fixed')
  const negativeMargin = hasNegativeMargin(lineItems)
  const isCash = creditInfo === undefined && !so?.payment_terms

  const wouldNeedApproval = useMemo(() => {
    if (!so || lineItems.length === 0) return false
    const hasBelowCost = lineItems.some((li) => li.avg_cost > 0 && li.unit_price < li.avg_cost)
    const totalQar = total * (exchangeRate || 1)
    const creditLimit = creditInfo?.credit_limit ?? 0
    const exceedsCredit = creditLimit > 0 && totalQar > creditLimit
    return hasBelowCost || exceedsCredit
  }, [so, lineItems, total, exchangeRate, creditInfo])

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!so) {
    return <div className="text-muted-foreground p-8 text-center">Sale order not found</div>
  }

  function validate() {
    if (lineItems.length === 0) { toast.error('Add at least one line item'); return false }
    if (lineItems.some((li) => !li.item_name.trim())) { toast.error('All line items need an item name'); return false }
    return true
  }

  function buildPayload() {
    return {
      id: so!.id,
      customer_id: so!.customer_id,
      currency,
      exchange_rate: exchangeRate,
      expected_delivery: terms.expected_delivery || null,
      payment_terms: terms.payment_terms || null,
      payment_terms_notes: terms.payment_terms_notes || null,
      payment_milestones: terms.payment_milestones.length > 0
        ? terms.payment_milestones.map(({ _key, ...m }) => m)
        : null,
      delivery_terms: terms.delivery_terms || null,
      delivery_terms_notes: terms.delivery_terms_notes || null,
      customer_notes: terms.customer_notes || null,
      validity_days: terms.validity_days,
      discount_amount: discountAmount,
      discount_label: discountLabel || null,
      discount_type: 'fixed' as const,
      line_items: lineItems.map(({ _key, ...li }) => li),
    }
  }

  function saveQuotation() {
    if (!validate()) return
    updateSO.mutate(buildPayload(), {
      onSuccess: (result) => {
        // The RPC returns the resulting status; surface it so the user knows
        // if their edit tripped the approval chain (credit overage / below cost).
        const status = (result as { status?: string } | null)?.status
        if (status === 'pending_approval') {
          toast.success('SO updated — sent for approval (credit or margin trigger)')
        } else if (status === 'confirmed') {
          toast.success('SO updated')
        } else {
          toast.success('Quotation updated')
        }
        router.push('/sales/orders')
      },
      onError: (err) => toast.error(err.message),
    })
  }

  const isPending = updateSO.isPending
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
            <h1 className="text-lg font-semibold">Edit {so.so_number}</h1>
            <p className="text-xs text-muted-foreground">
              {so.customer_name} · Quotation
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className={
              wouldNeedApproval
                ? 'gap-1.5 border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                : 'gap-1.5'
            }
            onClick={saveQuotation}
            disabled={isPending || isPriceLoading || !exchangeRateValid}
            title={!exchangeRateValid ? 'Enter an exchange rate before saving.' : undefined}
          >
            {wouldNeedApproval
              ? <AlertTriangle className="h-3.5 w-3.5" />
              : <Save className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">
              {isPending ? 'Saving…' : 'Save Changes'}
            </span>
          </Button>
        </div>
      </div>

      {/* ── Scrollable Body ── */}
      <div className="flex-1 overflow-auto px-4 md:px-6 py-6 space-y-6">

        {/* ① Customer (read-only for edit) */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-1.5"><Users className="h-4 w-4 text-primary" />Customer</h2>
          <div className="rounded-md border bg-muted/20 px-3 py-2">
            <span className="text-sm font-medium">{so.customer_name}</span>
            {so.customer_phone && <span className="ml-2 text-xs text-muted-foreground">{so.customer_phone}</span>}
          </div>
          {creditInfo && (
            <div className="flex flex-wrap items-center gap-4 rounded-md border bg-muted/20 px-3 py-2">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Live utilization
                </span>
                <CreditUtilizationBar
                  used={Number(creditInfo.credit_used ?? 0)}
                  limit={Number(creditInfo.credit_limit ?? 0)}
                  pct={creditInfo.credit_utilization_pct}
                />
                <span className="text-xs">
                  Available:{' '}
                  <span className={
                    creditInfo.credit_available <= 0 ? 'font-semibold text-destructive' :
                    (creditInfo.credit_utilization_pct ?? 0) >= 70 ? 'font-semibold text-amber-700' :
                    'font-semibold text-emerald-700'
                  }>
                    {fmtAmt(Number(creditInfo.credit_available ?? 0), 'QAR')}
                  </span>
                </span>
              </div>
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
                  <option key={c.id} value={c.code}>{c.code}{c.symbol ? ` ${c.symbol}` : ''}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">SUBTOTAL ({currency})</label>
              <div className="h-9 px-3 flex items-center rounded-md border bg-muted/30 text-sm font-semibold min-w-[120px]">{fmtAmt(subtotal, currency, currencySymbol(currency))}</div>
              {needsExchangeRate && exchangeRateValid && (
                <p className="text-[10px] text-muted-foreground tabular-nums">
                  ≈ {fmtAmt(subtotal * exchangeRate, 'QAR')}
                </p>
              )}
            </div>
            {discountAmount > 0 && (
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">GRAND TOTAL ({currency})</label>
                <div className="h-9 px-3 flex items-center rounded-md border border-primary/30 bg-primary/5 text-primary font-bold min-w-[120px]">{fmtAmt(total, currency, currencySymbol(currency))}</div>
                {needsExchangeRate && exchangeRateValid && (
                  <p className="text-[10px] text-muted-foreground tabular-nums">
                    ≈ {fmtAmt(total * exchangeRate, 'QAR')}
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
    </div>
  )
}
