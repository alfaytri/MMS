'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateDelivery, type SaleOrder, type SOLineItem } from '@/hooks/useSaleOrders'
import { useWarehouses } from '@/hooks/useWarehouses'

interface SoDeliveryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  so: SaleOrder
}

export function SoDeliveryDialog({ open, onOpenChange, so }: SoDeliveryDialogProps) {
  const createDelivery = useCreateDelivery()
  const { data: warehouses } = useWarehouses()

  const [warehouseId, setWarehouseId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [qtys, setQtys] = useState<Record<string, number>>({})

  const lines = so.sale_order_lines ?? []

  function maxDeliverable(line: SOLineItem): number {
    return Math.max(0, line.qty - line.delivered_qty)
  }

  function handleSubmit() {
    if (!warehouseId) { toast.error('Select a warehouse'); return }
    const items = lines
      .map((l) => ({ ...l, deliveryQty: qtys[l.id] ?? 0 }))
      .filter((l) => l.deliveryQty > 0)

    if (items.length === 0) { toast.error('Enter qty for at least one item'); return }

    const warehouse = warehouses?.find((w) => w.id === warehouseId)

    createDelivery.mutate(
      {
        so_id: so.id,
        warehouse_id: warehouseId,
        warehouse_name: warehouse?.name ?? '',
        date,
        items: items.map((i) => ({
          item_name: i.item_name,
          sku: i.sku,
          qty_delivered: i.deliveryQty,
          brand_variant_id: i.brand_variant_id,
        })),
      },
      {
        onSuccess: () => {
          toast.success('Delivery created')
          onOpenChange(false)
          setQtys({})
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-lg sm:rounded-lg max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Create Delivery — {so.so_number}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* Warehouse + Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="delivery-warehouse">Warehouse *</Label>
              <select
                id="delivery-warehouse"
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">Select warehouse…</option>
                {(warehouses ?? []).map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="delivery-date">Date *</Label>
              <Input id="delivery-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {/* Line items */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Items</Label>
            {lines.map((line) => {
              const max = maxDeliverable(line)
              return (
                <div key={line.id} className="flex items-center gap-3 rounded-md border p-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{line.item_name}</div>
                    <div className="text-xs text-muted-foreground">
                      Ordered: {line.qty} · Delivered: {line.delivered_qty} · Max: {max}
                    </div>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    max={max}
                    value={qtys[line.id] ?? 0}
                    onChange={(e) => setQtys((prev) => ({ ...prev, [line.id]: Math.min(max, Math.max(0, Number(e.target.value))) }))}
                    className="w-20 text-right"
                    disabled={max === 0}
                  />
                </div>
              )
            })}
            {lines.length === 0 && (
              <p className="text-sm text-muted-foreground">No line items on this order.</p>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createDelivery.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createDelivery.isPending}>
            {createDelivery.isPending ? 'Creating…' : 'Create Delivery'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
