'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Gift, Plus, Trash2 } from 'lucide-react'
import { DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  GuardedDialog,
  type GuardedFormDialogHandle,
} from '@/components/shared/GuardedFormDialog'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useWarehouseStockByItems } from '@/hooks/useWarehouseOperations'
import { useWarehouseSubContainers, useWarehouseDivisionSets } from '@/hooks/useWarehouseSubContainers'
import { useActiveDivision } from '@/components/providers/DivisionProvider'
import { useReturnLineSources } from '@/hooks/useReturnLineSources'
import { type SaleReturn, useReturnLineProgress, type ReturnLineProgress } from '@/hooks/useSaleReturns'
import type { ReturnDispositionType, ReturnLineDisposition } from '@/hooks/useSaleDeliveries'
import { CascadeInventorySelector } from '@/components/purchase/CascadeInventorySelector'
import type { InventoryLookupResult } from '@/hooks/usePurchaseOrders'
import { formatCurrency } from '@/lib/utils/formatters'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'

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

type DispositionChoice = ReturnDispositionType | 'none'

const DISPOSITION_OPTIONS: Array<{
  value: DispositionChoice
  label: string
  disabled?: boolean
  hint?: string
}> = [
  { value: 'write_off',          label: 'Write off' },
  { value: 'restock_as_damaged', label: 'Restock as damaged' },
  { value: 'send_for_repair',    label: 'Send for repair' },
]

