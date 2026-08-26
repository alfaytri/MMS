'use client'

import { humanizeDbError } from '@/lib/dbErrors'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Save, CheckCircle2, Building2,
  Package, StickyNote, Plus,
} from 'lucide-react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { PoLineItemsEditor, type LineItemRow, type LineType } from '@/components/purchase/PoLineItemsEditor'
import { useUserDivisionScope } from '@/hooks/useUserDivisionScope'
import { PoTermsSection, DEFAULT_TERMS, type PoTermsValues } from '@/components/purchase/PoTermsSection'
import { AddSupplierDialog } from '@/components/purchase/AddSupplierDialog'
import { PoVersionTabs } from '@/components/purchase/PoVersionTabs'
import { stageOf, type Stage } from '@/lib/poVersionHelper'
import { PoVersionBanner } from '@/components/purchase/PoVersionBanner'
import { DivisionMismatchChip } from '@/components/layout/DivisionMismatchChip'
import {
  usePurchaseOrder,
  usePoVersions,
  useSubmitPoVersion,
  useSavePoAsDraft,
  useDeletePoVersion,
  type PoVersion,
  type POLineItemDraft,
} from '@/hooks/usePurchaseOrders'
import { useSuppliers } from '@/hooks/useSuppliers'
import { useCurrencies } from '@/hooks/useCurrencies'
import { useIsAdmin } from '@/hooks/useProfiles'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { BookedRateLockRow } from '@/components/shared/BookedRateLockRow'
import { ChangeBookedRateDialog } from '@/components/shared/ChangeBookedRateDialog'

