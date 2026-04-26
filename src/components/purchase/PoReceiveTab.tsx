'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Gift, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { useCreateReceival } from '@/hooks/useReceivals'
import {
  useInventoryCategories, useInventoryItemsAll, useInventoryBrandVariants,
} from '@/hooks/useInventory'
import type { PurchaseOrder } from '@/hooks/usePurchaseOrders'

type ReceiveRow = {
  po_line_item_id: string
  brand_variant_id: string | null
  item_name: string
  sku: string | null
  unit: string
  ordered: number
  alreadyReceived: number
  receiveNow: number
  unitCost: number
  freeQty: number
}

type ExtraFreeItem = {
  _id: string
  item_name: string
  sku: string | null
  qty: number
}

export function PoReceiveTab({ po }: { po: PurchaseOrder }) {
  const { data: warehouses } = useWarehouses()
  const createReceival = useCreateReceival()

  const [warehouseId, setWarehouseId] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const [rows, setRows] = useState<ReceiveRow[]>(() =>
    (po.po_line_items ?? []).map((li) => ({
      po_line_item_id: li.id,
      brand_variant_id: li.brand_variant_id ?? null,
      item_name: li.item_name,
      sku: li.sku ?? null,
      unit: li.unit ?? '',
      ordered: li.qty,
      alreadyReceived: li.received_qty,
      receiveNow: Math.max(0, li.qty - li.received_qty),
      unitCost: li.unit_price,
      freeQty: 0,
    }))
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
  const [nonPoCatId, setNonPoCatId] = useState('')
  const [nonPoItemId, setNonPoItemId] = useState('')
  const [nonPoVariantId, setNonPoVariantId] = useState('')
  const [nonPoQty, setNonPoQty] = useState('')

  const { data: categories = [] } = useInventoryCategories()
  const { data: allItems = [] } = useInventoryItemsAll()
  const { data: variants = [] } = useInventoryBrandVariants(nonPoItemId || null)

  const filteredItems = (allItems as any[]).filter((i) => !nonPoCatId || i.category_id === nonPoCatId)
  const selectedItem = (allItems as any[]).find((i) => i.id === nonPoItemId)
  const selectedVariant = (variants as any[]).find((v) => v.id === nonPoVariantId)

  function resetNonPo() {
    setNonPoCatId(''); setNonPoItemId(''); setNonPoVariantId(''); setNonPoQty('')
  }

  function addNonPoFree() {
    const qty = parseInt(nonPoQty)
    if (!nonPoItemId || isNaN(qty) || qty <= 0) {
      toast.error('Select an item and enter a valid quantity')
      return
    }
    const brandLabel = selectedVariant
      ? ` (${(selectedVariant as any).brand ?? ''})`
      : ''
    const name = `${selectedItem?.name_en ?? 'Free Item'}${brandLabel}`
    const sku = (selectedVariant as any)?.code ?? selectedItem?.sku ?? null
    setExtraFreeItems((prev) => [
      ...prev,
      { _id: crypto.randomUUID(), item_name: name, sku, qty },
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

  const canSubmit = !!warehouseId && (
    rows.some((r) => r.receiveNow > 0 || r.freeQty > 0) ||
    extraFreeItems.length > 0
  )

  async function submit() {
    if (!canSubmit) return
    setSaving(true)

    const items: NonNullable<Parameters<typeof createReceival.mutateAsync>[0]['items']> = []
    for (const r of rows) {
      if (r.receiveNow > 0) items.push({ po_line_item_id: r.po_line_item_id, brand_variant_id: r.brand_variant_id, item_name: r.item_name, sku: r.sku, qty_received: r.receiveNow, unit_cost: r.unitCost, is_free: false })
      if (r.freeQty > 0) items.push({ po_line_item_id: r.po_line_item_id, brand_variant_id: r.brand_variant_id, item_name: r.item_name, sku: r.sku, qty_received: r.freeQty, unit_cost: 0, is_free: true })
    }
    for (const fi of extraFreeItems) {
      items.push({ po_line_item_id: null, brand_variant_id: null, item_name: fi.item_name, sku: fi.sku, qty_received: fi.qty, unit_cost: 0, is_free: true })
    }

    const regularItems = items.filter((i) => !i.is_free)

    try {
      await createReceival.mutateAsync({ po_id: po.id, warehouse_id: warehouseId, date: new Date().toISOString().split('T')[0], notes, items })
      toast.success('Receival recorded successfully')
      setRows((prev) => prev.map((r) => {
        const received = regularItems.find((i) => i.po_line_item_id === r.po_line_item_id)?.qty_received ?? 0
        return { ...r, alreadyReceived: r.alreadyReceived + received, receiveNow: 0, freeQty: 0 }
      }))
      setExtraFreeItems([])
      setNotes('')
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
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1 flex-1 min-w-[180px]">
          <Label>Warehouse *</Label>
          <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? '')}>
            <SelectTrigger><SelectValue placeholder="Select warehouse…" /></SelectTrigger>
            <SelectContent>
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
          className="gap-1.5 text-green-600 border-green-300 hover:bg-green-50"
          onClick={() => { resetNonPo(); setNonPoOpen(true) }}
        >
          <Gift className="h-3.5 w-3.5" /> + Free
        </Button>
        <Button disabled={!canSubmit || saving} onClick={submit} className="gap-1.5">
          {saving ? 'Saving…' : 'Receive'}
        </Button>
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
              <TableHead className="w-[80px] hidden sm:table-cell">Unit Cost</TableHead>
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
                    <p className="font-medium text-sm">{row.item_name}</p>
                    {row.sku && <p className="text-xs text-muted-foreground">{row.sku}</p>}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {row.ordered}{row.unit && <span className="text-muted-foreground ml-1 text-xs">{row.unit}</span>}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {row.freeQty > 0
                      ? <span className="text-green-600 font-medium">{row.freeQty}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {row.alreadyReceived > 0
                      ? <span className="text-green-600">{row.alreadyReceived}</span>
                      : <span className="text-muted-foreground">0</span>}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {done
                      ? <span className="inline-flex items-center gap-1 text-green-600"><Check className="h-3.5 w-3.5" /></span>
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
                  <TableCell className="hidden sm:table-cell">
                    <Input
                      type="number" min={0} step="0.01"
                      value={row.unitCost}
                      onChange={(e) => setRows((prev) => prev.map((r) => r.po_line_item_id === row.po_line_item_id ? { ...r, unitCost: Number(e.target.value) } : r))}
                      className="h-7 w-24 text-right ml-auto"
                    />
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      title="Add free items for this product"
                      onClick={() => openFreeDialog(row.po_line_item_id)}
                      className="flex items-center justify-center h-7 w-7 rounded hover:bg-green-50 text-green-500 hover:text-green-600 transition-colors"
                    >
                      <Gift className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              )
            })}

            {/* Extra non-PO free items */}
            {extraFreeItems.map((fi) => (
              <TableRow key={fi._id} className="bg-green-50/50">
                <TableCell>
                  <p className="font-medium text-sm text-green-700">{fi.item_name}</p>
                  {fi.sku && <p className="text-xs text-muted-foreground">{fi.sku}</p>}
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">—</TableCell>
                <TableCell className="text-right text-sm text-green-600 font-medium">{fi.qty}</TableCell>
                <TableCell colSpan={3} className="text-xs text-green-600 italic">Free (not on PO)</TableCell>
                <TableCell className="hidden sm:table-cell" />
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
        <Label>Notes</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional receival notes…" />
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
              <Label>QTY</Label>
              <Input
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Free Item (not on PO)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Category */}
            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={nonPoCatId || 'all'} onValueChange={(v) => { setNonPoCatId((v ?? '') === 'all' ? '' : (v ?? '')); setNonPoItemId(''); setNonPoVariantId('') }}>
                <SelectTrigger><SelectValue placeholder="All Categories" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {(categories as any[]).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Item */}
            <div className="space-y-1">
              <Label>Item *</Label>
              <Select
                value={nonPoItemId || 'none'}
                onValueChange={(v) => { setNonPoItemId((v ?? '') === 'none' ? '' : (v ?? '')); setNonPoVariantId('') }}
              >
                <SelectTrigger><SelectValue placeholder="Select item…" /></SelectTrigger>
                <SelectContent>
                  {filteredItems.length === 0 ? (
                    <SelectItem value="none" disabled>No items found</SelectItem>
                  ) : (
                    filteredItems.map((i: any) => (
                      <SelectItem key={i.id} value={i.id}>{i.name_en}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Brand / Variant */}
            <div className="space-y-1">
              <Label>Brand / Variant <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Select
                value={nonPoVariantId || 'none'}
                onValueChange={(v) => setNonPoVariantId((v ?? '') === 'none' ? '' : (v ?? ''))}
                disabled={!nonPoItemId}
              >
                <SelectTrigger><SelectValue placeholder={!nonPoItemId ? 'Select item first' : 'Any brand'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Any brand</SelectItem>
                  {(variants as any[]).map((v: any) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.brand}{v.code ? ` — ${v.code}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Qty */}
            <div className="space-y-1">
              <Label>Free QTY *</Label>
              <Input
                type="number" min={1}
                value={nonPoQty}
                onChange={(e) => setNonPoQty(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { resetNonPo(); setNonPoOpen(false) }}>Cancel</Button>
            <Button onClick={addNonPoFree} className="gap-1.5 bg-blue-600 hover:bg-blue-700">
              <Gift className="h-3.5 w-3.5" /> Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
