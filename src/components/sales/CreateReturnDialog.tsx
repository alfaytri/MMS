'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useCreateSaleReturn, useDeliveryBreakdownBySO, type ReturnLineCondition, type SaleReturn } from '@/hooks/useSaleReturns'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useReturnReasons, useAddReturnReason } from '@/hooks/useReturnReasons'
import type { SaleOrder } from '@/hooks/useSaleOrders'

type Mode = 'direct' | 'inspection'

type LineDraft = {
  brand_variant_id: string | null
  item_name: string
  sku: string | null
  ordered_qty: number         // line.qty from the SO
  delivered_qty: number       // line.delivered_qty from the SO
  good_qty: number            // Direct mode
  damaged_qty: number         // Direct mode
  inspection_qty: number      // Inspection mode
  condition_notes: string     // Damaged notes (Direct mode) or Inspection notes
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  so: SaleOrder
  fullSO: SaleOrder | null
  // Existing returns on this SO — used to compute per-variant already-returned
  // qty so the dialog can subtract from delivered and cap the qty inputs.
  existingReturns: SaleReturn[]
}

export function CreateReturnDialog({ open, onOpenChange, so, fullSO, existingReturns }: Props) {
  const [mode, setMode] = useState<Mode>('direct')
  const [returnDate, setReturnDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [returnReason, setReturnReason] = useState('')
  const [customReason, setCustomReason] = useState('')
  const [returnNotes, setReturnNotes] = useState('')
  const [restockWarehouseId, setRestockWarehouseId] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([])
  // fullSO is fetched async by the parent (useSaleOrder). When the dialog
  // opens it may still be undefined, so the useState initializer above
  // gives us []. Seed lines once fullSO.sale_order_lines actually arrives
  // — guarded by a ref so subsequent fullSO changes (e.g. cache refresh)
  // don't clobber user edits.
  const seededRef = useRef(false)
  useEffect(() => {
    if (seededRef.current) return
    const soLines = fullSO?.sale_order_lines ?? []
    if (soLines.length === 0) return
    setLines(soLines.map((li) => ({
      brand_variant_id: li.brand_variant_id ?? null,
      item_name: li.item_name,
      sku: li.sku ?? null,
      ordered_qty: li.qty,
      delivered_qty: li.delivered_qty ?? 0,
      good_qty: 0,
      damaged_qty: 0,
      inspection_qty: 0,
      condition_notes: '',
    })))
    seededRef.current = true
  }, [fullSO])

  const createReturn = useCreateSaleReturn()
  const addReason = useAddReturnReason()
  const { data: warehouses = [] } = useWarehouses()
  const { data: reasons = [] } = useReturnReasons('sale_return')
  const { data: breakdown = [] } = useDeliveryBreakdownBySO(so.id)

  // Per-variant delivered-warehouse breakdown for display.
  const breakdownByVariant = useMemo(() => {
    const map = new Map<string, { warehouse_id: string; warehouse_name: string; qty_delivered: number }[]>()
    for (const row of breakdown) {
      const arr = map.get(row.brand_variant_id) ?? []
      arr.push({
        warehouse_id: row.warehouse_id,
        warehouse_name: row.warehouse_name,
        qty_delivered: row.qty_delivered,
      })
      map.set(row.brand_variant_id, arr)
    }
    return map
  }, [breakdown])

  // Per-variant already-returned qty, summed across every non-cancelled
  // return on this SO. Inspection-mode qty counts too — those units are
  // already earmarked, returning them again would overshoot the delivery.
  const returnedByVariant = useMemo(() => {
    const map = new Map<string, number>()
    for (const ret of existingReturns) {
      if (ret.status === 'cancelled') continue
      for (const line of ret.return_lines ?? []) {
        if (!line.brand_variant_id) continue
        map.set(line.brand_variant_id, (map.get(line.brand_variant_id) ?? 0) + line.qty)
      }
    }
    return map
  }, [existingReturns])

  const resetAndClose = () => {
    setMode('direct')
    setReturnReason('')
    setCustomReason('')
    setReturnNotes('')
    setRestockWarehouseId('')
    onOpenChange(false)
  }

  const perLineReturnQty = (l: LineDraft) =>
    mode === 'direct' ? l.good_qty + l.damaged_qty : l.inspection_qty

  const nonZeroLineCount = lines.filter((l) => perLineReturnQty(l) > 0).length
  const anyOverDelivered = lines.some((l) => {
    const bvRows = l.brand_variant_id ? (breakdownByVariant.get(l.brand_variant_id) ?? []) : []
    const totalDelivered = bvRows.reduce((s, r) => s + r.qty_delivered, 0) || l.delivered_qty
    const alreadyReturned = l.brand_variant_id ? (returnedByVariant.get(l.brand_variant_id) ?? 0) : 0
    const available = Math.max(0, totalDelivered - alreadyReturned)
    return perLineReturnQty(l) > available
  })
  const reasonOK = returnReason === '__custom__' ? !!customReason.trim() : !!returnReason.trim()
  const warehouseOK = mode === 'inspection' ? true : !!restockWarehouseId
  const canSubmit =
    reasonOK && warehouseOK && nonZeroLineCount > 0 && !anyOverDelivered
    && !createReturn.isPending && !addReason.isPending

  async function handleSubmit() {
    let finalReason = returnReason
    if (returnReason === '__custom__') {
      finalReason = customReason.trim()
      if (!finalReason) return
      addReason.mutate({ label: finalReason, category: 'sale_return' })
    }

    const items: {
      item_name: string
      sku: string | null
      qty: number
      condition: ReturnLineCondition
      brand_variant_id: string | null
      condition_notes?: string | null
    }[] = []
    for (const l of lines) {
      if (mode === 'direct') {
        if (l.good_qty > 0) {
          items.push({
            item_name: l.item_name,
            sku: l.sku,
            qty: l.good_qty,
            condition: 'good',
            brand_variant_id: l.brand_variant_id,
            condition_notes: null,
          })
        }
        if (l.damaged_qty > 0) {
          items.push({
            item_name: l.item_name,
            sku: l.sku,
            qty: l.damaged_qty,
            condition: 'damaged',
            brand_variant_id: l.brand_variant_id,
            condition_notes: l.condition_notes.trim() || null,
          })
        }
      } else {
        if (l.inspection_qty > 0) {
          items.push({
            item_name: l.item_name,
            sku: l.sku,
            qty: l.inspection_qty,
            condition: 'inspection',
            brand_variant_id: l.brand_variant_id,
            condition_notes: l.condition_notes.trim() || null,
          })
        }
      }
    }

    createReturn.mutate(
      {
        source_id: so.id,
        date: returnDate,
        reason: finalReason,
        items,
        // Inspection returns don't pick a warehouse at creation — it's
        // set during rpc_complete_return_inspection triage.
        restock_warehouse_id: mode === 'direct' ? restockWarehouseId : null,
        notes: returnNotes || null,
      },
      {
        onSuccess: () => {
          toast.success(mode === 'inspection'
            ? 'Return created — awaiting inspection'
            : 'Return created')
          resetAndClose()
        },
        onError: (err) => toast.error((err as Error).message),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetAndClose() }}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Create Return — {so.so_number}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* Mode toggle */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Return Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('direct')}
                className={`flex flex-col gap-0.5 items-start rounded-md border px-3 py-2 text-left transition-colors ${
                  mode === 'direct'
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-input hover:bg-muted/50'
                }`}
              >
                <span className="text-sm font-medium">Direct return</span>
                <span className="text-[11px] text-muted-foreground">
                  You already know good vs damaged. Restock immediately after receiving.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setMode('inspection')}
                className={`flex flex-col gap-0.5 items-start rounded-md border px-3 py-2 text-left transition-colors ${
                  mode === 'inspection'
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-input hover:bg-muted/50'
                }`}
              >
                <span className="text-sm font-medium">Inspection return</span>
                <span className="text-[11px] text-muted-foreground">
                  Items need physical check. Condition split happens after inspection.
                </span>
              </button>
            </div>
          </div>

          {/* Header form */}
          <div className={`grid gap-3 ${mode === 'direct' ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Return Date</label>
              <input
                type="date"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
              />
            </div>
            {mode === 'direct' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Restock Warehouse <span className="text-destructive">*</span>
                </label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={restockWarehouseId}
                  onChange={(e) => setRestockWarehouseId(e.target.value)}
                >
                  <option value="">Select warehouse…</option>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Reason <span className="text-destructive">*</span></label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={returnReason}
              onChange={(e) => { setReturnReason(e.target.value); if (e.target.value !== '__custom__') setCustomReason('') }}
            >
              <option value="">Select reason…</option>
              {reasons.map((r) => <option key={r.id} value={r.label}>{r.label}</option>)}
              <option value="__custom__">Other (custom reason)…</option>
            </select>
            {returnReason === '__custom__' && (
              <input
                type="text"
                placeholder="Enter custom reason…"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring mt-1.5"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                autoFocus
              />
            )}
          </div>

          {/* Items table */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Items</label>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Item / Delivered from</TableHead>
                    {mode === 'direct' ? (
                      <>
                        <TableHead className="text-xs text-right w-24">Good qty</TableHead>
                        <TableHead className="text-xs text-right w-24">Damaged qty</TableHead>
                        <TableHead className="text-xs w-40">Damage notes</TableHead>
                      </>
                    ) : (
                      <>
                        <TableHead className="text-xs text-right w-24">Qty to inspect</TableHead>
                        <TableHead className="text-xs w-48">Reason / notes</TableHead>
                      </>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={mode === 'direct' ? 4 : 3} className="text-center text-xs text-muted-foreground py-6">
                        Loading order items…
                      </TableCell>
                    </TableRow>
                  )}
                  {lines.map((line, i) => {
                    const rows = line.brand_variant_id ? (breakdownByVariant.get(line.brand_variant_id) ?? []) : []
                    const totalDelivered = rows.reduce((s, r) => s + r.qty_delivered, 0) || line.delivered_qty
                    const alreadyReturned = line.brand_variant_id ? (returnedByVariant.get(line.brand_variant_id) ?? 0) : 0
                    const available = Math.max(0, totalDelivered - alreadyReturned)
                    const totalReturning = perLineReturnQty(line)
                    const overCapacity = totalReturning > available
                    const fullyReturned = available === 0
                    return (
                      <TableRow key={i}>
                        <TableCell className="text-xs align-top">
                          <div className="font-medium">{line.item_name}</div>
                          <div className="mt-1 text-[10px] text-muted-foreground">
                            Ordered {line.ordered_qty} · Delivered {totalDelivered}
                            {alreadyReturned > 0 && (
                              <> · Returned {alreadyReturned} · <span className={fullyReturned ? 'text-muted-foreground' : 'text-emerald-700 font-medium'}>Available {available}</span></>
                            )}
                          </div>
                          {rows.length > 0 && (
                            <div className="mt-0.5 space-x-1">
                              {rows.map((r) => (
                                <span
                                  key={r.warehouse_id}
                                  className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                                >
                                  {r.warehouse_name}: {r.qty_delivered}
                                </span>
                              ))}
                            </div>
                          )}
                          {overCapacity && (
                            <div className="mt-1 text-[11px] text-destructive">
                              Return qty ({totalReturning}) exceeds available ({available})
                            </div>
                          )}
                          {fullyReturned && (
                            <div className="mt-1 text-[11px] text-muted-foreground italic">
                              All delivered units already returned.
                            </div>
                          )}
                        </TableCell>

                        {mode === 'direct' ? (
                          <>
                            <TableCell className="text-right align-top">
                              <input
                                type="number" min={0} max={available} disabled={fullyReturned}
                                className="w-20 h-7 text-xs text-right rounded border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                                value={line.good_qty}
                                onChange={(e) => setLines((prev) => prev.map((l, j) =>
                                  j === i ? { ...l, good_qty: Math.max(0, Number(e.target.value) || 0) } : l))}
                              />
                            </TableCell>
                            <TableCell className="text-right align-top">
                              <input
                                type="number" min={0} max={available} disabled={fullyReturned}
                                className="w-20 h-7 text-xs text-right rounded border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                                value={line.damaged_qty}
                                onChange={(e) => setLines((prev) => prev.map((l, j) =>
                                  j === i ? { ...l, damaged_qty: Math.max(0, Number(e.target.value) || 0) } : l))}
                              />
                            </TableCell>
                            <TableCell className="align-top">
                              <input
                                type="text"
                                placeholder={line.damaged_qty > 0 ? 'e.g. dented' : ''}
                                disabled={line.damaged_qty === 0 || fullyReturned}
                                className="w-full h-7 text-xs rounded border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                                value={line.condition_notes}
                                onChange={(e) => setLines((prev) => prev.map((l, j) =>
                                  j === i ? { ...l, condition_notes: e.target.value } : l))}
                              />
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="text-right align-top">
                              <input
                                type="number" min={0} max={available} disabled={fullyReturned}
                                className="w-20 h-7 text-xs text-right rounded border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                                value={line.inspection_qty}
                                onChange={(e) => setLines((prev) => prev.map((l, j) =>
                                  j === i ? { ...l, inspection_qty: Math.max(0, Number(e.target.value) || 0) } : l))}
                              />
                            </TableCell>
                            <TableCell className="align-top">
                              <input
                                type="text"
                                placeholder="e.g. customer reports intermittent fault"
                                disabled={line.inspection_qty === 0 || fullyReturned}
                                className="w-full h-7 text-xs rounded border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                                value={line.condition_notes}
                                onChange={(e) => setLines((prev) => prev.map((l, j) =>
                                  j === i ? { ...l, condition_notes: e.target.value } : l))}
                              />
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            {mode === 'inspection' && (
              <p className="text-[11px] text-muted-foreground">
                Restock warehouse is picked when the physical inspection is completed.
              </p>
            )}
            {anyOverDelivered && (
              <p className="text-[11px] text-destructive">
                One or more lines request more units than are available (delivered − already returned) — fix before submitting.
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notes</label>
            <textarea
              rows={2}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Optional notes…"
              value={returnNotes}
              onChange={(e) => setReturnNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={resetAndClose}>Cancel</Button>
          <Button size="sm" disabled={!canSubmit} onClick={handleSubmit}>
            {(createReturn.isPending || addReason.isPending)
              ? 'Creating…'
              : mode === 'inspection' ? 'Create Inspection Return' : 'Create Return'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
