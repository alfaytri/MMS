'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useCompleteReturnInspection, type InspectionSplit, type SaleReturn } from '@/hooks/useSaleReturns'
import { useWarehouses } from '@/hooks/useWarehouses'

type Split = {
  return_line_id: string
  item_name: string
  original_qty: number
  good_qty: number
  damaged_qty: number
  condition_notes: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  ret: SaleReturn
  suggestedWarehouseId?: string | null
}

export function CompleteInspectionDialog({ open, onOpenChange, ret, suggestedWarehouseId }: Props) {
  const [warehouseId, setWarehouseId] = useState(suggestedWarehouseId ?? '')
  const [splits, setSplits] = useState<Split[]>(() =>
    (ret.return_lines ?? [])
      .filter((l) => l.condition === 'inspection')
      .map((l) => ({
        return_line_id: l.id,
        item_name: l.item_name,
        original_qty: l.qty,
        good_qty: 0,
        damaged_qty: 0,
        condition_notes: l.condition_notes ?? '',
      })),
  )

  const [confirmDamagedOpen, setConfirmDamagedOpen] = useState(false)

  const { data: warehouses = [] } = useWarehouses()
  const completeInspection = useCompleteReturnInspection()

  const anyMismatch = useMemo(
    () => splits.some((s) => (s.good_qty + s.damaged_qty) !== s.original_qty),
    [splits],
  )
  const anyNegative = useMemo(
    () => splits.some((s) => s.good_qty < 0 || s.damaged_qty < 0),
    [splits],
  )

  const totalDamaged = useMemo(
    () => splits.reduce((s, x) => s + (x.damaged_qty || 0), 0),
    [splits],
  )

  const canSubmit =
    splits.length > 0 && !!warehouseId && !anyMismatch && !anyNegative
    && !completeInspection.isPending

  function submitNow() {
    const payload: InspectionSplit[] = splits.map((s) => ({
      return_line_id: s.return_line_id,
      good_qty: s.good_qty,
      damaged_qty: s.damaged_qty,
      condition_notes: s.condition_notes.trim() || null,
    }))

    completeInspection.mutate(
      { returnId: ret.id, splits: payload, restockWarehouseId: warehouseId },
      {
        onSuccess: () => {
          toast.success(`${ret.return_number} inspection complete — ready to restock`)
          onOpenChange(false)
        },
        onError: (err) => toast.error((err as Error).message),
      },
    )
  }

  function handleSubmit() {
    if (totalDamaged > 0) {
      setConfirmDamagedOpen(true)
      return
    }
    submitNow()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Complete Inspection — {ret.return_number}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          <p className="text-xs text-muted-foreground">
            Enter the actual good / damaged split for each inspected item. Totals per row must equal
            the original inspection qty. On save, the return moves to <strong>received</strong> and
            can then be restocked normally.
          </p>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Restock Warehouse <span className="text-destructive">*</span>
            </label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              <option value="">Select warehouse…</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Item</TableHead>
                  <TableHead className="text-xs text-right w-20">Inspected</TableHead>
                  <TableHead className="text-xs text-right w-24">Good</TableHead>
                  <TableHead className="text-xs text-right w-24">Damaged</TableHead>
                  <TableHead className="text-xs w-40">Damage notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {splits.map((s, i) => {
                  const total = s.good_qty + s.damaged_qty
                  const mismatch = total !== s.original_qty
                  return (
                    <TableRow key={s.return_line_id}>
                      <TableCell className="text-xs font-medium align-top">{s.item_name}</TableCell>
                      <TableCell className="text-xs text-right align-top">{s.original_qty}</TableCell>
                      <TableCell className="text-right align-top">
                        <input
                          type="number" min={0} max={s.original_qty}
                          className="w-20 h-7 text-xs text-right rounded border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                          value={s.good_qty}
                          onChange={(e) => setSplits((prev) => prev.map((p, j) =>
                            j === i ? { ...p, good_qty: Math.max(0, Number(e.target.value) || 0) } : p))}
                        />
                      </TableCell>
                      <TableCell className="text-right align-top">
                        <input
                          type="number" min={0} max={s.original_qty}
                          className="w-20 h-7 text-xs text-right rounded border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                          value={s.damaged_qty}
                          onChange={(e) => setSplits((prev) => prev.map((p, j) =>
                            j === i ? { ...p, damaged_qty: Math.max(0, Number(e.target.value) || 0) } : p))}
                        />
                        {mismatch && (
                          <div className="mt-0.5 text-[10px] text-destructive">
                            {total > s.original_qty
                              ? `−${total - s.original_qty}`
                              : `+${s.original_qty - total}`}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        <input
                          type="text"
                          placeholder={s.damaged_qty > 0 ? 'e.g. dented, missing part' : ''}
                          disabled={s.damaged_qty === 0}
                          className="w-full h-7 text-xs rounded border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                          value={s.condition_notes}
                          onChange={(e) => setSplits((prev) => prev.map((p, j) =>
                            j === i ? { ...p, condition_notes: e.target.value } : p))}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {anyMismatch && (
            <p className="text-[11px] text-destructive">
              Every row&apos;s Good + Damaged must equal its Inspected qty.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" disabled={!canSubmit} onClick={handleSubmit}>
            {completeInspection.isPending ? 'Saving…' : 'Complete Inspection'}
          </Button>
        </div>
      </DialogContent>

      <AlertDialog open={confirmDamagedOpen} onOpenChange={setConfirmDamagedOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Mark {totalDamaged} unit{totalDamaged === 1 ? '' : 's'} as damaged?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This decision cannot be reversed after the return is restocked. Damaged units
              must be written off — the app does not yet have a repair or refurbishment flow.
              Only continue if you&apos;re certain these units are unrecoverable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back &amp; edit</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { setConfirmDamagedOpen(false); submitNow() }}
            >
              Confirm damaged
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
