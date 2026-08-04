'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import {
  DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { GuardedDialog, type GuardedFormDialogHandle } from '@/components/shared/GuardedFormDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Pencil, Check, Package } from 'lucide-react'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useCreateReplacementReceival, type ReplacementReceivalItem } from '@/hooks/useReceivals'
import { usePurchaseOrder } from '@/hooks/usePurchaseOrders'
import { useWarehouseSubContainers } from '@/hooks/useWarehouseSubContainers'
import type { NoteDebitLineItem } from '@/hooks/useCreditNotes'
import type { DebitNote, DebitNoteLine } from '@/types/invoice'
import { formatCurrency } from '@/lib/utils/formatters'

type DraftItem = {
  item_name: string
  sku: string | null
  qty: number
  unit_price: number
  brand_variant_id: string | null
  locked: boolean
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  debitNote: DebitNote & { debit_note_lines?: DebitNoteLine[] }
  onSuccess: () => void
}

export function ReplacementReceivalDialog({ open, onOpenChange, debitNote, onSuccess }: Props) {
  const { data: warehouses = [] } = useWarehouses()
  const createReplacement = useCreateReplacementReceival()

  const returnedLines = (debitNote.debit_note_lines ?? [])
    .filter((l) => l.line_type === 'returned')
    .map((l) => ({
      item_name:       l.description ?? 'Item',
      sku:             l.sku ?? null,
      qty:             l.qty,
      unit_price:      l.unit_price,
      total:           l.total ?? l.qty * l.unit_price,
      brand_variant_id: null,
      condition:       l.condition as NoteDebitLineItem['condition'],
      condition_notes: l.condition_notes,
    })) as NoteDebitLineItem[]
  const [items, setItems] = useState<DraftItem[]>(() =>
    returnedLines.map((line) => ({
      item_name: line.item_name,
      sku: line.sku ?? null,
      qty: line.qty,
      unit_price: line.unit_price,
      brand_variant_id: line.brand_variant_id ?? null,
      locked: true,
    }))
  )
  const [warehouseId, setWarehouseId] = useState('')
  const [subContainerId, setSubContainerId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const guardRef = useRef<GuardedFormDialogHandle>(null)

  const { data: po } = usePurchaseOrder(debitNote.purchase_order_id ?? null)
  const poDivisionId = po?.division_id ?? null

  const { data: allSubs = [] } = useWarehouseSubContainers(warehouseId || null)
  const eligibleSubs = useMemo(
    () => allSubs.filter((sc) => sc.is_active && sc.division_id === poDivisionId),
    [allSubs, poDivisionId]
  )

  useEffect(() => {
    if (eligibleSubs.length === 1) {
      setSubContainerId(eligibleSubs[0].id)
    } else if (eligibleSubs.length === 0) {
      setSubContainerId(null)
    } else if (subContainerId && !eligibleSubs.some((sc) => sc.id === subContainerId)) {
      setSubContainerId(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId, poDivisionId, eligibleSubs.length])

  const updateItem = (idx: number, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  const total = items.reduce((sum, it) => sum + it.qty * it.unit_price, 0)

  const isDirty =
    warehouseId !== '' ||
    items.some((it, i) => {
      const original = returnedLines[i]
      if (!original) return true
      return (
        it.qty !== original.qty ||
        it.unit_price !== original.unit_price ||
        !it.locked
      )
    })

  const submit = async () => {
    if (!warehouseId) {
      toast.error('Select a warehouse')
      return
    }
    if (eligibleSubs.length > 1 && !subContainerId) {
      toast.error('Pick a sub-container before submitting')
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
      const payloadItems: ReplacementReceivalItem[] = items.map((it) => ({
        brand_variant_id: it.brand_variant_id,
        item_name: it.item_name,
        sku: it.sku,
        qty_received: it.qty,
        unit_cost: it.unit_price,
      }))

      await createReplacement.mutateAsync({
        po_id: debitNote.purchase_order_id,
        warehouse_id: warehouseId,
        sub_container_id: subContainerId,
        debit_note_id: debitNote.id,
        items: payloadItems,
      })

      toast.success('Replacement receival recorded')
      guardRef.current?.closeAfterSubmit()
      onSuccess()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to record replacement receival')
    } finally {
      setSaving(false)
    }
  }

  return (
    <GuardedDialog open={open} onOpenChange={onOpenChange} isDirty={isDirty} ref={guardRef}>
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-2xl sm:rounded-lg max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>Replacement Receival</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Receive replacement stock for {debitNote.debit_note_id}
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 space-y-4">
          <div className="space-y-1">
            <Label htmlFor="repl-warehouse">Warehouse *</Label>
            <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v ?? '')}>
              <SelectTrigger id="repl-warehouse">
                <SelectValue placeholder="Select warehouse" />
              </SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto">
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {warehouseId && poDivisionId && (
            <div className="space-y-1">
              <Label className="flex items-center gap-1.5">
                <Package className="h-3 w-3" />
                Sub-container
              </Label>
              {eligibleSubs.length === 0 ? (
                <p className="text-xs text-muted-foreground border rounded-md py-2 px-3 bg-muted/30">
                  No active sub-container in this warehouse for the PO&apos;s division.
                  One will be auto-created when you submit.
                </p>
              ) : eligibleSubs.length === 1 ? (
                <div className="flex items-center gap-2 border rounded-md py-2 px-3 bg-muted/30 min-h-9">
                  <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm font-medium truncate">{eligibleSubs[0].name}</span>
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5 flex-shrink-0">
                    Auto-selected
                  </Badge>
                </div>
              ) : (
                <Select
                  value={subContainerId ?? ''}
                  onValueChange={(v) => setSubContainerId(v || null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a sub-container" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {eligibleSubs.map((sc) => (
                      <SelectItem key={sc.id} value={sc.id}>{sc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

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
          <Button variant="outline" onClick={() => guardRef.current?.requestClose()} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || items.length === 0 || !warehouseId}>
            {saving ? 'Recording…' : 'Record Receival'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </GuardedDialog>
  )
}
