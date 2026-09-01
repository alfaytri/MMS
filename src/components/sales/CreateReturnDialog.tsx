'use client'

import { humanizeDbError } from '@/lib/dbErrors'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  GuardedDialog,
  type GuardedFormDialogHandle,
} from '@/components/shared/GuardedFormDialog'
import { useCreateSaleReturn, useSaleDeliveryLinesForSo, type ReturnLineCondition, type SaleReturn, type DeliveryLineForReturn } from '@/hooks/useSaleReturns'
import { useReturnReasons, useAddReturnReason } from '@/hooks/useReturnReasons'
import type { SaleOrder } from '@/hooks/useSaleOrders'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'

type Mode = 'direct' | 'inspection'

type LineDraft = DeliveryLineForReturn & {
  good_qty:        number
  damaged_qty:     number
  inspection_qty:  number
  condition_notes: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  so: SaleOrder
  fullSO: SaleOrder | null
  existingReturns: SaleReturn[]
}

export function CreateReturnDialog({ open, onOpenChange, so, fullSO: _fullSO, existingReturns: _existingReturns }: Props) {
  void _fullSO
  void _existingReturns
  const [mode, setMode] = useState<Mode>('direct')
  const [returnDate, setReturnDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [returnReason, setReturnReason] = useState('')
  const [customReason, setCustomReason] = useState('')
  const [returnNotes, setReturnNotes] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([])
  const guardRef = useRef<GuardedFormDialogHandle>(null)

  const createReturn = useCreateSaleReturn()
  const addReason = useAddReturnReason()
  const { data: reasons = [] } = useReturnReasons('sale_return')
  const { data: candidates } = useSaleDeliveryLinesForSo(open ? so.id : null)

  const availableCandidates = useMemo(
    () => (candidates ?? []).filter((c) => c.returnable_qty > 0),
    [candidates]
  )

  useEffect(() => {
    if (!open) return
    setLines((prev) => {
      const nextIds = availableCandidates.map((c) => c.sale_delivery_line_id)
      const sameShape =
        prev.length === nextIds.length &&
        prev.every((row, i) => row.sale_delivery_line_id === nextIds[i])
      if (sameShape) return prev
      const prevByKey = new Map(prev.map((r) => [r.sale_delivery_line_id, r]))
      return availableCandidates.map((c) => {
        const existing = prevByKey.get(c.sale_delivery_line_id)
        return {
          ...c,
          good_qty:        existing?.good_qty ?? 0,
          damaged_qty:     existing?.damaged_qty ?? 0,
          inspection_qty:  existing?.inspection_qty ?? 0,
          condition_notes: existing?.condition_notes ?? '',
        }
      })
    })
  }, [open, availableCandidates])

  // Reset dialog state on close. Wrapper decides when close actually fires
  // (with prompt if dirty); this runs afterwards to clean up for the next open.
  const handleOpenChange = (o: boolean) => {
    if (!o) {
      setMode('direct')
      setReturnReason('')
      setCustomReason('')
      setReturnNotes('')
    }
    onOpenChange(o)
  }

  const perLineReturnQty = (l: LineDraft) =>
    mode === 'direct' ? l.good_qty + l.damaged_qty : l.inspection_qty

  const nonZeroLineCount = lines.filter((l) => perLineReturnQty(l) > 0).length
  const anyOverDelivered = lines.some((l) => perLineReturnQty(l) > l.returnable_qty)
  const reasonOK = returnReason === '__custom__' ? !!customReason.trim() : !!returnReason.trim()
  const canSubmit =
    reasonOK && nonZeroLineCount > 0 && !anyOverDelivered
    && !createReturn.isPending && !addReason.isPending

  const isDirty =
    mode !== 'direct' ||
    returnReason !== '' ||
    customReason.trim() !== '' ||
    returnNotes.trim() !== '' ||
    lines.some((l) => l.good_qty > 0 || l.damaged_qty > 0 || l.inspection_qty > 0 || l.condition_notes.trim() !== '')

  async function handleSubmit() {
    let finalReason = returnReason
    if (returnReason === '__custom__') {
      finalReason = customReason.trim()
      if (!finalReason) return
      addReason.mutate({ label: finalReason, category: 'sale_return' })
    }

    const items: {
      sale_delivery_line_id: string | null
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
            sale_delivery_line_id: l.sale_delivery_line_id,
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
            sale_delivery_line_id: l.sale_delivery_line_id,
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
            sale_delivery_line_id: l.sale_delivery_line_id,
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
        restock_warehouse_id: null,
        notes: returnNotes || null,
      },
      {
        onSuccess: () => {
          toast.success(mode === 'inspection'
            ? 'Return created — awaiting inspection'
            : 'Return created')
          guardRef.current?.closeAfterSubmit()
        },
        onError: (err) => toast.error(humanizeDbError(err)),
      },
    )
  }

  return (
    <GuardedDialog open={open} onOpenChange={handleOpenChange} isDirty={isDirty} ref={guardRef}>
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
          <div className="grid gap-3 grid-cols-1">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Return Date</label>
              <input
                type="date"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
              />
            </div>
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

          {/* Items table — one row per delivery_line source */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Items — one row per delivery source</label>
              <span className="text-[10px] text-muted-foreground">Restock returns to the same sub-container</span>
            </div>

            {mode === 'direct' && lines.some((l) => l.damaged_qty > 0) && (
              <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-2">
                <span className="shrink-0" aria-hidden="true">⚠️</span>
                <span>
                  <span className="font-semibold">Damaged units cannot be recovered.</span> Once this return is restocked,
                  damaged units must be written off — the app does not yet have a repair / refurb flow. If you&apos;re unsure,
                  switch to <span className="font-semibold">Inspection return</span> above so a physical check can decide condition.
                </span>
              </div>
            )}

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Item / Source</TableHead>
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
                        {candidates === undefined
                          ? 'Loading delivered items…'
                          : 'Nothing left to return — every delivery for this SO is fully returned.'}
                      </TableCell>
                    </TableRow>
                  )}
                  {lines.map((line, i) => {
                    const totalReturning = perLineReturnQty(line)
                    const overCapacity = totalReturning > line.returnable_qty
                    return (
                      <TableRow key={line.sale_delivery_line_id} className={STAGGER_IN} style={staggerDelay(i)}>
                        <TableCell className="text-xs align-top">
                          <div className="font-medium">{line.item_name}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-mono">
                              {line.delivery_number}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                              {line.warehouse_name}
                            </Badge>
                            {line.sub_container_name && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                                {line.sub_container_name}
                              </Badge>
                            )}
                            {line.sku && (
                              <span className="text-[10px] text-muted-foreground">SKU {line.sku}</span>
                            )}
                          </div>
                          <div className="mt-1 text-[10px] text-muted-foreground">
                            Delivered {line.delivered_at.split('T')[0]} · Qty {line.delivered_qty}
                            {line.already_returned_qty > 0 && (
                              <> · Returned {line.already_returned_qty}</>
                            )}
                            {' · '}
                            <span className={line.returnable_qty === 0 ? 'text-muted-foreground' : 'text-emerald-700 font-medium'}>
                              Available {line.returnable_qty}
                            </span>
                          </div>
                          {overCapacity && (
                            <div className="mt-1 text-[11px] text-destructive">
                              Return qty ({totalReturning}) exceeds available ({line.returnable_qty})
                            </div>
                          )}
                        </TableCell>

                        {mode === 'direct' ? (
                          <>
                            <TableCell className="text-right align-top">
                              <input
                                type="number" min={0} max={line.returnable_qty}
                                className="w-20 h-7 text-xs text-right rounded border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                                value={line.good_qty}
                                onChange={(e) => setLines((prev) => prev.map((l, j) =>
                                  j === i ? { ...l, good_qty: Math.max(0, Number(e.target.value) || 0) } : l))}
                              />
                            </TableCell>
                            <TableCell className="text-right align-top">
                              <input
                                type="number" min={0} max={line.returnable_qty}
                                className="w-20 h-7 text-xs text-right rounded border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                                value={line.damaged_qty}
                                onChange={(e) => setLines((prev) => prev.map((l, j) =>
                                  j === i ? { ...l, damaged_qty: Math.max(0, Number(e.target.value) || 0) } : l))}
                              />
                            </TableCell>
                            <TableCell className="align-top">
                              <input
                                type="text"
                                placeholder={line.damaged_qty > 0 ? 'e.g. dented' : ''}
                                disabled={line.damaged_qty === 0}
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
                                type="number" min={0} max={line.returnable_qty}
                                className="w-20 h-7 text-xs text-right rounded border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                                value={line.inspection_qty}
                                onChange={(e) => setLines((prev) => prev.map((l, j) =>
                                  j === i ? { ...l, inspection_qty: Math.max(0, Number(e.target.value) || 0) } : l))}
                              />
                            </TableCell>
                            <TableCell className="align-top">
                              <input
                                type="text"
                                placeholder="e.g. customer reports intermittent fault"
                                disabled={line.inspection_qty === 0}
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
                Restock destination is derived from each delivery&apos;s original sub-container after inspection completes.
              </p>
            )}
            {anyOverDelivered && (
              <p className="text-[11px] text-destructive">
                One or more lines request more units than are available — fix before submitting.
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
          <Button variant="outline" size="sm" onClick={() => guardRef.current?.requestClose()}>Cancel</Button>
          <Button size="sm" disabled={!canSubmit} onClick={handleSubmit}>
            {(createReturn.isPending || addReason.isPending)
              ? 'Creating…'
              : mode === 'inspection' ? 'Create Inspection Return' : 'Create Return'}
          </Button>
        </div>
      </DialogContent>
    </GuardedDialog>
  )
}
