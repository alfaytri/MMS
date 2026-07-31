'use client'

import { useState, useEffect, useMemo } from 'react'
import { Package } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCompleteDelivery, type SaleDelivery, type DeliveryItem } from '@/hooks/useSaleDeliveries'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useWarehouseSubContainers } from '@/hooks/useWarehouseSubContainers'
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
  const [subContainerId, setSubContainerId] = useState<string | null>(null)
  const [lines, setLines] = useState<DraftLine[]>([])
  const [saving, setSaving] = useState(false)

  const so = (orders ?? []).find((o) => o.id === delivery.sale_order_id)
  const linkedInvoice = (invoices ?? []).find((inv) => inv.sale_order_id === delivery.sale_order_id)
  const soDivisionId = so?.division_id ?? null

  const { data: allSubs = [] } = useWarehouseSubContainers(warehouseId || null)
  const eligibleSubs = useMemo(() => {
    const active = allSubs.filter((sc) => sc.is_active)
    if (soDivisionId === null) return active
    return active.filter((sc) => sc.division_id === soDivisionId)
  }, [allSubs, soDivisionId])

  useEffect(() => {
    if (eligibleSubs.length === 1) setSubContainerId(eligibleSubs[0].id)
    else if (eligibleSubs.length === 0) setSubContainerId(null)
    else if (subContainerId && !eligibleSubs.some((sc) => sc.id === subContainerId)) setSubContainerId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId, soDivisionId, eligibleSubs.length])

  useEffect(() => {
    const items = (delivery.sale_delivery_lines as DeliveryItem[]) ?? []
    setLines(
      items.map((item) => {
        const soLine = (so?.sale_order_lines ?? []).find(
          (l) => l.item_name === item.item_name && l.brand_variant_id === item.brand_variant_id
        )
        return {
          ...item,
          so_qty: soLine?.qty ?? 0,
          delivered_qty_input: item.qty_delivered,
        }
      })
    )
  }, [delivery, so])

  const submit = async () => {
    if (!warehouseId) { toast.error('Select a warehouse'); return }
    if (eligibleSubs.length === 0) {
      toast.error('No sub-container available for this delivery')
      return
    }
    if (eligibleSubs.length > 1 && !subContainerId) {
      toast.error('Pick a sub-container before submitting')
      return
    }
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
        subContainerId,
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
            <Label htmlFor="delivery-warehouse">Warehouse *</Label>
            <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? '')}>
              <SelectTrigger id="delivery-warehouse"><SelectValue placeholder="Select warehouse" /></SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto">
                {(warehouses ?? []).map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {warehouseId && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap min-h-7">
              <span className="inline-flex items-center gap-1 flex-shrink-0">
                <Package className="h-3 w-3" />
                Sub-container{soDivisionId === null ? ' *' : ''}:
              </span>
              {eligibleSubs.length === 0 ? (
                <span className="italic text-destructive">
                  No active sub-container in this warehouse for the SO&apos;s division.
                  {soDivisionId !== null && ' Add one under Master Data → Warehouses.'}
                </span>
              ) : eligibleSubs.length === 1 ? (
                <>
                  <span className="font-medium text-foreground truncate max-w-[400px]" title={eligibleSubs[0].name}>
                    {eligibleSubs[0].name}
                  </span>
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5 flex-shrink-0">Auto</Badge>
                </>
              ) : (
                <Select value={subContainerId ?? ''} onValueChange={(v) => setSubContainerId(v || null)}>
                  <SelectTrigger className="h-7 text-xs w-auto min-w-[240px] max-w-[400px]">
                    <SelectValue placeholder="Pick a sub-container…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {eligibleSubs.map((sc) => (
                      <SelectItem key={sc.id} value={sc.id}>
                        {sc.name}{sc.division_name ? ` — ${sc.division_name}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

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