export function ReplacementDeliveryDialog({
  open, onOpenChange, returnData, currency, onConfirm, isPending,
}: ReplacementDeliveryDialogProps) {
  const cur = currency ?? 'QAR'
  const [warehouseId, setWarehouseId] = useState('')
  const [showWarehousePicker, setShowWarehousePicker] = useState(false)
  const [qtyByLineId, setQtyByLineId] = useState<Record<string, number>>({})
  const [dispositionByLineId, setDispositionByLineId] = useState<Record<string, DispositionChoice>>({})
  const [dispositionQtyByLineId, setDispositionQtyByLineId] = useState<Record<string, number>>({})
  const [giftItems, setGiftItems] = useState<GiftItem[]>([])
  const [pickerValue, setPickerValue] = useState<InventoryLookupResult | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [initialQtyByLineId, setInitialQtyByLineId] = useState<Record<string, number>>({})
  const [initialDispositionByLineId, setInitialDispositionByLineId] = useState<Record<string, DispositionChoice>>({})
  const [initialDispositionQtyByLineId, setInitialDispositionQtyByLineId] = useState<Record<string, number>>({})
  const guardRef = useRef<GuardedFormDialogHandle>(null)

  const { data: warehouses = [] } = useWarehouses()
  // "Change source warehouse" alternatives are scoped to the active division
  // (the auto-derived default from the original delivery is preserved). "All"
  // shows everything — matches the filterByActiveDivision item selector below.
  const { viewDivisionIds } = useActiveDivision()
  const { data: whDivisionSets } = useWarehouseDivisionSets()
  const visibleWarehouses = useMemo(() => {
    if (viewDivisionIds.size === 0) return warehouses
    return warehouses.filter((w) => {
      const divs = whDivisionSets?.get(w.id)
      if (!divs) return false
      for (const d of viewDivisionIds) if (divs.has(d)) return true
      return false
    })
  }, [warehouses, whDivisionSets, viewDivisionIds])
  const { data: lineProgress = [], isLoading: progressLoading } = useReturnLineProgress(
    open ? returnData.id : null,
  )

  const rows: ReturnLineProgress[] = useMemo(() => {
    return lineProgress
      .slice()
      .sort((a, b) => {
        const order = (c: string) => (c === 'good' ? 0 : c === 'damaged' ? 2 : 1)
        return order(a.condition) - order(b.condition) || a.item_name.localeCompare(b.item_name)
      })
  }, [lineProgress])

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
    setInitialQtyByLineId(nextReplace)
    setInitialDispositionByLineId(nextDisposition)
    setInitialDispositionQtyByLineId(nextDispQty)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lineProgress.length])

  const sdlByReturnLineId = useMemo(() => {
    const map = new Map<string, string>()
    for (const l of returnData.return_lines ?? []) {
      const sdl = (l as { sale_delivery_line_id?: string | null }).sale_delivery_line_id
      if (sdl) map.set(l.id, sdl)
    }
    return map
  }, [returnData.return_lines])
  const returnLineSdlIds = useMemo(
    () => Array.from(new Set(sdlByReturnLineId.values())),
    [sdlByReturnLineId]
  )
  const { data: sourceMaps } = useReturnLineSources([], returnLineSdlIds, returnData.id)

  const [initialWarehouseId, setInitialWarehouseId] = useState('')
  useEffect(() => {
    if (!open) return
    const firstSdl = returnLineSdlIds[0]
    const derived = firstSdl ? sourceMaps?.delivery.get(firstSdl)?.warehouseId : undefined
    let next = ''
    if (derived) next = derived
    else if (returnData.restock_warehouse_id) next = returnData.restock_warehouse_id
    setWarehouseId(next)
    setInitialWarehouseId(next)
  }, [open, returnLineSdlIds, sourceMaps, returnData.restock_warehouse_id])

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

  const { data: activeSubs = [] } = useWarehouseSubContainers(warehouseId || null)
  const resolvedSubContainerId = useMemo(() => {
    if (!warehouseId) return null
    // Scope the source shelf to the active division so a replacement ships from
    // the right division's stock even in a shared warehouse.
    const eligible = activeSubs.filter((sc) =>
      sc.is_active && (viewDivisionIds.size === 0 || (sc.division_id != null && viewDivisionIds.has(sc.division_id))))
    return eligible.length === 1 ? eligible[0].id : null
  }, [warehouseId, activeSubs, viewDivisionIds])

  const { data: whStockMap } = useWarehouseStockByItems(bvIds, resolvedSubContainerId)

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

  // Dirty when warehouse changed from its auto-derived default, any qty /
  // disposition drifted from the auto-seeded initial, or gifts were added.
  function mapDiffers(a: Record<string, number>, b: Record<string, number>) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const k of keys) if ((a[k] ?? 0) !== (b[k] ?? 0)) return true
    return false
  }
  function choiceMapDiffers(
    a: Record<string, DispositionChoice>,
    b: Record<string, DispositionChoice>,
  ) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const k of keys) if ((a[k] ?? 'none') !== (b[k] ?? 'none')) return true
    return false
  }
  const isDirty =
    warehouseId !== initialWarehouseId ||
    giftItems.length > 0 ||
    mapDiffers(qtyByLineId, initialQtyByLineId) ||
    mapDiffers(dispositionQtyByLineId, initialDispositionQtyByLineId) ||
    choiceMapDiffers(dispositionByLineId, initialDispositionByLineId)

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

  function handleOpenChange(nextOpen: boolean) {
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
    <GuardedDialog open={open} onOpenChange={handleOpenChange} isDirty={isDirty} ref={guardRef}>
      <DialogContent className="w-full h-full rounded-none max-w-none flex flex-col md:h-auto md:max-h-[90vh] md:w-full md:max-w-4xl md:rounded-lg">
        <DialogHeader>
          <DialogTitle>Send Replacement — {returnData.return_number}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-6 px-1">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Good lines can be replaced from stock. Damaged lines take a
              disposition decision — write off, restock as damaged, or send
              for repair. Send-for-repair records the decision now; the
              vendor + expected return date get picked in a follow-up step
              from the Damaged Stock overview. You can save a partial
              resolution and finish the rest later.
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
                  {rows.map((r, ri) => {
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
                    const showBothDimensions = isDamaged && (custRemaining !== invRemaining)

                    return (
                      <TableRow key={r.return_line_id} className={STAGGER_IN} style={staggerDelay(ri)}>
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
                                  <SelectTrigger className="h-8 w-48 min-h-8 text-xs">
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
                  filterByActiveDivision
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
                    <TableRow key={i} className={STAGGER_IN} style={staggerDelay(i)}>
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
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-sm font-medium">Source Warehouse{needsWarehouse ? ' *' : ''}</label>
              {warehouseId && !showWarehousePicker && (() => {
                const firstSdl = returnLineSdlIds[0]
                const info = firstSdl ? sourceMaps?.delivery.get(firstSdl) : undefined
                const scName = info?.warehouseId === warehouseId ? info?.subContainerName : null
                return (
                  <>
                    <span className="text-sm font-medium text-foreground">
                      {selectedWarehouse?.name ?? '—'}
                    </span>
                    {scName && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                        {scName}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5">Auto</Badge>
                    <button
                      type="button"
                      onClick={() => setShowWarehousePicker(true)}
                      className="text-[11px] text-primary hover:underline"
                    >
                      Change
                    </button>
                  </>
                )
              })()}
              {(!warehouseId || showWarehousePicker) && (
                <button
                  type="button"
                  onClick={() => setShowWarehousePicker(false)}
                  className="text-[11px] text-muted-foreground hover:underline ml-auto"
                  disabled={!warehouseId}
                >
                  Cancel
                </button>
              )}
            </div>
            {(!warehouseId || showWarehousePicker) && (
              <>
                <Select value={warehouseId} onValueChange={(v) => { setWarehouseId(v ?? ''); setShowWarehousePicker(false) }}>
                  <SelectTrigger className="mt-1 w-full">
                    <SelectValue placeholder="Select warehouse" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {visibleWarehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Replacement ships from this warehouse. Default = the return&apos;s original delivery source.
                </p>
              </>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col items-stretch sm:flex-col sm:items-stretch gap-2">
          {anyShort && (
            <p className="text-[11px] text-destructive text-left">
              One or more items don&apos;t have enough stock in the selected warehouse. Pick a different warehouse or reduce the qty.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => guardRef.current?.requestClose()}>Cancel</Button>
            <Button
              disabled={!canSubmit || (needsWarehouse && !warehouseId) || isPending}
              onClick={handleSubmit}
            >
              {isPending ? 'Sending...' : sendLabel}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </GuardedDialog>
  )
}