function formatAmt(amount: number, currencyCode: string, symbol?: string) {
  const prefix = symbol ?? `${currencyCode} `
  return `${prefix}${amount.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function draftToLineItemRows(items: (POLineItemDraft & { line_type?: LineType })[]): LineItemRow[] {
  return items.map((li) => ({
    ...li,
    line_type: (li.line_type ?? 'products') as LineType,
    _key: crypto.randomUUID(),
  }))
}

export default function EditPOPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: po, isLoading: poLoading } = usePurchaseOrder(id)
  const { divisions } = useUserDivisionScope()
  const { data: versions = [], isLoading: versionsLoading } = usePoVersions(id)
  const { data: suppliers } = useSuppliers()
  const { data: currencies = [] } = useCurrencies()
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
  const [changeRateOpen, setChangeRateOpen] = useState(false)

  // Currency picker is locked once any payment exists on this PO.
  // payments.source_type is a Postgres enum ('purchase_order' / 'sale_order' / …)
  // — filter with the enum value, NOT the short 'po' form used elsewhere.
  const supabaseClient = createClient()
  const { data: hasAnyPayments = false } = useQuery({
    queryKey: ['po-has-payments', id],
    enabled: !!id,
    queryFn: async () => {
      const { count } = await supabaseClient
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('source_type', 'purchase_order')
        .eq('source_id', id)
        .is('deleted_at', null)
      return (count ?? 0) > 0
    },
  })

  // ── Tab state ─────────────────────────────────────────────────────────────
  const currentVersion = po?.version_number ?? 1
  const liveStage: Stage = po?.po_type ? stageOf(po.po_type) : 'draft'
  const [activeStage, setActiveStage] = useState<Stage>(liveStage)
  const [activeVersionNumber, setActiveVersionNumber] = useState<number | null>(null)

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
      payment_milestones: po.payment_milestones ?? [],
      delivery_terms: po.delivery_terms ?? '',
      delivery_terms_notes: po.delivery_terms_notes ?? '',
      expected_delivery: po.expected_delivery ?? '',
      quote_deadline: po.quote_deadline ?? '',
      vendor_notes: po.vendor_notes ?? '',
    })
    setLineItems(draftToLineItemRows(
      (po.po_line_items ?? []).map((li) => {
        const catType = li.inventory_item_brand_variants?.inventory_items?.inventory_categories?.type
        const line_type: LineType =
          catType === 'tools' || catType === 'spare-parts' || catType === 'consumables'
            ? catType
            : 'products'
        return {
          item_name: li.item_name,
          sku: li.sku ?? '',
          qty: li.qty,
          unit: li.unit,
          unit_price: li.unit_price,
          total_price: li.total_price,
          brand_variant_id: li.brand_variant_id,
          free_qty: li.free_qty,
          show_specification: (li as { show_specification?: boolean }).show_specification ?? false,
          division_id: li.division_id ?? null,
          line_type,
        }
      })
    ))
    setActiveStage(liveStage)
    setActiveVersionNumber(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [po?.id])

  // Sync exchange rate whenever the PO row's rate changes (e.g. after
  // ChangeBookedRateDialog succeeds and invalidates the PO query). Separate
  // from the main hydrate effect so it doesn't clobber other form edits.
  useEffect(() => {
    if (po) setExchangeRate(po.exchange_rate)
  }, [po, po?.exchange_rate])

  // ── Computed ──────────────────────────────────────────────────────────────
  const currencySymbol = currencies.find((c) => c.code === currency)?.symbol ?? `${currency} `
  const subtotal = lineItems.reduce((s, li) => s + li.total_price, 0)
  const grandTotal = subtotal - discountAmount
  const validCount = lineItems.filter((li) => li.brand_variant_id).length

  function handleSelectSupplier(s: { id: string; name: string }) {
    setSupplierId(s.id)
    setSupplierName(s.name)
    setSupplierOpen(false)

    const full = (suppliers ?? []).find((sup) => sup.id === s.id)
    if (full?.currencies?.code) {
      setCurrency(full.currencies.code)
    }
  }

  function buildPayload() {
    return {
      supplier_id: supplierId,
      supplier_name: supplierName,
      currency,
      exchange_rate: exchangeRate,
      expected_delivery: terms.expected_delivery || null,
      quote_deadline: terms.quote_deadline || null,
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
      line_items: lineItems.map(({ item_name, sku, qty, unit, unit_price, total_price, brand_variant_id, free_qty, show_specification, division_id }) => ({
        item_name: item_name.trim(),
        sku, qty, unit, unit_price, total_price, brand_variant_id, free_qty,
        show_specification: show_specification ?? false,
        division_id: division_id ?? po?.division_id ?? null,
      })),
      division_id: po?.division_id ?? null,
    }
  }

  function validate() {
    if (!supplierId) { toast.error('Please select a supplier'); return false }
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
    if (discountAmount > subtotal) { toast.error('Discount cannot exceed subtotal'); return false }
    return true
  }

  function doSaveDraft() {
    if (!validate()) return
    savePoAsDraft.mutate(
      { id, payload: buildPayload() },
      {
        onSuccess: () => {
          toast.success('Draft saved')
          router.push('/purchase/orders')
        },
        onError: (err) => toast.error(humanizeDbError(err)),
      }
    )
  }

  function doSubmit() {
    if (!validate()) return
    if (!po) return
    const currentSnapshot = {
      version_number: currentVersion,
      stage: liveStage,
      supplier_id: po.supplier_id,
      supplier_name: po.supplier_name,
      currency: po.currency,
      exchange_rate: po.exchange_rate,
      subtotal: po.subtotal,
      discount_amount: po.discount_amount ?? 0,
      discount_label: po.discount_label ?? null,
      payment_terms: po.payment_terms ?? null,
      payment_terms_notes: po.payment_terms_notes ?? null,
      payment_milestones: po.payment_milestones ?? null,
      delivery_terms: po.delivery_terms ?? null,
      delivery_terms_notes: po.delivery_terms_notes ?? null,
      expected_delivery: po.expected_delivery ?? null,
      vendor_notes: po.vendor_notes ?? null,
      po_version_lines: (po.po_line_items ?? []).map((li) => ({
        item_name: li.item_name,
        sku: li.sku ?? '',
        qty: li.qty,
        unit: li.unit,
        unit_price: li.unit_price,
        total_price: li.total_price,
        brand_variant_id: li.brand_variant_id,
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
        onError: (err) => toast.error(humanizeDbError(err)),
      }
    )
  }

  // When the live PO is approved OR already pending approval, wrap save
  // actions in a confirm dialog so the user understands the consequences
  // (new version, chain reset / re-approval, downstream creates locked).
  const needsAmendWarning = po?.status === 'approved' || po?.status === 'pending_approval'
  const wasApproved = po?.status === 'approved'
  const [pendingSave, setPendingSave] = useState<null | 'draft' | 'submit'>(null)

  function requestSave(kind: 'draft' | 'submit') {
    if (!validate()) return
    if (needsAmendWarning) {
      setPendingSave(kind)
    } else {
      if (kind === 'draft') doSaveDraft()
      else doSubmit()
    }
  }

  function confirmSave() {
    const k = pendingSave
    setPendingSave(null)
    if (k === 'draft') doSaveDraft()
    if (k === 'submit') doSubmit()
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
      // po_versions doesn't snapshot quote_deadline; fall back to the live PO value.
      quote_deadline: po?.quote_deadline ?? '',
      vendor_notes: version.vendor_notes ?? '',
    })
    setLineItems(draftToLineItemRows(version.po_version_lines))
    setActiveStage(liveStage)
    setActiveVersionNumber(null)
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
  const isViewingOldVersion = activeVersionNumber !== null
  const activeVersion = isViewingOldVersion
    ? versions.find((v) => v.stage === activeStage && v.version_number === activeVersionNumber) ?? null
    : null

  // ── Read-only form for old version tabs ────────────────────────────────────
  function renderReadOnlyForm(version: PoVersion) {
    const vLines = draftToLineItemRows(version.po_version_lines)
    const vSubtotal = vLines.reduce((s, li) => s + li.total_price, 0)
    const vGrandTotal = vSubtotal - version.discount_amount
    const vTerms: PoTermsValues = {
      payment_terms: version.payment_terms ?? '',
      payment_terms_notes: version.payment_terms_notes ?? '',
      payment_milestones: version.payment_milestones ?? [],
      delivery_terms: version.delivery_terms ?? '',
      delivery_terms_notes: version.delivery_terms_notes ?? '',
      expected_delivery: version.expected_delivery ?? '',
      quote_deadline: po?.quote_deadline ?? '',
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
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-semibold">{po.po_number}</h1>
              <Badge variant="outline" className="text-xs font-mono">v{currentVersion}</Badge>
              <DivisionMismatchChip recordDivisionId={po.division_id} />
            </div>
            <Badge
              className={`text-[10px] mt-0.5 ${po.status === 'draft' ? 'bg-muted text-foreground' : po.status === 'pending_approval' ? 'bg-amber-100 text-amber-700' : po.status === 'approved' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}
              variant="outline"
            >
              {po.status.replace(/_/g, ' ')}
            </Badge>
          </div>
        </div>
        {!isViewingOldVersion && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => requestSave('draft')} disabled={isPending}>
              {savePoAsDraft.isPending ? <Spinner size="sm" /> : <Save className="h-3.5 w-3.5" />}
              {savePoAsDraft.isPending ? 'Saving…' : 'Save as Draft'}
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => requestSave('submit')} disabled={isPending}>
              {submitPoVersion.isPending ? <Spinner size="sm" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {submitPoVersion.isPending ? 'Submitting…' : 'Submit for Approval'}
            </Button>
          </div>
        )}
      </div>

      {/* ── Version Tab Strip ── */}
      <PoVersionTabs
        versions={versions}
        currentPoType={po?.po_type ?? 'draft'}
        activeStage={activeStage}
        activeVersion={activeVersionNumber}
        onChange={(stage, version) => {
          setActiveStage(stage)
          setActiveVersionNumber(version)
        }}
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
                      setActiveStage(liveStage)
                      setActiveVersionNumber(null)
                      toast.success(`V${activeVersion.version_number} deleted`)
                    },
                    onError: (err) => toast.error(humanizeDbError(err)),
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
                    <PopoverContent className="w-[400px] max-w-[92vw] p-0">
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
                  disabled={hasAnyPayments}
                  title={hasAnyPayments ? 'Currency is locked once a payment has been recorded on this PO.' : undefined}
                  className="flex h-9 min-w-[130px] rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {currencies.map((c) => (
                    <option key={c.id} value={c.code}>{c.code}{c.symbol ? ` ${c.symbol}` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">SUBTOTAL ({currency})</label>
                <div className="h-9 px-3 flex items-center rounded-md border bg-muted/30 text-sm font-semibold min-w-[120px]">
                  {formatAmt(subtotal, currency, currencySymbol)}
                </div>
                {currency !== 'QAR' && exchangeRate > 0 && (
                  <p className="text-[10px] text-muted-foreground tabular-nums">
                    ≈ {formatAmt(subtotal * exchangeRate, 'QAR')}
                  </p>
                )}
              </div>
              {discountAmount > 0 && (
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">GRAND TOTAL ({currency})</label>
                  <div className="h-9 px-3 flex items-center rounded-md border border-primary/30 bg-primary/5 text-primary font-bold min-w-[120px]">
                    {formatAmt(grandTotal, currency, currencySymbol)}
                  </div>
                  {currency !== 'QAR' && exchangeRate > 0 && (
                    <p className="text-[10px] text-muted-foreground tabular-nums">
                      ≈ {formatAmt(grandTotal * exchangeRate, 'QAR')}
                    </p>
                  )}
                </div>
              )}
            </div>
            <BookedRateLockRow
              currency={currency}
              initialRate={exchangeRate}
              onEditClick={() => setChangeRateOpen(true)}
            />
            <ChangeBookedRateDialog
              documentType="po"
              documentId={id}
              currency={currency}
              currentRate={exchangeRate}
              open={changeRateOpen}
              onOpenChange={setChangeRateOpen}
            />
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
            <PoLineItemsEditor value={lineItems} onChange={setLineItems} currency={currency} divisions={divisions} defaultDivisionId={po?.division_id ?? null} />
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


        </div>
      )}

      <AddSupplierDialog open={addSupplierOpen} onOpenChange={setAddSupplierOpen} onCreated={handleSelectSupplier} />

      <AlertDialog open={pendingSave !== null} onOpenChange={(open) => { if (!open) setPendingSave(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{wasApproved ? 'Edit Approved PO' : 'Amend Pending PO'}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {pendingSave === 'draft' ? (
                  <>
                    <p>Saving this as a draft will:</p>
                    <ul className="list-disc pl-5 space-y-1 text-sm">
                      <li>Pull the PO back to <strong>Draft</strong></li>
                      <li>{wasApproved ? 'Clear its approval — re-submit for approval when ready' : 'Cancel the approval currently in progress'}</li>
                      <li><strong>Block new receivals, bills, and payments</strong> until it is approved again</li>
                    </ul>
                    {wasApproved && (
                      <p className="text-xs text-muted-foreground pt-1">
                        Existing receivals, bills, and payments will stay as-is.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p>Saving this change will:</p>
                    <ul className="list-disc pl-5 space-y-1 text-sm">
                      <li>Create a new version (PO-v{(po?.version_number ?? 1) + 1})</li>
                      {wasApproved && <li>Drop the PO back to <strong>Pending Approval</strong></li>}
                      <li>{wasApproved ? 'Require all approvers to approve again' : 'Reset the approval chain — every approver re-approves'}</li>
                      {wasApproved && <li><strong>Block new receivals, bills, and payments</strong> until re-approved</li>}
                    </ul>
                    {wasApproved && (
                      <p className="text-xs text-muted-foreground pt-1">
                        Existing receivals, bills, and payments will stay as-is.
                      </p>
                    )}
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSave} className="bg-amber-500 hover:bg-amber-600 text-white">
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
