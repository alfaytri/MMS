'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Save, CheckCircle2, Building2,
  Package, StickyNote, Clock, ArrowRight, Plus,
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
import { Skeleton } from '@/components/ui/skeleton'
import { PoLineItemsEditor, type LineItemRow, type LineType } from '@/components/purchase/PoLineItemsEditor'
import { PoTermsSection, DEFAULT_TERMS, type PoTermsValues } from '@/components/purchase/PoTermsSection'
import { AddSupplierDialog } from '@/components/purchase/AddSupplierDialog'
import { PoVersionTabs } from '@/components/purchase/PoVersionTabs'
import { PoVersionBanner } from '@/components/purchase/PoVersionBanner'
import {
  usePurchaseOrder,
  usePoVersions,
  useSubmitPoVersion,
  useSavePoAsDraft,
  useDeletePoVersion,
  calcApprovalLevel,
  getApprovalRoles,
  type PoVersion,
  type POLineItemDraft,
} from '@/hooks/usePurchaseOrders'
import { useSuppliers } from '@/hooks/useSuppliers'
import { useIsAdmin } from '@/hooks/useProfiles'

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

function roleLabel(role: string) {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function draftToLineItemRows(items: POLineItemDraft[]): LineItemRow[] {
  return items.map((li) => ({
    ...li,
    _key: crypto.randomUUID(),
    line_type: (li.tool_asset_item_id ? 'tools' : 'products') as LineType,
  }))
}

export default function EditPOPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: po, isLoading: poLoading } = usePurchaseOrder(id)
  const { data: versions = [], isLoading: versionsLoading } = usePoVersions(id)
  const { data: suppliers } = useSuppliers()
  const { data: isAdmin } = useIsAdmin()
  const submitPoVersion = useSubmitPoVersion()
  const savePoAsDraft = useSavePoAsDraft()
  const deletePoVersion = useDeletePoVersion()

  // ── Form state ────────────────────────────────────────────────────────────
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

  // ── Tab state ─────────────────────────────────────────────────────────────
  const currentVersion = po?.version_number ?? 1
  const [activeTab, setActiveTab] = useState<number>(currentVersion)

  // ── Hydrate form from live PO on load ─────────────────────────────────────
  useEffect(() => {
    if (!po) return
    setSupplierId(po.supplier_id)
    setSupplierName(po.supplier_name)
    setCurrency(po.currency)
    setExchangeRate(po.exchange_rate)
    setDiscountAmount(po.discount_amount ?? 0)
    setDiscountLabel(po.discount_label ?? '')
    setTerms({
      payment_terms: po.payment_terms ?? '',
      payment_terms_notes: po.payment_terms_notes ?? '',
      payment_milestones: (po as any).payment_milestones ?? [],
      delivery_terms: po.delivery_terms ?? '',
      delivery_terms_notes: po.delivery_terms_notes ?? '',
      expected_delivery: po.expected_delivery ?? '',
      vendor_notes: po.vendor_notes ?? '',
    })
    setLineItems(draftToLineItemRows(
      (po.po_line_items ?? []).map((li) => ({
        item_name: li.item_name,
        sku: li.sku ?? '',
        qty: li.qty,
        unit: li.unit,
        unit_price: li.unit_price,
        total_price: li.total_price,
        brand_variant_id: li.brand_variant_id,
        tool_asset_item_id: li.tool_asset_item_id,
        free_qty: li.free_qty,
      }))
    ))
    setActiveTab(po.version_number ?? 1)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [po?.id])

  // ── Computed ──────────────────────────────────────────────────────────────
  const subtotal = lineItems.reduce((s, li) => s + li.total_price, 0)
  const grandTotal = subtotal - discountAmount
  const totalQar = grandTotal * exchangeRate
  const approvalLevel = calcApprovalLevel(totalQar)
  const approvalRoles = getApprovalRoles(approvalLevel)
  const validCount = lineItems.filter((li) => li.item_name.trim() !== '').length

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
        item_name, sku, qty, unit, unit_price, total_price, brand_variant_id, tool_asset_item_id, free_qty,
      })),
    }
  }

  function validate() {
    if (!supplierId) { toast.error('Please select a supplier'); return false }
    if (lineItems.length === 0) { toast.error('Add at least one line item'); return false }
    if (lineItems.some((li) => !li.item_name.trim())) { toast.error('All line items need an item name'); return false }
    if (discountAmount > subtotal) { toast.error('Discount cannot exceed subtotal'); return false }
    return true
  }

  function handleSaveDraft() {
    if (!validate()) return
    savePoAsDraft.mutate(
      { id, payload: buildPayload() },
      {
        onSuccess: () => toast.success('Draft saved'),
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleSubmit() {
    if (!validate()) return
    if (!po) return
    const currentSnapshot = {
      version_number: currentVersion,
      supplier_id: po.supplier_id,
      supplier_name: po.supplier_name,
      currency: po.currency,
      exchange_rate: po.exchange_rate,
      subtotal: po.subtotal,
      discount_amount: po.discount_amount ?? 0,
      discount_label: po.discount_label ?? null,
      payment_terms: po.payment_terms ?? null,
      payment_terms_notes: po.payment_terms_notes ?? null,
      payment_milestones: (po as any).payment_milestones ?? null,
      delivery_terms: po.delivery_terms ?? null,
      delivery_terms_notes: po.delivery_terms_notes ?? null,
      expected_delivery: po.expected_delivery ?? null,
      vendor_notes: po.vendor_notes ?? null,
      line_items: (po.po_line_items ?? []).map((li) => ({
        item_name: li.item_name,
        sku: li.sku ?? '',
        qty: li.qty,
        unit: li.unit,
        unit_price: li.unit_price,
        total_price: li.total_price,
        brand_variant_id: li.brand_variant_id,
        tool_asset_item_id: li.tool_asset_item_id,
        free_qty: li.free_qty,
      })),
    }
    submitPoVersion.mutate(
      {
        id,
        currentVersionNumber: currentVersion,
        currentSnapshot,
        payload: buildPayload(),
      },
      {
        onSuccess: () => {
          toast.success('Submitted for approval')
          router.push('/purchase/orders')
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleRestore(version: PoVersion) {
    setSupplierId(version.supplier_id)
    setSupplierName(version.supplier_name)
    setCurrency(version.currency)
    setExchangeRate(version.exchange_rate)
    setDiscountAmount(version.discount_amount)
    setDiscountLabel(version.discount_label ?? '')
    setTerms({
      payment_terms: version.payment_terms ?? '',
      payment_terms_notes: version.payment_terms_notes ?? '',
      payment_milestones: version.payment_milestones ?? [],
      delivery_terms: version.delivery_terms ?? '',
      delivery_terms_notes: version.delivery_terms_notes ?? '',
      expected_delivery: version.expected_delivery ?? '',
      vendor_notes: version.vendor_notes ?? '',
    })
    setLineItems(draftToLineItemRows(version.line_items))
    setActiveTab(currentVersion)
    toast.success(`Restored V${version.version_number} values — review and submit`)
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (poLoading || versionsLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="shrink-0 px-4 md:px-6 py-4 border-b space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex-1 p-6 space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    )
  }

  if (!po) {
    return <div className="text-muted-foreground p-8 text-center">PO not found</div>
  }

  if (po.status === 'cancelled') {
    return (
      <div className="flex flex-col h-full">
        <div className="shrink-0 flex items-center gap-3 px-4 md:px-6 py-4 border-b bg-background">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push('/purchase/orders')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">{po.po_number}</h1>
            <Badge variant="outline" className="text-xs">Cancelled</Badge>
          </div>
        </div>
        <div className="text-muted-foreground p-8 text-center">Cancelled POs cannot be edited.</div>
      </div>
    )
  }

  const isPending = submitPoVersion.isPending || savePoAsDraft.isPending
  const isViewingOldVersion = activeTab !== currentVersion
  const activeVersion = versions.find((v) => v.version_number === activeTab) ?? null

  // ── Read-only form for old version tabs ────────────────────────────────────
  function renderReadOnlyForm(version: PoVersion) {
    const vLines = draftToLineItemRows(version.line_items)
    const vSubtotal = vLines.reduce((s, li) => s + li.total_price, 0)
    const vGrandTotal = vSubtotal - version.discount_amount
    const vTerms: PoTermsValues = {
      payment_terms: version.payment_terms ?? '',
      payment_terms_notes: version.payment_terms_notes ?? '',
      payment_milestones: version.payment_milestones ?? [],
      delivery_terms: version.delivery_terms ?? '',
      delivery_terms_notes: version.delivery_terms_notes ?? '',
      expected_delivery: version.expected_delivery ?? '',
      vendor_notes: version.vendor_notes ?? '',
    }

    return (
      <div className="flex-1 overflow-auto px-4 md:px-6 py-6 space-y-6 pointer-events-none opacity-80">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <Building2 className="h-4 w-4 text-primary" />
            Supplier &amp; Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-end">
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">SUPPLIER</label>
              <div className="h-9 px-3 flex items-center rounded-md border bg-muted/30 text-sm">{version.supplier_name}</div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">CURRENCY</label>
              <div className="h-9 px-3 flex items-center rounded-md border bg-muted/30 text-sm">{version.currency}</div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">SUBTOTAL</label>
              <div className="h-9 px-3 flex items-center rounded-md border bg-muted/30 text-sm font-semibold">
                {formatAmt(vSubtotal, version.currency)}
              </div>
            </div>
            {version.discount_amount > 0 && (
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">GRAND TOTAL</label>
                <div className="h-9 px-3 flex items-center rounded-md border border-primary/30 bg-primary/5 text-primary font-bold">
                  {formatAmt(vGrandTotal, version.currency)}
                </div>
              </div>
            )}
          </div>
        </section>
        <Separator />
        <section className="space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <Package className="h-4 w-4 text-primary" />
            Line Items
          </h2>
          <PoLineItemsEditor value={vLines} onChange={() => {}} currency={version.currency} readOnly />
        </section>
        <Separator />
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Discount</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Label</label>
              <div className="h-9 px-3 flex items-center rounded-md border bg-muted/30 text-sm">{version.discount_label || '—'}</div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Amount</label>
              <div className="h-9 px-3 flex items-center rounded-md border bg-muted/30 text-sm">{formatAmt(version.discount_amount, version.currency)}</div>
            </div>
          </div>
        </section>
        <Separator />
        <PoTermsSection value={vTerms} onChange={() => {}} readOnly />
        <Separator />
        <section className="space-y-2">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <StickyNote className="h-4 w-4 text-primary" />
            Vendor Notes
          </h2>
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs min-h-[60px]">{version.vendor_notes || '—'}</div>
        </section>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Sticky Header ── */}
      <div className="shrink-0 flex items-center justify-between px-4 md:px-6 py-4 border-b bg-background">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push('/purchase/orders')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">{po.po_number}</h1>
              <Badge variant="outline" className="text-xs font-mono">v{currentVersion}</Badge>
            </div>
            <Badge
              className={`text-[10px] mt-0.5 ${po.status === 'draft' ? 'bg-slate-100 text-slate-700' : po.status === 'pending_approval' ? 'bg-amber-100 text-amber-700' : po.status === 'approved' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}
              variant="outline"
            >
              {po.status.replace(/_/g, ' ')}
            </Badge>
          </div>
        </div>
        {!isViewingOldVersion && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleSaveDraft} disabled={isPending}>
              <Save className="h-3.5 w-3.5" />
              {savePoAsDraft.isPending ? 'Saving…' : 'Save as Draft'}
            </Button>
            <Button size="sm" className="gap-1.5" onClick={handleSubmit} disabled={isPending}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {submitPoVersion.isPending ? 'Submitting…' : 'Submit for Approval'}
            </Button>
          </div>
        )}
      </div>

      {/* ── Version Tab Strip ── */}
      <PoVersionTabs
        versions={versions}
        currentVersionNumber={currentVersion}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* ── Old Version View ── */}
      {isViewingOldVersion && activeVersion && (
        <>
          <div className="px-4 md:px-6 pt-4">
            <PoVersionBanner
              version={activeVersion}
              onRestore={() => handleRestore(activeVersion)}
              onDelete={isAdmin ? () => {
                deletePoVersion.mutate(
                  { versionId: activeVersion.id, poId: id },
                  {
                    onSuccess: () => {
                      setActiveTab(currentVersion)
                      toast.success(`V${activeVersion.version_number} deleted`)
                    },
                    onError: (err) => toast.error(err.message),
                  }
                )
              } : undefined}
              isDeleting={deletePoVersion.isPending}
            />
          </div>
          {renderReadOnlyForm(activeVersion)}
        </>
      )}

      {/* ── Current Version Edit Form ── */}
      {!isViewingOldVersion && (
        <div className="flex-1 overflow-auto px-4 md:px-6 py-6 space-y-6">

          {/* ① Supplier & Details */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-primary" />
              Supplier &amp; Details
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">SUPPLIER *</label>
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
                              <CommandItem key={s.id} value={s.name} onSelect={() => handleSelectSupplier(s)}>
                                <Check className={`mr-2 h-4 w-4 ${supplierId === s.id ? 'opacity-100' : 'opacity-0'}`} />
                                <span>{s.name}</span>
                                {s.category && <span className="ml-2 text-xs text-muted-foreground">({s.category})</span>}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" title="Add new supplier" onClick={() => setAddSupplierOpen(true)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">CURRENCY</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="flex h-9 min-w-[130px] rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>{sym(c)}{c} — {CURRENCY_NAMES[c]}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">SUBTOTAL ({currency})</label>
                <div className="h-9 px-3 flex items-center rounded-md border bg-muted/30 text-sm font-semibold min-w-[120px]">
                  {formatAmt(subtotal, currency)}
                </div>
              </div>
              {discountAmount > 0 && (
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">GRAND TOTAL ({currency})</label>
                  <div className="h-9 px-3 flex items-center rounded-md border border-primary/30 bg-primary/5 text-primary font-bold min-w-[120px]">
                    {formatAmt(grandTotal, currency)}
                  </div>
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

          {/* ② Line Items */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <Package className="h-4 w-4 text-primary" />
                Line Items
              </h2>
              <Badge variant="outline" className="text-[9px]">{validCount} valid</Badge>
            </div>
            <PoLineItemsEditor value={lineItems} onChange={setLineItems} currency={currency} />
          </section>

          <Separator />

          {/* ③ Discount */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Discount</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Label</label>
                <Input className="h-9 text-sm" placeholder="e.g. Volume Discount" value={discountLabel} onChange={(e) => setDiscountLabel(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Amount ({currency})</label>
                <Input type="number" min="0" max={subtotal} step="0.01" className="h-9 text-sm" value={discountAmount} onChange={(e) => setDiscountAmount(Number(e.target.value))} />
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

          <Separator />

          {/* ⑦ Approval Chain Preview */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">
              Approval Chain Preview{' '}
              <span className="text-xs text-muted-foreground font-normal">
                (Level {approvalLevel} — &lt; QAR 5K / 5K–50K / ≥ 50K)
              </span>
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {approvalRoles.map((role, idx) => (
                <div key={role} className="flex items-center gap-2">
                  {idx > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                  <div className="flex items-center gap-1.5 border rounded-md px-3 py-2">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs">{roleLabel(role)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

        </div>
      )}

      <AddSupplierDialog open={addSupplierOpen} onOpenChange={setAddSupplierOpen} onCreated={handleSelectSupplier} />
    </div>
  )
}
