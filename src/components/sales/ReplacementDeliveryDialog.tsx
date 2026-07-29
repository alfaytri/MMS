'use client'

import { useEffect, useMemo, useState } from 'react'
import { Gift, Plus, Trash2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useWarehouseStockByItems } from '@/hooks/useWarehouseOperations'
import { type SaleReturn, useReturnLineProgress, type ReturnLineProgress } from '@/hooks/useSaleReturns'
import type { ReturnDispositionType, ReturnLineDisposition } from '@/hooks/useSaleDeliveries'
import { CascadeInventorySelector } from '@/components/purchase/CascadeInventorySelector'
import type { InventoryLookupResult } from '@/hooks/usePurchaseOrders'
import { formatCurrency } from '@/lib/utils/formatters'

export type GiftItem = {
  item_name: string
  sku: string | null
  qty: number
  brand_variant_id: string | null
  unit_price: number
}

export type ReplacementLineInput = {
  return_line_id:   string
  qty:              number
  brand_variant_id: string | null
  item_name:        string
  sku:              string | null
}

interface ReplacementDeliveryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  returnData: SaleReturn
  soId: string
  currency?: string | null
  onConfirm: (payload: {
    warehouseId:   string
    warehouseName: string
    lines:         ReplacementLineInput[]
    dispositions:  ReturnLineDisposition[]
    giftItems:     GiftItem[]
  }) => void
  isPending: boolean
}

function formatResolutions(mix: Record<string, number> | null): string {
  if (!mix) return '—'
  const labels: Record<string, string> = {
    replacement:        'replacement',
    refund:             'refund',
    store_credit:       'store credit',
    write_off:          'write-off',
    restock_as_damaged: 'restock (damaged)',
    send_for_repair:    'sent for repair',
  }
  const parts = Object.entries(mix)
    .filter(([, qty]) => qty > 0)
    .map(([type, qty]) => `${qty} ${labels[type] ?? type}`)
  return parts.length === 0 ? '—' : parts.join(' · ')
}

// Phase 7 — user-selectable "no disposition" sentinel (kept out of the RPC
// contract; local state only). Damaged lines start on 'write_off' when there
// are inventory remaining units, and default to 'none' otherwise.
type DispositionChoice = ReturnDispositionType | 'none'

const DISPOSITION_OPTIONS: Array<{
  value: DispositionChoice
  label: string
  disabled?: boolean
  hint?: string
}> = [
  { value: 'write_off',          label: 'Write off' },
  { value: 'restock_as_damaged', label: 'Restock as damaged', disabled: true, hint: 'Coming in Phase 8' },
  { value: 'send_for_repair',    label: 'Send for repair',    disabled: true, hint: 'Coming in Phase 9' },
]

