'use client'

import { useMemo, useState } from 'react'
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
import { type SaleReturn } from '@/hooks/useSaleReturns'
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

interface ReplacementDeliveryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  returnData: SaleReturn
  soId: string
  currency?: string | null
  onConfirm: (warehouseId: string, warehouseName: string, giftItems: GiftItem[]) => void
  isPending: boolean
}

export function ReplacementDeliveryDialog({
  open, onOpenChange, returnData, currency, onConfirm, isPending,
}: ReplacementDeliveryDialogProps) {
  const cur = currency ?? 'QAR'
  const [warehouseId, setWarehouseId] = useState('')
  const [giftItems, setGiftItems] = useState<GiftItem[]>([])
  const [pickerValue, setPickerValue] = useState<InventoryLookupResult | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const { data: warehouses = [] } = useWarehouses()

  const selectedWarehouse = warehouses.find((w) => w.id === warehouseId)

  const goodwillCost = giftItems.reduce((sum, g) => sum + g.unit_price * g.qty, 0)

  // Aggregate return lines by variant — a two-flow return can have
  // multiple lines per variant (good + damaged + inspection). The
  // replacement is one physical delivery, so we roll them up into a
  // single row per variant. Same aggregation happens in the hook when
  // writing sale_delivery_lines.
  const aggregatedLines = useMemo(() => {
    type Row = { key: string; item_name: string; sku: string | null; qty: number; brand_variant_id: string | null }
    const map = new Map<string, Row>()
    for (const l of returnData.return_lines ?? []) {
      const key = l.brand_variant_id ?? `noBV:${l.item_name}:${l.sku ?? ''}`
      const prev = map.get(key)
      if (prev) {
        prev.qty += l.qty
      } else {
        map.set(key, {
          key,
          item_name: l.item_name,
          sku: l.sku,
          qty: l.qty,
          brand_variant_id: l.brand_variant_id,
        })
      }
    }
    return Array.from(map.values())
  }, [returnData.return_lines])

  const bvIds = useMemo(
    () => aggregatedLines.map((l) => l.brand_variant_id).filter(Boolean) as string[],
    [aggregatedLines],
  )
  const { data: whStockMap } = useWarehouseStockByItems(bvIds)

  const anyShort = useMemo(() => {
    if (!warehouseId) return false
    return aggregatedLines.some((l) => {
      if (!l.brand_variant_id) return false
      const entries = whStockMap.get(l.brand_variant_id) ?? []
      const stock = entries.find((e) => e.warehouse_id === warehouseId)?.qty ?? 0
      return l.qty > stock
    })
  }, [aggregatedLines, whStockMap, warehouseId])

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
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-full h-full rounded-none max-w-none flex flex-col md:h-auto md:max-h-[90vh] md:w-full md:max-w-2xl md:rounded-lg">
        <DialogHeader>
          <DialogTitle>Send Replacement — {returnData.return_number}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-6 px-1">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              The following items will be sent as replacement. Quantities match
              the total returned per variant (good + damaged + inspection all
              aggregated into one line) and cannot be changed. Pick a source
              warehouse that has enough stock to fulfill each row.
            </p>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-20 text-center">Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aggregatedLines.map((item) => {
                  const entries = item.brand_variant_id ? (whStockMap.get(item.brand_variant_id) ?? []) : []
                  const selectedStock = entries.find((e) => e.warehouse_id === warehouseId)?.qty ?? 0
                  const shortInSelected = !!warehouseId && item.qty > selectedStock
                  return (
                    <TableRow key={item.key}>
                      <TableCell>
                        <div className="text-sm">{item.item_name}</div>
                        {item.sku && (
                          <div className="text-xs text-muted-foreground">{item.sku}</div>
                        )}
                        {item.brand_variant_id && (
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
                            Selected warehouse has only {selectedStock} — {item.qty - selectedStock} short
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-center">{item.qty}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
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
            <label className="text-sm font-medium">Source Warehouse *</label>
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
              One or more items don&apos;t have enough stock in the selected warehouse. Pick a different warehouse or wait for restock.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => handleClose(false)}>Cancel</Button>
            <Button
              disabled={!warehouseId || isPending || anyShort}
              onClick={() => onConfirm(warehouseId, selectedWarehouse?.name ?? '', giftItems)}
            >
              {isPending ? 'Sending...' : 'Send Replacement'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
