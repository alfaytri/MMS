'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useCreateTransfer } from '@/hooks/useWarehouseOperations'
import type { TransferItem } from '@/hooks/useWarehouseOperations'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WhTransferDialog({ open, onOpenChange }: Props) {
  const { data: warehouses } = useWarehouses()
  const createTransfer = useCreateTransfer()
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<TransferItem[]>([
    { brand_variant_id: '', item_name: '', sku: null, qty: 1, unit_cost: 0 },
  ])

  function addItem() {
    setItems([...items, { brand_variant_id: '', item_name: '', sku: null, qty: 1, unit_cost: 0 }])
  }

  function updateItem(idx: number, patch: Partial<TransferItem>) {
    setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  function removeItem(idx: number) {
    if (items.length === 1) return
    setItems(items.filter((_, i) => i !== idx))
  }

  function reset() {
    setFromId(''); setToId(''); setNotes('')
    setItems([{ brand_variant_id: '', item_name: '', sku: null, qty: 1, unit_cost: 0 }])
  }

  function handleSubmit() {
    if (!fromId || !toId) { toast.error('Select source and destination warehouses'); return }
    if (fromId === toId) { toast.error('Source and destination must be different'); return }
    const validItems = items.filter((i) => i.item_name.trim() && i.qty > 0)
    if (validItems.length === 0) { toast.error('Add at least one item with name and qty > 0'); return }

    createTransfer.mutate(
      { from_warehouse_id: fromId, to_warehouse_id: toId, date, items: validItems, notes: notes || null },
      {
        onSuccess: () => { toast.success('Transfer created'); onOpenChange(false); reset() },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Create Transfer</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="tf-from">From Warehouse *</Label>
              <select
                id="tf-from"
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">Select…</option>
                {(warehouses ?? []).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="tf-to">To Warehouse *</Label>
              <select
                id="tf-to"
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">Select…</option>
                {(warehouses ?? []).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1 w-36">
            <Label htmlFor="tf-date">Date *</Label>
            <Input id="tf-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Items</Label>
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center rounded-md border p-2">
                <div className="col-span-12 sm:col-span-5">
                  <Input
                    placeholder="Item name *"
                    value={item.item_name}
                    onChange={(e) => updateItem(idx, { item_name: e.target.value })}
                    className="text-xs"
                  />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <Input
                    placeholder="SKU"
                    value={item.sku ?? ''}
                    onChange={(e) => updateItem(idx, { sku: e.target.value || null })}
                    className="text-xs"
                  />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <Input
                    type="number"
                    min="1"
                    placeholder="Qty"
                    value={item.qty}
                    onChange={(e) => updateItem(idx, { qty: Math.max(1, Number(e.target.value)) })}
                    className="text-xs"
                  />
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Cost"
                    value={item.unit_cost}
                    onChange={(e) => updateItem(idx, { unit_cost: Number(e.target.value) })}
                    className="text-xs"
                  />
                </div>
                <div className="col-span-1 flex justify-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => removeItem(idx)}
                    disabled={items.length === 1}
                  >
                    ✕
                  </Button>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              + Add Item
            </Button>
          </div>

          <div className="space-y-1">
            <Label htmlFor="tf-notes">Notes</Label>
            <Input
              id="tf-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional…"
            />
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createTransfer.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createTransfer.isPending}>
            {createTransfer.isPending ? 'Creating…' : 'Create Transfer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
