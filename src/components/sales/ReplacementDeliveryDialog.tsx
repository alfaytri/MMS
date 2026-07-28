'use client'

import { useEffect, useMemo, useState } from 'react'
import { Gift, Plus, Trash2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useWarehouseStockByItems } from '@/hooks/useWarehouseOperations'
import { type SaleReturn, useReturnLineProgress, type ReturnLineProgress } from '@/hooks/useSaleReturns'
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
    warehouseId:       string
    warehouseName:     string
    lines:             ReplacementLineInput[]
    writeOffDamaged:   boolean
    giftItems:         GiftItem[]
  }) => void
  isPending: boolean
}

function formatResolutions(mix: Record<string, number> | null): string {
  if (!mix) return '—'
  const labels: Record<string, string> = {
    replacement:  'replacement',
    refund:       'refund',
    store_credit: 'store credit',
    write_off:    'write-off',
  }
  const parts = Object.entries(mix)
    .filter(([, qty]) => qty > 0)
    .map(([type, qty]) => `${qty} ${labels[type] ?? type}`)
  return parts.length === 0 ? '—' : parts.join(' · ')
}

export function ReplacementDeliveryDialog({
  open, onOpenChange, returnData, currency, onConfirm, isPending,
}: ReplacementDeliveryDialogProps) {
  const cur = currency ?? 'QAR'
  const [warehouseId, setWarehouseId] = useState('')
  const [qtyByLineId, setQtyByLineId] = useState<Record<string, number>>({})
  const [writeOffDamaged, setWriteOffDamaged] = useState(true)
  const [giftItems, setGiftItems] = useState<GiftItem[]>([])
  const [pickerValue, setPickerValue] = useState<InventoryLookupResult | null>(null)
  const [showPicker, setShowPicker] = useState(false)

  const { data: warehouses = [] } = useWarehouses()
  const { data: lineProgress = [], isLoading: progressLoading } = useReturnLineProgress(
    open ? returnData.id : null,
  )

  // Enrich progress rows with the raw return_line so we still have condition_notes-adjacent
  // detail if we ever need it. For now, progress already has item_name/sku/condition.
  const rows: ReturnLineProgress[] = useMemo(() => {
    return lineProgress
      .slice()
      .sort((a, b) => {
        // good first, damaged second, everything else after — keeps the operator's eye on
        // replaceable rows.
        const order = (c: string) => (c === 'good' ? 0 : c === 'damaged' ? 2 : 1)
        return order(a.condition) - order(b.condition) || a.item_name.localeCompare(b.item_name)
      })
  }, [lineProgress])

  // Pre-fill: every good line with remaining_qty; damaged rows default 0 (and stay disabled).
  useEffect(() => {
    if (!open) return
    const next: Record<string, number> = {}
    for (const p of lineProgress) {
      if (p.condition === 'good' && p.remaining_qty > 0) {
        next[p.return_line_id] = p.remaining_qty
      } else {
        next[p.return_line_id] = 0
      }
    }
    setQtyByLineId(next)
    // Only reset the write-off default when there are damaged lines left to resolve.
    const anyDamagedRemaining = lineProgress.some((p) => p.condition === 'damaged' && p.remaining_qty > 0)
    setWriteOffDamaged(anyDamagedRemaining)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lineProgress.length])

  const hasDamagedRemaining = useMemo(
    () => rows.some((r) => r.condition === 'damaged' && r.remaining_qty > 0),
    [rows],
  )

  const totalGoodRemaining = useMemo(
    () => rows.filter((r) => r.condition === 'good').reduce((s, r) => s + r.remaining_qty, 0),
    [rows],
  )

  const totalReplacementQty = useMemo(
    () => Object.values(qtyByLineId).reduce((s, q) => s + (q || 0), 0),
    [qtyByLineId],
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

  const canSubmit = (totalReplacementQty > 0 || (writeOffDamaged && hasDamagedRemaining)) && !anyShort
  // Warehouse only strictly required when a replacement or write-off will be created.
  const needsWarehouse = totalReplacementQty > 0 || (writeOffDamaged && hasDamagedRemaining)

  const sendLabel = useMemo(() => {
    if (totalReplacementQty === 0 && writeOffDamaged && hasDamagedRemaining) return 'Write off damaged only'
    if (totalReplacementQty === 0) return 'Send Replacement'
    if (totalReplacementQty < totalGoodRemaining) {
      return `Send partial replacement (${totalReplacementQty} unit${totalReplacementQty === 1 ? '' : 's'})`
    }
    return `Send Replacement (${totalReplacementQty} unit${totalReplacementQty === 1 ? '' : 's'})`
  }, [totalReplacementQty, totalGoodRemaining, writeOffDamaged, hasDamagedRemaining])

  function setLineQty(returnLineId: string, raw: number, max: number) {
    const clamped = Math.max(0, Math.min(max, Number.isFinite(raw) ? Math.floor(raw) : 0))
    setQtyByLineId((prev) => ({ ...prev, [returnLineId]: clamped }))
  }

  function handlePickerChange(item: InventoryLookupResult | null) {
    setPickerValue(item)
    if (item) {
      setGiftItems((prev) => [
        ...prev,
        {
          item_name: item.item_name,
          sku: item.sku,
          qty: 1,
          brand_variant_id: item.brand_variant_id,
          unit_price: item.selling_price,
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
      warehouseName:   selectedWarehouse?.name ?? '',
      lines,
      writeOffDamaged: writeOffDamaged && hasDamagedRemaining,
      giftItems,
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-full h-full rounded-none max-w-none flex flex-col md:h-auto md:max-h-[90vh] md:w-full md:max-w-3xl md:rounded-lg">
        <DialogHeader>
          <DialogTitle>Send Replacement — {returnData.return_number}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-6 px-1">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Edit each line&apos;s replacement quantity. Damaged lines cannot be
              replaced — check &ldquo;write off damaged&rdquo; below to book them out of stock.
              You can save a partial replacement and resolve the remaining units later.
            </p>

            <div className="min-h-[8rem]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="w-16 text-center">Returned</TableHead>
                    <TableHead className="w-40">Already resolved</TableHead>
                    <TableHead className="w-20 text-center">Remaining</TableHead>
                    <TableHead className="w-28 text-center">Replace this time</TableHead>
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
                    const entries = r.brand_variant_id ? (whStockMap.get(r.brand_variant_id) ?? []) : []
                    const selectedStock = entries.find((e) => e.warehouse_id === warehouseId)?.qty ?? 0
                    const currentQty = qtyByLineId[r.return_line_id] ?? 0
                    const isDamaged = r.condition === 'damaged'
                    const isDisabled = isDamaged || r.remaining_qty <= 0
                    const shortInSelected = !!warehouseId && !isDamaged && currentQty > 0 && currentQty > selectedStock
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
                          {!isDamaged && r.brand_variant_id && (
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
                          {formatResolutions(r.resolutions_by_type)}
                        </TableCell>
                        <TableCell className="text-center text-sm">{r.remaining_qty}</TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            min={0}
                            max={r.remaining_qty}
                            value={currentQty}
                            disabled={isDisabled}
                            onChange={(e) => setLineQty(r.return_line_id, Number(e.target.value), r.remaining_qty)}
                            className="h-8 w-20 mx-auto text-center"
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {hasDamagedRemaining && (
              <label className="mt-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-sm dark:border-amber-900 dark:bg-amber-950/30">
                <Checkbox
                  checked={writeOffDamaged}
                  onCheckedChange={(v) => setWriteOffDamaged(v === true)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium text-amber-900 dark:text-amber-200">
                    Write off remaining damaged units
                  </span>
                  <span className="ml-1 text-amber-800 dark:text-amber-300">
                    ({rows.filter((r) => r.condition === 'damaged').reduce((s, r) => s + r.remaining_qty, 0)} units)
                  </span>
                  <span className="block text-xs text-amber-700/80 dark:text-amber-300/80">
                    Books an inventory write-off against the source warehouse and closes those units on the return ledger.
                  </span>
                </span>
              </label>
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
