'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useCreateReceival } from '@/hooks/useReceivals'
import type { PurchaseOrder } from '@/hooks/usePurchaseOrders'

type Props = {
  po: PurchaseOrder
}

type ReceiveRow = {
  po_line_item_id: string
  item_name: string
  sku: string | null
  ordered: number
  alreadyReceived: number
  receiveNow: number
  unitCost: number
}

export function PoReceiveTab({ po }: Props) {
  const { data: warehouses } = useWarehouses()
  const createReceival = useCreateReceival()

  const [warehouseId, setWarehouseId] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const [rows, setRows] = useState<ReceiveRow[]>(() =>
    (po.po_line_items ?? []).map((li) => ({
      po_line_item_id: li.id,
      item_name: li.item_name,
      sku: li.sku ?? null,
      ordered: li.qty,
      alreadyReceived: li.received_qty,
      receiveNow: Math.max(0, li.qty - li.received_qty),
      unitCost: li.unit_price,
    }))
  )

  function updateRow(id: string, field: 'receiveNow' | 'unitCost', value: number) {
    setRows((prev) =>
      prev.map((r) => (r.po_line_item_id === id ? { ...r, [field]: value } : r))
    )
  }

  function receiveAll() {
    setRows((prev) =>
      prev.map((r) => ({ ...r, receiveNow: Math.max(0, r.ordered - r.alreadyReceived) }))
    )
  }

  const canSubmit = !!warehouseId && rows.some((r) => r.receiveNow > 0)

  async function submit() {
    if (!canSubmit) return
    setSaving(true)
    try {
      await createReceival.mutateAsync({
        po_id: po.id,
        warehouse_id: warehouseId,
        date: new Date().toISOString().split('T')[0],
        notes,
        items: rows
          .filter((r) => r.receiveNow > 0)
          .map((r) => ({
            po_line_item_id: r.po_line_item_id,
            item_name: r.item_name,
            sku: r.sku,
            qty_received: r.receiveNow,
            unit_cost: r.unitCost,
          })),
      })
      toast.success('Receival recorded successfully')
      setRows((prev) => prev.map((r) => ({ ...r, receiveNow: 0 })))
      setNotes('')
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Failed to record receival')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1 flex-1 min-w-[200px]">
          <Label>Warehouse *</Label>
          <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? '')}>
            <SelectTrigger><SelectValue placeholder="Select warehouse…" /></SelectTrigger>
            <SelectContent>
              {(warehouses ?? []).map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" type="button" onClick={receiveAll}>
          Receive All Remaining
        </Button>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right w-[80px]">Ordered</TableHead>
              <TableHead className="text-right w-[100px]">Received</TableHead>
              <TableHead className="text-right w-[120px]">Receive Now</TableHead>
              <TableHead className="text-right hidden sm:table-cell w-[100px]">Unit Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.po_line_item_id}>
                <TableCell>
                  <p className="font-medium text-sm">{row.item_name}</p>
                  {row.sku && <p className="text-xs text-muted-foreground">{row.sku}</p>}
                </TableCell>
                <TableCell className="text-right text-sm">{row.ordered}</TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">{row.alreadyReceived}</TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    min={0}
                    max={row.ordered - row.alreadyReceived}
                    value={row.receiveNow}
                    onChange={(e) => updateRow(row.po_line_item_id, 'receiveNow', Number(e.target.value))}
                    className="h-7 w-20 text-right ml-auto"
                  />
                </TableCell>
                <TableCell className="text-right hidden sm:table-cell">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={row.unitCost}
                    onChange={(e) => updateRow(row.po_line_item_id, 'unitCost', Number(e.target.value))}
                    className="h-7 w-24 text-right ml-auto"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-1">
        <Label>Notes</Label>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional receival notes…"
        />
      </div>
      <div className="flex justify-end">
        <Button disabled={!canSubmit || saving} onClick={submit}>
          {saving ? 'Saving…' : 'Confirm Receival'}
        </Button>
      </div>
    </div>
  )
}
