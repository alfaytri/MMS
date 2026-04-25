'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateReceival } from '@/hooks/useReceivals'
import { usePurchaseOrders, usePurchaseOrder } from '@/hooks/usePurchaseOrders'
import { useWarehouses } from '@/hooks/useWarehouses'

type DraftLine = {
  po_line_item_id: string | null
  item_name: string
  sku: string | null
  ordered_qty: number
  qty_received: number
  unit_cost: number
}

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function ReceivalFormDialog({ open, onOpenChange }: Props) {
  const createReceival = useCreateReceival()
  const { data: orders } = usePurchaseOrders({})
  const { data: warehouses } = useWarehouses()

  const [selectedPoId, setSelectedPoId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([])
  const [saving, setSaving] = useState(false)

  // Fetch selected PO with line items
  const { data: selectedPO } = usePurchaseOrder(selectedPoId || null)

  // Pre-fill lines when PO is selected and its data loads
  useEffect(() => {
    if (!selectedPoId || !selectedPO) { setLines([]); return }
    setLines(
      (selectedPO.po_line_items ?? []).map((li) => ({
        po_line_item_id: li.id,
        item_name: li.item_name ?? '',
        sku: li.sku ?? null,
        ordered_qty: li.qty ?? 0,
        qty_received: li.qty ?? 0,
        unit_cost: li.unit_price ?? 0,
      }))
    )
  }, [selectedPoId, selectedPO])

  const close = () => {
    setSelectedPoId(''); setWarehouseId(''); setNotes(''); setLines([])
    onOpenChange(false)
  }

  const submit = async () => {
    if (!selectedPoId || !warehouseId || !date) {
      toast.error('Select PO, warehouse, and date')
      return
    }
    if (lines.some((l) => l.qty_received <= 0)) {
      toast.error('All received quantities must be > 0')
      return
    }
    setSaving(true)
    try {
      await createReceival.mutateAsync({
        po_id: selectedPoId,
        warehouse_id: warehouseId,
        date,
        notes,
        items: lines.map((l) => ({
          po_line_item_id: l.po_line_item_id,
          brand_variant_id: null,
          item_name: l.item_name,
          sku: l.sku,
          qty_received: l.qty_received,
          unit_cost: l.unit_cost,
        })),
      })
      toast.success('Receival recorded and approved')
      close()
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const approvablePOs = (orders ?? []).filter((o) =>
    o.status === 'approved' || o.status === 'partially_received'
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Receival</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>Purchase Order *</Label>
              <Select value={selectedPoId} onValueChange={(v) => setSelectedPoId(v ?? '')}>
                <SelectTrigger>
                  <SelectValue placeholder="Select PO" />
                </SelectTrigger>
                <SelectContent>
                  {approvablePOs.map((po) => (
                    <SelectItem key={po.id} value={po.id}>
                      {po.po_number} — {po.supplier_name ?? ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Warehouse *</Label>
              <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? '')}>
                <SelectTrigger>
                  <SelectValue placeholder="Select warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {(warehouses ?? []).map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
          </div>

          {lines.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-2">Item</th>
                    <th className="text-right py-2 px-2">Ordered</th>
                    <th className="text-right py-2 px-2">Qty Received *</th>
                    <th className="text-right py-2 pl-2">Unit Cost *</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="py-2 pr-2">
                        <span className="font-medium">{line.item_name}</span>
                        {line.sku && <span className="text-muted-foreground ml-1">({line.sku})</span>}
                      </td>
                      <td className="text-right py-2 px-2 text-muted-foreground">{line.ordered_qty}</td>
                      <td className="py-2 px-2">
                        <Input
                          type="number"
                          className="w-24 text-right ml-auto"
                          value={line.qty_received}
                          min={0}
                          max={line.ordered_qty}
                          onChange={(e) => {
                            const updated = [...lines]
                            updated[idx] = { ...updated[idx], qty_received: Number(e.target.value) }
                            setLines(updated)
                          }}
                        />
                      </td>
                      <td className="py-2 pl-2">
                        <Input
                          type="number"
                          className="w-28 text-right ml-auto"
                          value={line.unit_cost}
                          min={0}
                          step="0.01"
                          onChange={(e) => {
                            const updated = [...lines]
                            updated[idx] = { ...updated[idx], unit_cost: Number(e.target.value) }
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
          {!selectedPoId && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Select a PO to load expected line items
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !selectedPoId || lines.length === 0}>
            {saving ? 'Recording…' : 'Record Receival'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
