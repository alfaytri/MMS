'use client'

import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { Gift, Check, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useWarehouseSubContainers } from '@/hooks/useWarehouseSubContainers'
import { useCreateReceival } from '@/hooks/useReceivals'
import { useDivisions } from '@/hooks/useDivisions'
import { CascadeInventorySelector } from '@/components/purchase/CascadeInventorySelector'
import { variantPickerLabel, GENERIC_VARIANT_LABEL } from '@/lib/inventory/variantPickerLabel'
import type { LineType } from '@/components/purchase/PoLineItemsEditor'
import type { PurchaseOrder, InventoryLookupResult } from '@/hooks/usePurchaseOrders'

type ReceiveRow = {
  po_line_item_id: string
  brand_variant_id: string | null
  item_name: string        // vendor name (user-entered)
  system_name: string | null  // name from inventory system
  variant_label: string | null  // "Brand · Origin" (null when generic)
  sku: string | null
  unit: string
  ordered: number
  alreadyReceived: number
  receiveNow: number
  unitCost: number
  freeQty: number
  division_id: string | null
}

type ExtraFreeItem = {
  _id: string
  brand_variant_id: string | null
  item_name: string
  sku: string | null
  qty: number
  unitCost: number
}

export function PoReceiveTab({
  po,
  onReceivalCreated,
}: {
  po: PurchaseOrder
  onReceivalCreated?: (r: { id: string; number: string }) => void
}) {
  const { data: warehouses } = useWarehouses()
  const createReceival = useCreateReceival()

  const [warehouseId, setWarehouseId] = useState('')
  const [subContainerId, setSubContainerId] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const poDivisionId = po.division_id ?? null
  const { data: divisions = [] } = useDivisions()
  const isMultiDivPO = (po.division_ids?.length ?? 0) > 1
  const divisionShort = (idv: string | null) => {
    if (!idv) return null
    const d = divisions.find((x) => x.id === idv)
    return d ? (d.short_name || d.name) : null
  }

  const { data: allSubs = [] } = useWarehouseSubContainers(warehouseId || null)
  // When the PO has a division, filter to matching sub-containers. When the
  // PO has no division (legacy or unassigned), let the operator pick from any
  // active sub-container in the warehouse — the RPC's division-match guard is
  // suppressed for null PO divisions.
  const eligibleSubs = useMemo(() => {
    const active = allSubs.filter((sc) => sc.is_active)
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

  const [rows, setRows] = useState<ReceiveRow[]>(() =>
    (po.po_line_items ?? []).map((li) => {
      const bv = li.inventory_item_brand_variants
      const vlabel = variantPickerLabel({
        brand_name: bv?.brands?.name ?? null,
        brand: bv?.brand ?? null,
        country_name: bv?.country_codes?.name ?? null,
      })
      const variant_label = vlabel.primary === GENERIC_VARIANT_LABEL
        ? null
        : vlabel.origin ? `${vlabel.primary} · ${vlabel.origin}` : vlabel.primary
      return {
        po_line_item_id: li.id,
        brand_variant_id: li.brand_variant_id ?? null,
        item_name: li.item_name,
        division_id: li.division_id ?? null,
        system_name: bv?.inventory_items?.name_en ?? null,
        variant_label,
        sku: li.sku ?? null,
        unit: li.unit ?? '',
        ordered: li.qty,
        alreadyReceived: li.received_qty,
        receiveNow: Math.max(0, li.qty - li.received_qty),
        unitCost: li.unit_price,
        freeQty: 0,
      }
    })
  )

  const [extraFreeItems, setExtraFreeItems] = useState<ExtraFreeItem[]>([])

  // ── Same-product free dialog ─────────────────────────────────────────────────
  const [freeRowId, setFreeRowId] = useState<string | null>(null)
  const [freeQtyInput, setFreeQtyInput] = useState('')

  function openFreeDialog(id: string) {
    const row = rows.find((r) => r.po_line_item_id === id)
    setFreeQtyInput(row?.freeQty ? String(row.freeQty) : '')
    setFreeRowId(id)
  }

  function saveFreeQty() {
    const qty = parseInt(freeQtyInput)
    if (!freeRowId || isNaN(qty) || qty < 0) { setFreeRowId(null); return }
    setRows((prev) => prev.map((r) =>
      r.po_line_item_id === freeRowId ? { ...r, freeQty: qty } : r
    ))
    setFreeRowId(null)
    setFreeQtyInput('')
  }

  // ── Non-PO free item dialog ──────────────────────────────────────────────────
  const [nonPoOpen, setNonPoOpen] = useState(false)
  const [nonPoLookup, setNonPoLookup] = useState<InventoryLookupResult | null>(null)
  const [nonPoLineType, setNonPoLineType] = useState<LineType>('products')
  const [nonPoQty, setNonPoQty] = useState('')

  function resetNonPo() {
    setNonPoLookup(null); setNonPoQty(''); setNonPoLineType('products')
  }

  function addNonPoFree() {
    if (!nonPoLookup) { toast.error('Select an item first'); return }
    const qty = parseInt(nonPoQty)
    if (isNaN(qty) || qty <= 0) { toast.error('Enter a valid quantity'); return }
    const cost = nonPoLookup.cost_price
    if (cost <= 0) { toast.error('Unit cost is required'); return }
    const brandLabel = nonPoLookup.brand ? ` (${nonPoLookup.brand})` : ''
    const name = `${nonPoLookup.item_name}${brandLabel}`
    setExtraFreeItems((prev) => [
      ...prev,
      { _id: crypto.randomUUID(), brand_variant_id: nonPoLookup.brand_variant_id, item_name: name, sku: nonPoLookup.sku, qty, unitCost: cost },
    ])
    resetNonPo()
    setNonPoOpen(false)
  }

  // ── Submit ───────────────────────────────────────────────────────────────────
  function fillAll() {
    setRows((prev) => prev.map((r) => ({
      ...r,
      receiveNow: Math.max(0, r.ordered - r.alreadyReceived),
    })))
  }

  const subContainerOk =
    (poDivisionId !== null && eligibleSubs.length <= 1) ||
    !!subContainerId
  const canSubmit = !!warehouseId && subContainerOk && (
    rows.some((r) => r.receiveNow > 0 || r.freeQty > 0) ||
    extraFreeItems.length > 0
  )

  async function submit() {
    if (!canSubmit) return
    setSaving(true)

    const items: NonNullable<Parameters<typeof createReceival.mutateAsync>[0]['items']> = []
    for (const r of rows) {
      if (r.receiveNow > 0) items.push({ po_line_item_id: r.po_line_item_id, brand_variant_id: r.brand_variant_id, item_name: r.item_name, sku: r.sku, qty_received: r.receiveNow, unit_cost: r.unitCost, is_free: false })
      if (r.freeQty > 0) items.push({ po_line_item_id: r.po_line_item_id, brand_variant_id: r.brand_variant_id, item_name: r.item_name, sku: r.sku, qty_received: r.freeQty, unit_cost: r.unitCost, is_free: true })
    }
    for (const fi of extraFreeItems) {
      items.push({ po_line_item_id: null, brand_variant_id: fi.brand_variant_id, item_name: fi.item_name, sku: fi.sku, qty_received: fi.qty, unit_cost: fi.unitCost, is_free: true })
    }

    const regularItems = items.filter((i) => !i.is_free)

    try {
      const result = await createReceival.mutateAsync({
        po_id: po.id,
        warehouse_id: warehouseId,
        sub_container_id: subContainerId,
        date: new Date().toISOString().split('T')[0],
        notes,
        items,
      })
      toast.success('Receival recorded successfully')
      setRows((prev) => prev.map((r) => {
        const received = regularItems.find((i) => i.po_line_item_id === r.po_line_item_id)?.qty_received ?? 0
        return { ...r, alreadyReceived: r.alreadyReceived + received, receiveNow: 0, freeQty: 0 }
      }))
      setExtraFreeItems([])
      setNotes('')
      onReceivalCreated?.({ id: result.receival_id, number: result.receival_number })
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Failed to record receival')
    } finally {
      setSaving(false)
    }
  }

  const freeRow = rows.find((r) => r.po_line_item_id === freeRowId)

  return (
    <div className="space-y-4">
      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1 flex-1 min-w-[180px]">
            <Label htmlFor="po-receive-warehouse">Warehouse *</Label>
            <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? '')}>
              <SelectTrigger id="po-receive-warehouse"><SelectValue placeholder="Select warehouse…" /></SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto">
                {(warehouses ?? []).map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" type="button" onClick={fillAll}>
            Fill All
          </Button>
          <Button
            variant="outline" size="sm" type="button"
            className="gap-1.5 text-success border-green-300 hover:bg-success/10"
            onClick={() => { resetNonPo(); setNonPoOpen(true) }}
          >
            <Gift className="h-3.5 w-3.5" /> + Free
          </Button>
          <Button disabled={!canSubmit || saving} onClick={submit} className="gap-1.5">
            {saving ? 'Saving…' : 'Receive'}
          </Button>
        </div>

        {warehouseId && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span className="inline-flex items-center gap-1 flex-shrink-0">
              <Package className="h-3 w-3" />
              Sub-container{poDivisionId === null ? ' *' : ''}:
            </span>
            {eligibleSubs.length === 0 ? (
              <span className="italic">
                {poDivisionId === null
                  ? 'No active sub-container in this warehouse.'
                  : 'None yet — one will be auto-created on submit.'}
              </span>
            ) : eligibleSubs.length === 1 ? (
              <>
                <span className="font-medium text-foreground truncate max-w-[400px]" title={eligibleSubs[0].name}>
                  {eligibleSubs[0].name}
                </span>
                <Badge variant="outline" className="text-[10px] h-4 px-1.5 flex-shrink-0">
                  Auto
                </Badge>
              </>
            ) : (
              <Select
                value={subContainerId ?? ''}
                onValueChange={(v) => setSubContainerId(v || null)}
              >
                <SelectTrigger className="h-7 text-xs w-auto min-w-[240px] max-w-[400px]">
                  <SelectValue placeholder="Pick a sub-container…" />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {eligibleSubs.map((sc) => (
                    <SelectItem key={sc.id} value={sc.id}>
                      {sc.name}
                      {sc.division_name ? ` — ${sc.division_name}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right w-[90px]">Ordered</TableHead>
              <TableHead className="text-right w-[70px]">Free</TableHead>
              <TableHead className="text-right w-[90px]">Received</TableHead>
              <TableHead className="text-right w-[100px]">Remaining</TableHead>
              <TableHead className="text-right w-[120px]">Receive Qty</TableHead>
              <TableHead className="w-[110px] hidden sm:table-cell">
                Unit Cost <span className="text-[10px] font-normal text-muted-foreground">({po.currency ?? 'QAR'})</span>
              </TableHead>
              <TableHead className="w-[48px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const remaining = row.ordered - row.alreadyReceived
              const done = remaining <= 0
              return (
                <TableRow key={row.po_line_item_id} className={done ? 'bg-muted/30' : ''}>
                  <TableCell>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-medium text-sm">{row.system_name ?? row.item_name}</p>
                      {isMultiDivPO && divisionShort(row.division_id) && (
                        <Badge variant="outline" className="h-4 text-[10px] px-1.5">{divisionShort(row.division_id)}</Badge>
                      )}
                    </div>
                    {(row.variant_label || row.sku) && (
                      <p className="text-xs text-muted-foreground">
                        {[row.variant_label, row.sku].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {row.ordered}{row.unit && <span className="text-muted-foreground ml-1 text-xs">{row.unit}</span>}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {row.freeQty > 0
                      ? <span className="text-success font-medium">{row.freeQty}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {row.alreadyReceived > 0
                      ? <span className="text-success">{row.alreadyReceived}</span>
                      : <span className="text-muted-foreground">0</span>}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {done
                      ? <span className="inline-flex items-center gap-1 text-success"><Check className="h-3.5 w-3.5" /></span>
                      : <>{remaining}{row.unit && <span className="text-muted-foreground ml-1 text-xs">{row.unit}</span>}</>}
                  </TableCell>
                  <TableCell className="text-right">
                    {done
                      ? <span className="text-xs text-muted-foreground">Done</span>
                      : (
                        <Input
                          type="number" min={0} max={remaining}
                          value={row.receiveNow}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            setRows((prev) => prev.map((r) => r.po_line_item_id === row.po_line_item_id ? { ...r, receiveNow: Math.min(v, remaining) } : r))
                          }}
                          className="h-7 w-20 text-right ml-auto"
                        />
                      )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-right text-sm tabular-nums">
                    <div className="flex flex-col items-end leading-tight">
                      <span>{po.currency ?? 'QAR'} {row.unitCost.toLocaleString('en', { minimumFractionDigits: 2 })}</span>
                      {po.currency !== 'QAR' && po.exchange_rate && po.exchange_rate !== 1 && (
                        <span className="text-[10px] text-muted-foreground/70">
                          ≈ QAR {(row.unitCost * po.exchange_rate).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      title="Add free items for this product"
                      onClick={() => openFreeDialog(row.po_line_item_id)}
                      className="flex items-center justify-center h-7 w-7 rounded hover:bg-success/10 text-success hover:text-success transition-colors"
                    >
                      <Gift className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              )
            })}

            {/* Extra non-PO free items */}
            {extraFreeItems.map((fi) => (
              <TableRow key={fi._id} className="bg-success/10/50">
                <TableCell>
                  <p className="font-medium text-sm text-green-700">{fi.item_name}</p>
                  {fi.sku && <p className="text-xs text-muted-foreground">{fi.sku}</p>}
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">—</TableCell>
                <TableCell className="text-right text-sm text-success font-medium">{fi.qty}</TableCell>
                <TableCell colSpan={3} className="text-xs text-success italic">Free (not on PO)</TableCell>
                <TableCell className="hidden sm:table-cell text-right text-sm tabular-nums">
                  QAR {fi.unitCost.toLocaleString('en', { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => setExtraFreeItems((prev) => prev.filter((x) => x._id !== fi._id))}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    ✕
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* ── Notes ─────────────────────────────────────────────────────────── */}
      <div className="space-y-1">
        <Label htmlFor="po-receive-notes">Notes</Label>
        <Input id="po-receive-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional receival notes…" />
      </div>

      {/* ── Same-product free item dialog ─────────────────────────────────── */}
      <Dialog open={!!freeRowId} onOpenChange={(open) => { if (!open) setFreeRowId(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Free Items</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={freeRow?.item_name ?? ''} readOnly className="bg-muted text-sm" />
            <div className="space-y-1">
              <Label htmlFor="po-free-qty">QTY</Label>
              <Input
                id="po-free-qty"
                type="number" min={0}
                value={freeQtyInput}
                onChange={(e) => setFreeQtyInput(e.target.value)}
                placeholder="0"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setFreeRowId(null)}>Cancel</Button>
            <Button onClick={saveFreeQty} className="gap-1.5 bg-blue-600 hover:bg-blue-700">
              <Gift className="h-3.5 w-3.5" /> Add Free
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Non-PO free item dialog ────────────────────────────────────────── */}
      <Dialog open={nonPoOpen} onOpenChange={(open) => { if (!open) { resetNonPo(); setNonPoOpen(false) } }}>
        <DialogContent className="max-w-lg gap-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-4 w-4 text-blue-600" />
              Add Free Item
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* ── Inventory type selector ── */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Type</Label>
              <Select value={nonPoLineType} onValueChange={(v) => { setNonPoLineType(v as LineType); setNonPoLookup(null) }}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  <SelectItem value="products">Products</SelectItem>
                  <SelectItem value="spare-parts">Spare Parts</SelectItem>
                  <SelectItem value="consumables">Consumables</SelectItem>
                  <SelectItem value="tools">Tools</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* ── Cascade selector (Category → Subcategory → Type → Item → Brand) ── */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Select Item *
              </Label>
              <CascadeInventorySelector
                lineType={nonPoLineType}
                value={nonPoLookup}
                onChange={setNonPoLookup}
                brandOriginCascade
              />
            </div>

            {/* ── Qty + Unit Cost side-by-side (after item selected) ── */}
            {nonPoLookup && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Qty *</Label>
                  <Input
                    type="number" min={1}
                    value={nonPoQty}
                    onChange={(e) => setNonPoQty(e.target.value)}
                    placeholder="0"
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Unit Cost
                    <span className="font-normal normal-case ml-1">(from inventory, QAR)</span>
                  </Label>
                  <div className="h-10 flex items-center px-3 rounded-md border bg-muted text-sm tabular-nums">
                    QAR {nonPoLookup.cost_price.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 !mx-0 !mb-0">
            <Button variant="outline" onClick={() => { resetNonPo(); setNonPoOpen(false) }}>Cancel</Button>
            <Button onClick={addNonPoFree} disabled={!nonPoLookup} className="gap-1.5 bg-blue-600 hover:bg-blue-700">
              <Gift className="h-3.5 w-3.5" /> Add Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
