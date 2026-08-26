'use client'

import { humanizeDbError } from '@/lib/dbErrors'
import { useState, useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import {
  PackageCheck, PackageX, AlertTriangle, Calendar, Building2, Truck, Gift, X, Package,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { GuardedDialog, type GuardedFormDialogHandle } from '@/components/shared/GuardedFormDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useCreateReceival } from '@/hooks/useReceivals'
import { usePurchaseOrders, usePurchaseOrder, type InventoryLookupResult } from '@/hooks/usePurchaseOrders'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useWarehouseSubContainers } from '@/hooks/useWarehouseSubContainers'
import { Badge } from '@/components/ui/badge'
import { CascadeInventorySelector } from '@/components/purchase/CascadeInventorySelector'
import type { LineType } from '@/components/purchase/PoLineItemsEditor'
import { format } from 'date-fns'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'

type DraftLine = {
  po_line_item_id: string | null
  brand_variant_id: string | null
  item_name: string
  brand: string | null
  category: string | null
  sku: string | null
  ordered_qty: number
  prior_received: number
  po_unit_price: number
  qty_received: number
  free_qty: number
  unit_cost: number
}

type ExtraFreeItem = {
  _id: string
  brand_variant_id: string | null
  item_name: string
  sku: string | null
  qty: number
  unit_cost: number
}

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
}

// ─── Formatter ────────────────────────────────────────────────────────────────

