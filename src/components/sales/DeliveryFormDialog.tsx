'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCompleteDelivery, type SaleDelivery, type DeliveryItem } from '@/hooks/useSaleDeliveries'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useCustomerInvoices } from '@/hooks/useCustomerInvoices'
import { useSaleOrders } from '@/hooks/useSaleOrders'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  delivery: SaleDelivery
}

type DraftLine = DeliveryItem & { so_qty: number; delivered_qty_input: number }

export function DeliveryFormDialog({ open, onOpenChange, delivery }: Props) {
  const completeDelivery = useCompleteDelivery()
  const { data: warehouses } = useWarehouses()
  const { data: invoices } = useCustomerInvoices()
  const { data: orders } = useSaleOrders()

  const [warehouseId, setWarehouseId] = useState(delivery.warehouse_id ?? '')
  const [lines, setLines] = useState<DraftLine[]>([])
  const [saving, setSaving] = useState(false)

  const so = (orders ?? []).find((o) => o.id === delivery.sale_order_id)
  const linkedInvoice = (invoices ?? []).find((inv) => inv.sale_order_id === delivery.sale_order_id)

  useEffect(() => {
    const items = (delivery.items as DeliveryItem[]) ?? []
    setLines(
      items.map((item) => {
        const soLine = (so?.sale_order_lines ?? []).find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (l: any) => l.item_name === item.item_name && l.brand_variant_id === item.brand_variant_id
        )
        return {
          ...item,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          so_qty: (soLine as any)?.qty ?? 0,
          delivered_qty_input: item.qty_delivered,
        }
      })
    )
  }, [delivery, so])

  const submit = async () => {
    if (!warehouseId) { toast.error('Select a warehouse'); return }
    setSaving(true)
    try {
      const remainingItems: DeliveryItem[] = lines
        .filter((l) => l.so_qty - l.delivered_qty_input > 0)
        .map((l) => ({
          item_name: l.item_name,
          sku: l.sku,
          qty_delivered: l.so_qty - l.delivered_qty_input,
          brand_variant_id: l.brand_variant_id,
        }))

      await completeDelivery.mutateAsync({
        deliveryId: delivery.id,
        soId: delivery.sale_order_id,
        invoiceId: linkedInvoice?.id ?? null,
        remainingItems,
      })
      toast.success('Delivery completed')
      onOpenChange(false)
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{delivery.delivery_number} — Complete Delivery</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Warehouse *</Label>
            <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? '')}>
              <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
              <SelectContent>
                {(warehouses ?? []).map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {lines.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-2 pr-2">Item</th>
                    <th className="text-right py-2 px-2">SO Qty</th>
                    <th className="text-right py-2 pl-2">Deliver Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="py-2 pr-2 font-medium">{line.item_name}</td>
                      <td className="text-right py-2 px-2 text-muted-foreground">{line.so_qty}</td>
                      <td className="py-2 pl-2">
                        <Input
                          type="number"
                          className="w-24 text-right ml-auto"
                          value={line.delivered_qty_input}
                          min={0}
                          max={line.so_qty}
                          onChange={(e) => {
                            const updated = [...lines]
                            updated[idx] = { ...updated[idx], delivered_qty_input: Number(e.target.value) }
                            setLines(updated)
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {linkedInvoice?.needs_refresh && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded p-2">
              ⚠ Invoice {linkedInvoice.invoice_id} has pending changes — review the invoice before sending to customer.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Completing…' : 'Mark as Delivered'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
