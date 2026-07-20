'use client'

import { useState } from 'react'
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
  onConfirm: (warehouseId: string, warehouseName: string, giftItems: GiftItem[]) => void
  isPending: boolean
}

export function ReplacementDeliveryDialog({
  open, onOpenChange, returnData, onConfirm, isPending,
}: ReplacementDeliveryDialogProps) {
  const [warehouseId, setWarehouseId] = useState('')
  const [giftItems, setGiftItems] = useState<GiftItem[]>([])
  const [pickerValue, setPickerValue] = useState<InventoryLookupResult | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const { data: warehouses = [] } = useWarehouses()

  const selectedWarehouse = warehouses.find((w) => w.id === warehouseId)

  const goodwillCost = giftItems.reduce((sum, g) => sum + g.unit_price * g.qty, 0)

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
              The following items will be sent as replacement. Items and quantities
              match the return exactly and cannot be changed.
            </p>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-20 text-center">Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(returnData.return_lines ?? []).map((item, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <div className="text-sm">{item.item_name}</div>
                      {item.sku && (
                        <div className="text-xs text-muted-foreground">{item.sku}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-center">{item.qty}</TableCell>
                  </TableRow>
                ))}
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
                        {formatCurrency(gift.unit_price, 'QAR')}
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
                Goodwill cost: <span className="font-medium text-foreground">{formatCurrency(goodwillCost, 'QAR')}</span>
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

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleClose(false)}>Cancel</Button>
          <Button
            disabled={!warehouseId || isPending}
            onClick={() => onConfirm(warehouseId, selectedWarehouse?.name ?? '', giftItems)}
          >
            {isPending ? 'Sending...' : 'Send Replacement'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
