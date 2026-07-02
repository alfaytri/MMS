'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Pencil, Check } from 'lucide-react'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useCreateReplacementReceival, type ReplacementReceivalItem } from '@/hooks/useReceivals'
import type { CreditNote } from '@/hooks/useCreditNotes'
import { formatCurrency } from '@/lib/utils/formatters'
import { createClient } from '@/lib/supabase/client'

type DraftItem = {
  item_name: string
  sku: string | null
  qty: number
  unit_price: number
  locked: boolean
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  debitNote: CreditNote
  onSuccess: () => void
}

export function ReplacementReceivalDialog({ open, onOpenChange, debitNote, onSuccess }: Props) {
  const { data: warehouses = [] } = useWarehouses()
  const createReplacement = useCreateReplacementReceival()

  const returnedLines = debitNote.line_items?.returned_lines ?? []
  const [items, setItems] = useState<DraftItem[]>(() =>
    returnedLines.map((line) => ({
      item_name: line.item_name,
      sku: line.sku ?? null,
      qty: line.qty,
      unit_price: line.unit_price,
      locked: true,
    }))
  )
  const [warehouseId, setWarehouseId] = useState('')
  const [saving, setSaving] = useState(false)

  const updateItem = (idx: number, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  const total = items.reduce((sum, it) => sum + it.qty * it.unit_price, 0)

  const close = () => {
    onOpenChange(false)
  }

  const submit = async () => {
    if (!warehouseId) {
      toast.error('Select a warehouse')
      return
    }
    if (items.length === 0) {
      toast.error('No items to receive')
      return
    }
    if (items.some((it) => it.qty <= 0)) {
      toast.error('All quantities must be greater than 0')
      return
    }
    if (!debitNote.purchase_order_id) {
      toast.error('Debit note is not linked to a purchase order')
      return
    }

    setSaving(true)
    try {
      const supabase = createClient()

      // Resolve brand_variant_id for each item via SKU (stored as `code`) lookup, best-effort.
      const skus = items.map((it) => it.sku).filter((s): s is string => !!s)
      let variantBySkuMap = new Map<string, string>()
      if (skus.length > 0) {
        const { data: variants } = await supabase
          .from('inventory_brand_variants')
          .select('id, code')
          .in('code', skus)
        variantBySkuMap = new Map((variants ?? []).map((v) => [v.code as string, v.id as string]))
      }

      const payloadItems: ReplacementReceivalItem[] = items.map((it) => ({
        brand_variant_id: it.sku ? (variantBySkuMap.get(it.sku) ?? null) : null,
        item_name: it.item_name,
        sku: it.sku,
        qty_received: it.qty,
        unit_cost: it.unit_price,
      }))

      await createReplacement.mutateAsync({
        po_id: debitNote.purchase_order_id,
        warehouse_id: warehouseId,
        debit_note_id: debitNote.id,
        items: payloadItems,
      })

      toast.success('Replacement receival recorded')
      onSuccess()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to record replacement receival')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close() }}>
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-2xl sm:rounded-lg max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>Replacement Receival</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Receive replacement stock for {debitNote.credit_note_id}
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 space-y-4">
          <div className="space-y-1">
            <Label htmlFor="repl-warehouse">Warehouse *</Label>
            <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? '')}>
              <SelectTrigger id="repl-warehouse">
                <SelectValue placeholder="Select warehouse" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border">
            <Table className="w-full min-w-[600px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Item</TableHead>
                  <TableHead className="text-xs">SKU</TableHead>
                  <TableHead className="text-xs text-right">Qty</TableHead>
                  <TableHead className="text-xs text-right">Unit Price</TableHead>
                  <TableHead className="text-xs text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="text-sm">{item.item_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{item.sku ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        className="w-20 text-right ml-auto h-8"
                        value={item.qty}
                        min={1}
                        onChange={(e) => updateItem(idx, { qty: Number(e.target.value) })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Input
                          type="number"
                          className="w-24 text-right h-8"
                          value={item.unit_price}
                          min={0}
                          step="0.01"
                          disabled={item.locked}
                          onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })}
                        />
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground shrink-0"
                          onClick={() => updateItem(idx, { locked: !item.locked })}
                          title={item.locked ? 'Unlock price' : 'Lock price'}
                        >
                          {item.locked
                            ? <Pencil className="h-3.5 w-3.5" />
                            : <Check className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-right font-medium whitespace-nowrap tabular-nums">
                      {formatCurrency(item.qty * item.unit_price, 'QAR')}
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No returned items found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {items.length > 0 && (
            <div className="flex justify-end">
              <div className="flex justify-between gap-8 text-sm font-semibold w-56">
                <span>Total</span>
                <span className="whitespace-nowrap tabular-nums">{formatCurrency(total, 'QAR')}</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={close} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || items.length === 0 || !warehouseId}>
            {saving ? 'Recording…' : 'Record Receival'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