function formatAmount(n: number, currency: string) {
  return `${currency} ${n.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Formats a number in the PO's currency and, when the PO isn't QAR, also
// returns the QAR equivalent computed at the PO's booked exchange rate.
// Used on unit-cost cells so operators see both the amount they're paying
// the supplier AND the QAR value that will land in inventory / P&L.
function formatUnitCostWithQar(
  amount:       number,
  currency:     string,
  exchangeRate: number | null | undefined,
): { primary: string; qar: string | null } {
  const primary = formatAmount(amount, currency)
  if (currency === 'QAR' || !exchangeRate || exchangeRate === 1) return { primary, qar: null }
  const qarAmount = amount * exchangeRate
  return { primary, qar: `≈ ${formatAmount(qarAmount, 'QAR')}` }
}

// ─── Item card ─────────────────────────────────────────────────────────────────

function ItemCard({
  line, idx, onChange, currency, exchangeRate,
}: {
  line:         DraftLine
  idx:          number
  onChange:     (idx: number, patch: Partial<DraftLine>) => void
  currency:     string
  exchangeRate: number | null | undefined
}) {
  const unitCostFormatted = formatUnitCostWithQar(line.unit_cost, currency, exchangeRate)
  const [freeOpen, setFreeOpen] = useState(false)
  const [freeInput, setFreeInput] = useState('')

  const remaining     = Math.max(0, line.ordered_qty - line.prior_received)
  const priorPct      = line.ordered_qty > 0 ? (line.prior_received / line.ordered_qty) * 100 : 0
  const projectedPct  = line.ordered_qty > 0 ? ((line.prior_received + line.qty_received) / line.ordered_qty) * 100 : 0
  const isOverReceive = line.qty_received > remaining
  const isShort       = line.qty_received > 0 && line.qty_received < remaining
  const hasDiscrepancy = isOverReceive || isShort
  const isFullyReceived = line.prior_received >= line.ordered_qty && line.ordered_qty > 0

  function saveFreeQty() {
    const n = parseInt(freeInput || '0')
    onChange(idx, { free_qty: isNaN(n) || n < 0 ? 0 : n })
    setFreeOpen(false)
  }

  return (
    <div className={`rounded-lg border transition-colors ${hasDiscrepancy ? 'border-warning/40 bg-warning/[0.03]' : 'bg-background'}`}>
      {/* Header strip */}
      <div className="px-3 pt-2.5 pb-1.5 flex flex-wrap items-center gap-1.5">
        {line.category && (
          <span className="text-[9px] font-semibold uppercase tracking-wide bg-muted/60 text-muted-foreground px-1.5 py-0.5 rounded">
            {line.category}
          </span>
        )}
        <p className="text-[12px] font-semibold text-foreground truncate">{line.item_name || '—'}</p>
        {line.brand && <span className="text-[10px] text-primary">· {line.brand}</span>}
        {line.sku && <span className="text-[10px] text-muted-foreground">· {line.sku}</span>}
        <div className="ml-auto flex items-center gap-1">
          {line.free_qty > 0 && (
            <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-success/10 text-success">
              <Gift className="h-2.5 w-2.5" /> +{line.free_qty} free
            </span>
          )}
          {isFullyReceived && (
            <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-success/10 text-success">
              <PackageCheck className="h-2.5 w-2.5" /> Complete
            </span>
          )}
          {isOverReceive && (
            <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
              <AlertTriangle className="h-2.5 w-2.5" /> Over-receive
            </span>
          )}
          {isShort && (
            <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-warning/10 text-warning">
              <PackageX className="h-2.5 w-2.5" /> Short
            </span>
          )}
        </div>
      </div>

      {/* Body — labels row + inputs row for consistent alignment */}
      <div className="px-3 pb-2.5 space-y-1.5">
        {/* Labels row */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_6rem_7rem_4rem] gap-x-3 text-[9px] text-muted-foreground uppercase tracking-wide">
          <span>Progress</span>
          <span className="hidden sm:block">Qty received</span>
          <span className="hidden sm:block">Unit cost <span className="text-muted-foreground/60 normal-case">({currency})</span></span>
          <span className="hidden sm:block">Free</span>
        </div>

        {/* Values row */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_6rem_7rem_4rem] gap-x-3 gap-y-2 items-center">
          {/* Progress */}
          <div className="space-y-1 min-w-0">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
              <span>
                <span className="text-foreground font-medium">{line.prior_received}</span> of {line.ordered_qty} received
                {line.prior_received > 0 && <span className="ml-1">({priorPct.toFixed(0)}%)</span>}
              </span>
              <span>{remaining} remaining</span>
            </div>
            <div className="relative h-2 rounded-full bg-muted overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-success/60" style={{ width: `${Math.min(100, priorPct)}%` }} />
              <div className="absolute inset-y-0 left-0 bg-primary/40 border-r-2 border-primary" style={{ width: `${Math.min(100, projectedPct)}%` }} />
            </div>
          </div>

          {/* Qty received */}
          <Input
            id={`qty-${idx}`}
            type="number"
            className={`h-8 w-full text-right tabular-nums text-xs ${isOverReceive ? 'border-destructive' : ''}`}
            value={line.qty_received}
            min={0}
            disabled={isFullyReceived}
            onChange={(e) => onChange(idx, { qty_received: Number(e.target.value) })}
          />

          {/* Unit cost — locked. Shows PO currency prefix always; when PO
              currency ≠ QAR also shows the QAR equivalent on a second line
              so operators see both what they're paying and what lands in
              inventory / P&L. */}
          <div
            className={`w-full flex flex-col items-end justify-center px-2 rounded-md border bg-muted/40 text-xs tabular-nums text-muted-foreground ${unitCostFormatted.qar ? 'py-1 h-auto min-h-9' : 'h-8'}`}
          >
            <span className="leading-tight">{unitCostFormatted.primary}</span>
            {unitCostFormatted.qar && (
              <span className="text-[10px] text-muted-foreground/70 leading-tight">{unitCostFormatted.qar}</span>
            )}
          </div>

          {/* Free-items gift button */}
          <Popover open={freeOpen} onOpenChange={(o) => { setFreeOpen(o); if (o) setFreeInput(line.free_qty ? String(line.free_qty) : '') }}>
            <PopoverTrigger
              disabled={isFullyReceived}
              render={
                <Button
                  type="button"
                  variant={line.free_qty > 0 ? 'outline' : 'ghost'}
                  size="sm"
                  className={`h-8 w-full text-xs gap-1 ${line.free_qty > 0 ? 'border-success/40 text-success' : 'text-muted-foreground'}`}
                />
              }
            >
              <Gift className="h-3 w-3" />
              {line.free_qty > 0 ? `+${line.free_qty}` : 'Add'}
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3 space-y-2" align="end">
              <div className="text-[11px] font-medium">Free qty of this item</div>
              <p className="text-[10px] text-muted-foreground">Extra units the supplier included at no cost.</p>
              <Input
                type="number"
                min={0}
                value={freeInput}
                onChange={(e) => setFreeInput(e.target.value)}
                placeholder="0"
                className="h-8 text-xs"
                autoFocus
              />
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setFreeOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" size="sm" className="h-7 text-[11px] gap-1" onClick={saveFreeQty}>
                  <Gift className="h-3 w-3" /> Save
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  )
}

// ─── Non-PO free item dialog ───────────────────────────────────────────────────

function NonPoFreeItemDialog({
  open, onOpenChange, onAdd,
}: {
  open:         boolean
  onOpenChange: (v: boolean) => void
  onAdd:        (item: ExtraFreeItem) => void
}) {
  const [lineType, setLineType] = useState<LineType>('products')
  const [lookup,   setLookup]   = useState<InventoryLookupResult | null>(null)
  const [qty,      setQty]      = useState('')

  function reset() { setLookup(null); setQty(''); setLineType('products') }

  function submit() {
    if (!lookup)                    { toast.error('Select an item first'); return }
    const n = parseInt(qty)
    if (isNaN(n) || n <= 0)         { toast.error('Enter a valid quantity'); return }
    if (!(lookup.cost_price > 0))   { toast.error('This item has no cost — set one in inventory first'); return }
    const brandLabel = lookup.brand ? ` (${lookup.brand})` : ''
    onAdd({
      _id: crypto.randomUUID(),
      brand_variant_id: lookup.brand_variant_id,
      item_name: `${lookup.item_name}${brandLabel}`,
      sku: lookup.sku,
      qty: n,
      unit_cost: lookup.cost_price,
    })
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset() }}>
      <DialogContent className="w-full h-full rounded-none sm:rounded-lg sm:w-[32rem] sm:h-auto sm:max-h-[80vh] sm:max-w-[95vw] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-5 pt-5 pb-2">
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <Gift className="h-4 w-4 text-success" />
            Add Free Item (not on PO)
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-3">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Type</Label>
            <Select value={lineType} onValueChange={(v) => { setLineType(v as LineType); setLookup(null) }}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto">
                <SelectItem value="products" className="text-xs">Products</SelectItem>
                <SelectItem value="spare-parts" className="text-xs">Spare Parts</SelectItem>
                <SelectItem value="consumables" className="text-xs">Consumables</SelectItem>
                <SelectItem value="tools" className="text-xs">Tools</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Select item *</Label>
            <CascadeInventorySelector lineType={lineType} value={lookup} onChange={setLookup} brandOriginCascade />
          </div>
          {lookup && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Qty *</Label>
                <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" className="h-9 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Unit cost <span className="text-muted-foreground/60 normal-case">(from inventory, QAR)</span></Label>
                <div className="h-9 flex items-center px-3 rounded-md border bg-muted text-xs tabular-nums">
                  {formatAmount(lookup.cost_price, 'QAR')}
                </div>
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="m-0 px-5 py-3 border-t bg-muted/30">
          <Button variant="outline" size="sm" className="text-[11px] h-8" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" className="text-[11px] h-8 gap-1" disabled={!lookup} onClick={submit}>
            <Gift className="h-3 w-3" /> Add Item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main dialog ───────────────────────────────────────────────────────────────

export function ReceivalFormDialog({ open, onOpenChange }: Props) {
  const createReceival = useCreateReceival()
  const { data: orders } = usePurchaseOrders({})
  const { data: warehouses } = useWarehouses()

  const [selectedPoId, setSelectedPoId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [subContainerId, setSubContainerId] = useState<string | null>(null)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([])
  const [extraFreeItems, setExtraFreeItems] = useState<ExtraFreeItem[]>([])
  const [nonPoOpen, setNonPoOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const guardRef = useRef<GuardedFormDialogHandle>(null)

  const { data: selectedPO } = usePurchaseOrder(selectedPoId || null)
  const poDivisionId = selectedPO?.division_id ?? null

  const { data: allSubs = [] } = useWarehouseSubContainers(warehouseId || null)
  const eligibleSubs = useMemo(() => {
    const active = allSubs.filter((sc) => sc.is_active)
    // Legacy POs (pre-Division Switcher) have NULL division_id — offer every
    // active sub in the warehouse and require an explicit pick. When the PO
    // is division-scoped, filter to matching subs.
    if (poDivisionId === null) return active
    return active.filter((sc) => sc.division_id === poDivisionId)
  }, [allSubs, poDivisionId])

  useEffect(() => {
    if (eligibleSubs.length === 1) {
      setSubContainerId(eligibleSubs[0].id)
    } else if (eligibleSubs.length === 0) {
      setSubContainerId(null)
    } else if (subContainerId && !eligibleSubs.some((sc) => sc.id === subContainerId)) {
      setSubContainerId(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId, poDivisionId, eligibleSubs.length])

  useEffect(() => {
    if (!selectedPoId || !selectedPO) { setLines([]); setExtraFreeItems([]); return }
    setLines(
      (selectedPO.po_line_items ?? []).map((li) => {
        const ordered   = li.qty ?? 0
        const prior     = li.received_qty ?? 0
        const remaining = Math.max(0, ordered - prior)
        const brand = li.inventory_item_brand_variants?.brand ?? null
        const cat = li.inventory_item_brand_variants?.inventory_items?.inventory_categories?.name_en ?? null
        return {
          po_line_item_id: li.id,
          brand_variant_id: li.brand_variant_id ?? null,
          item_name: li.item_name || li.inventory_item_brand_variants?.inventory_items?.name_en || '(No name)',
          brand,
          category: cat,
          sku: li.sku ?? null,
          ordered_qty: ordered,
          prior_received: prior,
          po_unit_price: li.unit_price ?? 0,
          qty_received: remaining,
          free_qty: 0,
          unit_cost: li.unit_price ?? 0,
        }
      })
    )
    setExtraFreeItems([])
  }, [selectedPoId, selectedPO])

  const currency = selectedPO?.currency ?? 'QAR'

  const summary = useMemo(() => {
    let totalPaid = 0
    let totalFree = 0
    let totalCost = 0
    let discrepancies = 0
    for (const l of lines) {
      totalPaid += l.qty_received
      totalFree += l.free_qty
      totalCost += l.qty_received * l.unit_cost
      const remaining = Math.max(0, l.ordered_qty - l.prior_received)
      if (l.qty_received > 0 && l.qty_received !== remaining) discrepancies++
    }
    for (const fi of extraFreeItems) {
      totalFree += fi.qty
    }
    return { totalPaid, totalFree, totalCost, discrepancies, lineCount: lines.length + extraFreeItems.length }
  }, [lines, extraFreeItems])

  const receivableLineCount = useMemo(
    () => lines.filter((l) => l.prior_received < l.ordered_qty).length,
    [lines],
  )

  // Dirty as soon as the operator engages — picking a PO auto-fills line
  // quantities but that's still user intent, so treat any PO selection as
  // dirty. Warehouse pick, notes, non-PO free items, or per-line edits also
  // count.
  const isDirty =
    selectedPoId !== '' ||
    warehouseId !== '' ||
    notes.trim() !== '' ||
    extraFreeItems.length > 0 ||
    lines.some((l) => l.free_qty > 0)

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSelectedPoId(''); setWarehouseId(''); setNotes('')
      setLines([]); setExtraFreeItems([])
    }
    onOpenChange(next)
  }

  const receiveAll = () => {
    setLines((prev) => prev.map((l) => ({
      ...l,
      qty_received: Math.max(0, l.ordered_qty - l.prior_received),
    })))
    toast.success('Filled all remaining quantities from PO')
  }

  const clearAll = () => {
    setLines((prev) => prev.map((l) => ({ ...l, qty_received: 0, free_qty: 0 })))
    setExtraFreeItems([])
  }

  const submit = async () => {
    if (!selectedPoId || !warehouseId || !date) {
      toast.error('Select PO, warehouse and date')
      return
    }
    if (eligibleSubs.length > 1 && !subContainerId) {
      toast.error('Pick a sub-container before submitting')
      return
    }
    if (summary.totalPaid === 0 && summary.totalFree === 0) {
      toast.error('Add at least one qty (paid or free) before recording')
      return
    }
    setSaving(true)
    try {
      const items: {
        po_line_item_id: string | null
        brand_variant_id: string | null
        item_name: string
        sku: string | null
        qty_received: number
        unit_cost: number
        is_free?: boolean
      }[] = []
      for (const l of lines) {
        if (l.qty_received > 0) items.push({
          po_line_item_id: l.po_line_item_id,
          brand_variant_id: l.brand_variant_id,
          item_name: l.item_name,
          sku: l.sku,
          qty_received: l.qty_received,
          unit_cost: l.unit_cost,
          is_free: false,
        })
        if (l.free_qty > 0) items.push({
          po_line_item_id: l.po_line_item_id,
          brand_variant_id: l.brand_variant_id,
          item_name: l.item_name,
          sku: l.sku,
          qty_received: l.free_qty,
          unit_cost: l.unit_cost,
          is_free: true,
        })
      }
      for (const fi of extraFreeItems) {
        items.push({
          po_line_item_id: null,
          brand_variant_id: fi.brand_variant_id,
          item_name: fi.item_name,
          sku: fi.sku,
          qty_received: fi.qty,
          unit_cost: fi.unit_cost,
          is_free: true,
        })
      }
      await createReceival.mutateAsync({
        po_id: selectedPoId,
        warehouse_id: warehouseId,
        sub_container_id: subContainerId,
        date,
        notes,
        items,
      })
      toast.success('Receival recorded and approved')
      guardRef.current?.closeAfterSubmit()
    } catch (err: unknown) {
      toast.error(humanizeDbError(err))
    } finally {
      setSaving(false)
    }
  }

  const approvablePOs = (orders ?? []).filter((o) =>
    o.status === 'approved' || o.status === 'partially_received'
  )

  return (
    <GuardedDialog open={open} onOpenChange={handleOpenChange} isDirty={isDirty} ref={guardRef}>
      <DialogContent className="w-full h-full rounded-none sm:rounded-lg sm:w-[54rem] sm:h-[85vh] sm:max-w-[95vw] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-5 pt-5 pb-0 flex-shrink-0">
          <DialogTitle className="text-sm font-semibold">Create Receival</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 pt-3 space-y-4">
          {/* Top selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="recv-po" className="text-[11px] text-muted-foreground">Purchase Order *</Label>
              <Select value={selectedPoId} onValueChange={(v) => setSelectedPoId(v ?? '')}>
                <SelectTrigger id="recv-po" className="h-9 text-xs">
                  <SelectValue placeholder="Select PO" />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {approvablePOs.map((po) => (
                    <SelectItem key={po.id} value={po.id} className="text-xs">
                      {po.po_number} — {po.supplier_name ?? ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="recv-warehouse" className="text-[11px] text-muted-foreground">Warehouse *</Label>
              <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? '')}>
                <SelectTrigger id="recv-warehouse" className="h-9 text-xs">
                  <SelectValue placeholder="Select warehouse" />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {(warehouses ?? []).map((w) => (
                    <SelectItem key={w.id} value={w.id} className="text-xs">{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="recv-date" className="text-[11px] text-muted-foreground">Date *</Label>
              <Input id="recv-date" type="date" className="h-9 text-xs" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {warehouseId && (
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Package className="h-2.5 w-2.5" />
                Sub-container{poDivisionId === null ? ' *' : ''}
              </Label>
              {eligibleSubs.length === 0 ? (
                <p className="text-xs text-muted-foreground border rounded-md py-2 px-3 bg-muted/30">
                  {poDivisionId === null
                    ? 'No active sub-container in this warehouse.'
                    : "No active sub-container in this warehouse for the PO's division. One will be auto-created when you submit."}
                </p>
              ) : eligibleSubs.length === 1 ? (
                <div className="flex items-center gap-2 border rounded-md py-2 px-3 bg-muted/30 min-h-9">
                  <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs font-medium truncate">{eligibleSubs[0].name}</span>
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5 flex-shrink-0">
                    Auto-selected
                  </Badge>
                </div>
              ) : (
                <Select
                  value={subContainerId ?? ''}
                  onValueChange={(v) => setSubContainerId(v || null)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Pick a sub-container" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {eligibleSubs.map((sc) => (
                      <SelectItem key={sc.id} value={sc.id} className="text-xs">
                        {sc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* PO context card */}
          {selectedPO && (
            <div className="rounded-lg border bg-muted/20 px-3 py-2.5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
              <div>
                <div className="text-[9px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Truck className="h-2.5 w-2.5" /> Supplier
                </div>
                <p className="font-semibold truncate">{selectedPO.supplier_name ?? '—'}</p>
              </div>
              <div>
                <div className="text-[9px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Calendar className="h-2.5 w-2.5" /> Order date
                </div>
                <p className="font-semibold">
                  {selectedPO.created_at ? format(new Date(selectedPO.created_at), 'dd MMM yyyy') : '—'}
                </p>
              </div>
              <div>
                <div className="text-[9px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Building2 className="h-2.5 w-2.5" /> Order total
                </div>
                <p className="font-semibold tabular-nums">
                  {formatAmount(selectedPO.subtotal ?? 0, selectedPO.currency ?? 'QAR')}
                </p>
              </div>
              <div>
                <div className="text-[9px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <PackageCheck className="h-2.5 w-2.5" /> Progress
                </div>
                <p className="font-semibold">
                  {receivableLineCount} of {lines.length} line{lines.length === 1 ? '' : 's'} remaining
                </p>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1">
            <Label htmlFor="recv-notes" className="text-[11px] text-muted-foreground">Notes</Label>
            <Textarea
              id="recv-notes"
              className="text-xs min-h-[52px] resize-none"
              placeholder="Optional notes about this receival (short shipment reason, damage…)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Items */}
          {lines.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Label className="text-[11px] font-medium">Items ({lines.length})</Label>
                <div className="flex items-center gap-1.5">
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px]" onClick={clearAll}>
                    Clear
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] gap-1 border-success/40 text-success hover:bg-success/10" onClick={() => setNonPoOpen(true)}>
                    <Gift className="h-3 w-3" />
                    Add Free Item
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={receiveAll}>
                    <PackageCheck className="h-3 w-3" />
                    Receive all remaining
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                {lines.map((line, idx) => (
                  <div key={idx} className={STAGGER_IN} style={staggerDelay(idx)}>
                    <ItemCard
                      line={line}
                      idx={idx}
                      onChange={(i, patch) => setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)))}
                      currency={currency}
                      exchangeRate={selectedPO?.exchange_rate ?? null}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Non-PO free items */}
          {extraFreeItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Gift className="h-3 w-3 text-success" />
                <Label className="text-[11px] font-medium">Free items (not on PO)</Label>
              </div>
              <div className="space-y-1.5">
                {extraFreeItems.map((fi) => (
                  <div key={fi._id} className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-success/5">
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold truncate">{fi.item_name}</p>
                      {fi.sku && <p className="text-[10px] text-muted-foreground">{fi.sku}</p>}
                    </div>
                    <span className="text-[10px] text-success font-medium tabular-nums">+{fi.qty} free</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
                      {formatAmount(fi.unit_cost, currency)} / unit
                    </span>
                    <button
                      type="button"
                      onClick={() => setExtraFreeItems((prev) => prev.filter((x) => x._id !== fi._id))}
                      className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!selectedPoId && (
            <div className="rounded-lg border border-dashed py-8 text-center text-muted-foreground">
              <PackageCheck className="h-6 w-6 mx-auto mb-1.5 opacity-30" />
              <p className="text-xs">Select a PO to load expected line items</p>
            </div>
          )}
        </div>

        {/* Sticky total footer */}
        {(lines.length > 0 || extraFreeItems.length > 0) && (
          <div className="flex-shrink-0 border-t bg-muted/30 px-5 py-2 grid grid-cols-4 gap-3 text-[11px]">
            <div>
              <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Paid qty</div>
              <p className="font-bold tabular-nums">{summary.totalPaid.toLocaleString('en-QA')}</p>
            </div>
            <div>
              <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Free qty</div>
              <p className={`font-bold tabular-nums ${summary.totalFree > 0 ? 'text-success' : ''}`}>
                +{summary.totalFree.toLocaleString('en-QA')}
              </p>
            </div>
            <div>
              <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Total cost</div>
              <p className="font-bold tabular-nums">{formatAmount(summary.totalCost, currency)}</p>
              {selectedPO?.exchange_rate && currency !== 'QAR' && selectedPO.exchange_rate !== 1 && (
                <p className="text-[10px] text-muted-foreground/70 tabular-nums font-normal">
                  ≈ {formatAmount(summary.totalCost * selectedPO.exchange_rate, 'QAR')}
                </p>
              )}
            </div>
            <div>
              <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Discrepancies</div>
              <p className={`font-bold tabular-nums ${summary.discrepancies > 0 ? 'text-warning' : ''}`}>
                {summary.discrepancies} line{summary.discrepancies === 1 ? '' : 's'}
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="m-0 px-5 py-3 border-t bg-background rounded-b-lg">
          <Button variant="outline" size="sm" className="text-[11px] h-8" onClick={() => guardRef.current?.requestClose()}>Cancel</Button>
          <Button
            size="sm"
            className="text-[11px] h-8"
            onClick={submit}
            disabled={saving || !selectedPoId || (summary.totalPaid === 0 && summary.totalFree === 0)}
          >
            {saving ? 'Recording…' : 'Record Receival'}
          </Button>
        </DialogFooter>

        <NonPoFreeItemDialog
          open={nonPoOpen}
          onOpenChange={setNonPoOpen}
          onAdd={(item) => setExtraFreeItems((prev) => [...prev, item])}
        />
      </DialogContent>
    </GuardedDialog>
  )
}