export function ReplacementDeliveryDialog({
  open, onOpenChange, returnData, currency, onConfirm, isPending,
}: ReplacementDeliveryDialogProps) {
  const cur = currency ?? 'QAR'
  const [warehouseId, setWarehouseId] = useState('')
  const [qtyByLineId, setQtyByLineId] = useState<Record<string, number>>({})
  const [dispositionByLineId, setDispositionByLineId] = useState<Record<string, DispositionChoice>>({})
  const [dispositionQtyByLineId, setDispositionQtyByLineId] = useState<Record<string, number>>({})
  const [giftItems, setGiftItems] = useState<GiftItem[]>([])
  const [pickerValue, setPickerValue] = useState<InventoryLookupResult | null>(null)
  const [showPicker, setShowPicker] = useState(false)

  const { data: warehouses = [] } = useWarehouses()
  const { data: lineProgress = [], isLoading: progressLoading } = useReturnLineProgress(
    open ? returnData.id : null,
  )

  const rows: ReturnLineProgress[] = useMemo(() => {
    return lineProgress
      .slice()
      .sort((a, b) => {
        // Good first, damaged last, everything else in between — mirrors
        // the operator's usual flow (replace what you can, then decide
        // what to do with what you can't).
        const order = (c: string) => (c === 'good' ? 0 : c === 'damaged' ? 2 : 1)
        return order(a.condition) - order(b.condition) || a.item_name.localeCompare(b.item_name)
      })
  }, [lineProgress])

  // Pre-fill:
  //   - Good rows: default replace qty = customer_remaining_qty.
  //   - Damaged rows: default replace qty = 0 (operator opts in), plus
  //     default disposition = 'write_off' if any inventory remaining,
  //     otherwise 'none'; default disposition qty = inventory remaining.
  useEffect(() => {
    if (!open) return
    const nextReplace:     Record<string, number> = {}
    const nextDisposition: Record<string, DispositionChoice> = {}
    const nextDispQty:     Record<string, number> = {}
    for (const p of lineProgress) {
      const invRemaining = p.inventory_remaining_qty ?? 0
      if (p.condition === 'good' && p.customer_remaining_qty > 0) {
        nextReplace[p.return_line_id] = p.customer_remaining_qty
      } else {
        // Damaged rows: leave at 0 so the operator makes a deliberate
        // choice to send a replacement for a damaged unit (as opposed to
        // refund/store credit through the CN).
        nextReplace[p.return_line_id] = 0
      }
      if (p.condition === 'damaged') {
        nextDisposition[p.return_line_id] = invRemaining > 0 ? 'write_off' : 'none'
        nextDispQty[p.return_line_id]     = invRemaining
      } else {
        nextDisposition[p.return_line_id] = 'none'
        nextDispQty[p.return_line_id]     = 0
      }
    }
    setQtyByLineId(nextReplace)
    setDispositionByLineId(nextDisposition)
    setDispositionQtyByLineId(nextDispQty)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lineProgress.length])

  // Default the source warehouse to the return's restock warehouse so the
  // disposition-only case can be one click.
  useEffect(() => {
    if (!open) return
    if (returnData.restock_warehouse_id) {
      setWarehouseId(returnData.restock_warehouse_id)
    } else {
      setWarehouseId('')
    }
  }, [open, returnData.restock_warehouse_id])

  const hasDamagedRemaining = useMemo(
    () => rows.some((r) => r.condition === 'damaged' && (r.inventory_remaining_qty ?? 0) > 0),
    [rows],
  )

  const totalGoodRemaining = useMemo(
    () => rows.filter((r) => r.condition === 'good').reduce((s, r) => s + r.customer_remaining_qty, 0),
    [rows],
  )

  const totalReplacementQty = useMemo(
    () => Object.values(qtyByLineId).reduce((s, q) => s + (q || 0), 0),
    [qtyByLineId],
  )

  const dispositions = useMemo<ReturnLineDisposition[]>(() => {
    return rows
      .filter((r) => r.condition === 'damaged')
      .map((r) => {
        const choice = dispositionByLineId[r.return_line_id] ?? 'none'
        const qty    = dispositionQtyByLineId[r.return_line_id] ?? 0
        if (choice === 'none' || qty <= 0) return null
        return { return_line_id: r.return_line_id, type: choice, qty }
      })
      .filter((x): x is ReturnLineDisposition => x !== null)
  }, [rows, dispositionByLineId, dispositionQtyByLineId])

  const totalDispositionQty = useMemo(
    () => dispositions.reduce((s, d) => s + d.qty, 0),
    [dispositions],
  )

  const bvIds = useMemo(
    () => rows.map((r) => r.brand_variant_id).filter(Boolean) as string[],
    [rows],
  )
  const { data: whStockMap } = useWarehouseStockByItems(bvIds)

  const anyShort = useMemo(() => {
    if (!warehouseId) return false
    return rows.some((r) => {
      const qty = qtyByLineId[r.return_line_id] ?? 0
      if (qty <= 0) return false
      if (!r.brand_variant_id) return false
      const entries = whStockMap.get(r.brand_variant_id) ?? []
      const stock = entries.find((e) => e.warehouse_id === warehouseId)?.qty ?? 0
      return qty > stock
    })
  }, [rows, qtyByLineId, whStockMap, warehouseId])

  const selectedWarehouse = warehouses.find((w) => w.id === warehouseId)

  const goodwillCost = giftItems.reduce((sum, g) => sum + g.unit_price * g.qty, 0)

  const canSubmit = (totalReplacementQty > 0 || totalDispositionQty > 0) && !anyShort
  const needsWarehouse = totalReplacementQty > 0 || totalDispositionQty > 0

  const sendLabel = useMemo(() => {
    if (totalReplacementQty === 0 && totalDispositionQty > 0) {
      return `Book ${totalDispositionQty} disposition${totalDispositionQty === 1 ? '' : 's'}`
    }
    if (totalReplacementQty === 0) return 'Send Replacement'
    if (totalReplacementQty < totalGoodRemaining) {
      return `Send partial replacement (${totalReplacementQty} unit${totalReplacementQty === 1 ? '' : 's'})`
    }
    return `Send Replacement (${totalReplacementQty} unit${totalReplacementQty === 1 ? '' : 's'})`
  }, [totalReplacementQty, totalGoodRemaining, totalDispositionQty])

  function setLineQty(returnLineId: string, raw: number, max: number) {
    const clamped = Math.max(0, Math.min(max, Number.isFinite(raw) ? Math.floor(raw) : 0))
    setQtyByLineId((prev) => ({ ...prev, [returnLineId]: clamped }))
  }

  function setDispositionChoice(returnLineId: string, choice: DispositionChoice, invRemaining: number) {
    setDispositionByLineId((prev) => ({ ...prev, [returnLineId]: choice }))
    // Reset the qty to invRemaining when switching AWAY from 'none', or to 0
    // when switching TO 'none'.
    setDispositionQtyByLineId((prev) => ({
      ...prev,
      [returnLineId]: choice === 'none' ? 0 : invRemaining,
    }))
  }

  function setDispositionQty(returnLineId: string, raw: number, max: number) {
    const clamped = Math.max(0, Math.min(max, Number.isFinite(raw) ? Math.floor(raw) : 0))
    setDispositionQtyByLineId((prev) => ({ ...prev, [returnLineId]: clamped }))
  }

  function handlePickerChange(item: InventoryLookupResult | null) {
    setPickerValue(item)
    if (item) {
      setGiftItems((prev) => [
        ...prev,
        {
          item_name:        item.item_name,
          sku:              item.sku,
          qty:              1,
          brand_variant_id: item.brand_variant_id,
          unit_price:       item.selling_price,
        },
      ])
      setPickerValue(null)
      setShowPicker(false)
    }
  }

  function updateGiftQty(index: number, qty: number) {
    setGiftItems((prev) =>
      prev.map((g, i) => (i === index ? { ...g, qty: Math.max(1, qty) } : g))
    )
  }

  function removeGiftItem(index: number) {
    setGiftItems((prev) => prev.filter((_, i) => i !== index))
  }

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      setWarehouseId('')
      setGiftItems([])
      setPickerValue(null)
      setShowPicker(false)
      setQtyByLineId({})
      setDispositionByLineId({})
      setDispositionQtyByLineId({})
    }
    onOpenChange(nextOpen)
  }

  function handleSubmit() {
    const lines: ReplacementLineInput[] = rows
      .filter((r) => (qtyByLineId[r.return_line_id] ?? 0) > 0)
      .map((r) => ({
        return_line_id:   r.return_line_id,
        qty:              qtyByLineId[r.return_line_id] ?? 0,
        brand_variant_id: r.brand_variant_id,
        item_name:        r.item_name,
        sku:              r.sku,
      }))
    onConfirm({
      warehouseId,
      warehouseName: selectedWarehouse?.name ?? '',
      lines,
      dispositions,
      giftItems,
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-full h-full rounded-none max-w-none flex flex-col md:h-auto md:max-h-[90vh] md:w-full md:max-w-4xl md:rounded-lg">
        <DialogHeader>
          <DialogTitle>Send Replacement — {returnData.return_number}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-6 px-1">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Good lines can be replaced from stock. Damaged lines take a
              disposition decision — write off is the only supported action
              in Phase 7 (restock as damaged and send for repair land in
              Phase 8/9). You can save a partial resolution and finish the
              rest later.
            </p>

            <div className="min-h-[8rem]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="w-16 text-center">Returned</TableHead>
                    <TableHead className="w-40">Already resolved</TableHead>
                    <TableHead className="w-20 text-center">Remaining</TableHead>
                    <TableHead className="w-64 text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {progressLoading && rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-4">
                        Loading return progress…
                      </TableCell>
                    </TableRow>
                  )}
                  {!progressLoading && rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-4">
                        No return lines.
                      </TableCell>
                    </TableRow>
                  )}
                  {rows.map((r) => {
                    const entries      = r.brand_variant_id ? (whStockMap.get(r.brand_variant_id) ?? []) : []
                    const selectedStock = entries.find((e) => e.warehouse_id === warehouseId)?.qty ?? 0
                    const currentQty    = qtyByLineId[r.return_line_id] ?? 0
                    const isDamaged     = r.condition === 'damaged'
                    const custRemaining = r.customer_remaining_qty
                    const invRemaining  = r.inventory_remaining_qty ?? 0
                    const shownRemaining = isDamaged ? invRemaining : custRemaining
                    const shownResolved  = isDamaged ? r.inventory_dispositions_by_type : r.customer_resolutions_by_type
                    const shortInSelected = !!warehouseId && !isDamaged && currentQty > 0 && currentQty > selectedStock

                    const currentDisposition = dispositionByLineId[r.return_line_id] ?? 'none'
                    const currentDispQty     = dispositionQtyByLineId[r.return_line_id] ?? 0
                    // Damaged rows show BOTH dimensions when they differ, so
                    // the operator can see at a glance whether a written-off
                    // damaged unit still owes the customer a resolution.
                    const showBothDimensions = isDamaged && (custRemaining !== invRemaining)

                    return (
                      <TableRow key={r.return_line_id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="min-w-0">
                              <div className="text-sm truncate">{r.item_name}</div>
                              {r.sku && (
                                <div className="text-xs text-muted-foreground">{r.sku}</div>
                              )}
                            </div>
                            {isDamaged && (
                              <Badge variant="destructive" className="shrink-0 text-[10px]">
                                Damaged
                              </Badge>
                            )}
                          </div>
                          {r.brand_variant_id && (
                            entries.length > 0 ? (
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                                {entries.map((w) => {
                                  const whName = warehouses.find((wh) => wh.id === w.warehouse_id)?.name ?? '?'
                                  const isSelected = w.warehouse_id === warehouseId
                                  return (
                                    <span
                                      key={w.warehouse_id}
                                      className={`text-[10px] ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}
                                    >
                                      {whName}: <span className={`font-medium ${isSelected ? 'text-primary' : 'text-foreground'}`}>{w.qty}</span>
                                    </span>
                                  )
                                })}
                              </div>
                            ) : (
                              <div className="text-[10px] text-amber-600 mt-1">No stock in any warehouse</div>
                            )
                          )}
                          {shortInSelected && (
                            <div className="text-[11px] text-destructive mt-1">
                              Selected warehouse has only {selectedStock} — {currentQty - selectedStock} short
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-sm">{r.returned_qty}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {isDamaged ? (
                            <div className="space-y-0.5">
                              <div>
                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Customer</span>{' '}
                                {formatResolutions(r.customer_resolutions_by_type)}
                              </div>
                              <div>
                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Inventory</span>{' '}
                                {formatResolutions(r.inventory_dispositions_by_type)}
                              </div>
                            </div>
                          ) : (
                            formatResolutions(shownResolved)
                          )}
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          {showBothDimensions ? (
                            <div className="space-y-0.5 text-[11px]">
                              <div className={custRemaining > 0 ? 'text-amber-700 font-medium' : ''}>
                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Cust</span> {custRemaining}
                              </div>
                              <div className={invRemaining > 0 ? 'text-amber-700 font-medium' : ''}>
                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Inv</span> {invRemaining}
                              </div>
                            </div>
                          ) : (
                            shownRemaining
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {isDamaged ? (
                            <div className="space-y-1.5">
                              {custRemaining > 0 && (
                                <div className="flex items-center justify-center gap-1.5">
                                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 w-14 text-right">Replace</span>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={custRemaining}
                                    value={currentQty}
                                    onChange={(e) => setLineQty(r.return_line_id, Number(e.target.value), custRemaining)}
                                    className="h-8 w-16 text-center"
                                  />
                                </div>
                              )}
                              <div className="flex items-center justify-center gap-1.5">
                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 w-14 text-right">Dispose</span>
                                <Select
                                  value={currentDisposition}
                                  onValueChange={(v) => setDispositionChoice(r.return_line_id, v as DispositionChoice, invRemaining)}
                                  disabled={invRemaining <= 0}
                                >
                                  <SelectTrigger className="h-8 w-36 min-h-8 text-xs">
                                    <SelectValue placeholder="Disposition" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">None (leave)</SelectItem>
                                    {DISPOSITION_OPTIONS.map((opt) => (
                                      <SelectItem
                                        key={opt.value}
                                        value={opt.value}
                                        disabled={opt.disabled}
                                      >
                                        <span className="flex items-center gap-1.5">
                                          {opt.label}
                                          {opt.hint && (
                                            <span className="text-[10px] text-muted-foreground">— {opt.hint}</span>
                                          )}
                                        </span>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Input
                                  type="number"
                                  min={0}
                                  max={invRemaining}
                                  value={currentDispQty}
                                  disabled={currentDisposition === 'none' || invRemaining <= 0}
                                  onChange={(e) => setDispositionQty(r.return_line_id, Number(e.target.value), invRemaining)}
                                  className="h-8 w-14 text-center"
                                />
                              </div>
                            </div>
                          ) : (
                            <Input
                              type="number"
                              min={0}
                              max={custRemaining}
                              value={currentQty}
                              disabled={custRemaining <= 0}
                              onChange={(e) => setLineQty(r.return_line_id, Number(e.target.value), custRemaining)}
                              className="h-8 w-20 mx-auto text-center"
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {hasDamagedRemaining && totalDispositionQty === 0 && (
              <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
                Damaged units still remaining — pick a disposition on each damaged row to book them out of stock, or leave them for later.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Gift className="h-4 w-4 text-blue-600" />
                Gift Items (Goodwill)
              </label>
              {!showPicker && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setShowPicker(true)}
                >
                  <Plus className="h-3.5 w-3.5" /> Add Gift
                </Button>
              )}
            </div>

            {showPicker && (
              <div className="rounded-md border p-2 bg-muted/30">
                <CascadeInventorySelector
                  lineType="products"
                  value={pickerValue}
                  onChange={handlePickerChange}
                />
              </div>
            )}

            {giftItems.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="w-24 text-center">Qty</TableHead>
                    <TableHead className="w-28 text-right">Unit Price</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {giftItems.map((gift, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="min-w-0">
                            <div className="text-sm truncate">{gift.item_name}</div>
                            {gift.sku && (
                              <div className="text-xs text-muted-foreground">{gift.sku}</div>
                            )}
                          </div>
                          <Badge variant="secondary" className="shrink-0 gap-1 text-blue-700 bg-blue-500/10">
                            <Gift className="h-3 w-3" /> Gift
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Input
                          type="number"
                          min={1}
                          value={gift.qty}
                          onChange={(e) => updateGiftQty(i, Number(e.target.value) || 1)}
                          className="h-8 w-16 mx-auto text-center"
                        />
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {formatCurrency(gift.unit_price, cur)}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => removeGiftItem(i)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {giftItems.length > 0 && (
              <p className="text-sm text-muted-foreground text-right">
                Goodwill cost: <span className="font-medium text-foreground">{formatCurrency(goodwillCost, cur)}</span>
              </p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium">Source Warehouse{needsWarehouse ? ' *' : ''}</label>
            <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? '')}>
              <SelectTrigger className="mt-1 w-full">
                <SelectValue placeholder="Select warehouse" />
              </SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto">
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="flex-col items-stretch sm:flex-col sm:items-stretch gap-2">
          {anyShort && (
            <p className="text-[11px] text-destructive text-left">
              One or more items don&apos;t have enough stock in the selected warehouse. Pick a different warehouse or reduce the qty.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => handleClose(false)}>Cancel</Button>
            <Button
              disabled={!canSubmit || (needsWarehouse && !warehouseId) || isPending}
              onClick={handleSubmit}
            >
              {isPending ? 'Sending...' : sendLabel}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
