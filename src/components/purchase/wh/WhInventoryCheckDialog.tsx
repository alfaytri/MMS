'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useWarehouses } from '@/hooks/useWarehouses'
import {
  useInventoryCheck,
  useCreateInventoryCheck,
  useUpdateInventoryCheckItem,
  useSubmitInventoryCheck,
  useReviewInventoryCheck,
} from '@/hooks/useWarehouseOperations'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  checkId: string | null // null = create mode
}

export function WhInventoryCheckDialog({ open, onOpenChange, checkId }: Props) {
  const { data: warehouses } = useWarehouses()
  const createCheck = useCreateInventoryCheck()
  const updateItem = useUpdateInventoryCheckItem()
  const submitCheck = useSubmitInventoryCheck()
  const reviewCheck = useReviewInventoryCheck()
  const { data: check, isLoading: checkLoading } = useInventoryCheck(checkId ?? '')

  const [warehouseId, setWarehouseId] = useState('')
  const [notes, setNotes] = useState('')

  const isCreateMode = !checkId

  function handleCreate() {
    const wh = (warehouses ?? []).find((w: any) => w.id === warehouseId) as any
    if (!wh) { toast.error('Select a warehouse'); return }
    createCheck.mutate(
      { warehouseId, warehouseName: wh.name, notes: notes || null },
      {
        onSuccess: () => {
          toast.success('Inventory check created')
          onOpenChange(false)
          setWarehouseId(''); setNotes('')
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleUpdateItem(itemId: string, countedQty: number) {
    updateItem.mutate(
      { id: itemId, countedQty },
      { onError: (err) => toast.error(err.message) }
    )
  }

  function handleSubmit() {
    if (!checkId) return
    submitCheck.mutate(
      { id: checkId, submittedByName: 'Warehouse Staff' },
      {
        onSuccess: () => { toast.success('Check submitted for review'); onOpenChange(false) },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleReview() {
    if (!checkId) return
    reviewCheck.mutate(
      { id: checkId, reviewedByName: 'Manager' },
      {
        onSuccess: () => { toast.success('Check reviewed'); onOpenChange(false) },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {isCreateMode ? 'New Inventory Check' : `Check ${check?.check_number ?? '…'}`}
          </DialogTitle>
        </DialogHeader>

        {isCreateMode ? (
          <>
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label htmlFor="chk-wh">Warehouse *</Label>
                <select
                  id="chk-wh"
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  <option value="">Select warehouse…</option>
                  {(warehouses ?? []).map((w: any) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="chk-notes">Notes</Label>
                <Input
                  id="chk-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes…"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createCheck.isPending}>
                {createCheck.isPending ? 'Creating…' : 'Create Check'}
              </Button>
            </DialogFooter>
          </>
        ) : checkLoading ? (
          <div className="space-y-2 py-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : check ? (
          <>
            <div className="flex-1 overflow-y-auto space-y-3 py-2">
              <div className="flex items-center gap-3">
                <Badge variant="outline">{check.status}</Badge>
                <span className="text-sm text-muted-foreground">{check.warehouse_name}</span>
              </div>
              {(check.items ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No items in this check — items are added automatically based on current stock
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-3">
                    <div className="col-span-5">Item</div>
                    <div className="col-span-2 text-right">System</div>
                    <div className="col-span-3 text-right">Counted</div>
                    <div className="col-span-2 text-right">Variance</div>
                  </div>
                  {(check.items ?? []).map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        'grid grid-cols-12 gap-2 items-center rounded-md border px-3 py-2',
                        item.variance !== null && item.variance !== 0 && 'border-warning/50 bg-warning/5'
                      )}
                    >
                      <div className="col-span-5 min-w-0">
                        <div className="text-sm font-medium truncate">{item.item_name}</div>
                        {item.sku && <div className="text-xs text-muted-foreground">{item.sku}</div>}
                      </div>
                      <div className="col-span-2 text-right text-sm font-medium">{item.system_qty}</div>
                      <div className="col-span-3">
                        <Input
                          type="number"
                          min="0"
                          defaultValue={item.counted_qty ?? ''}
                          onBlur={(e) => {
                            const val = Number(e.target.value)
                            if (val !== item.counted_qty) handleUpdateItem(item.id, val)
                          }}
                          className="h-8 text-right text-sm"
                          disabled={check.status !== 'draft'}
                          placeholder="—"
                        />
                      </div>
                      <div className={cn(
                        'col-span-2 text-right text-sm font-semibold',
                        item.variance === null ? 'text-muted-foreground' :
                        item.variance === 0 ? 'text-muted-foreground' :
                        item.variance > 0 ? 'text-success' : 'text-destructive'
                      )}>
                        {item.variance === null ? '—' : item.variance > 0 ? `+${item.variance}` : item.variance}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {check.review_notes && (
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                  Review notes: {check.review_notes}
                </div>
              )}
            </div>
            <DialogFooter className="shrink-0">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              {check.status === 'draft' && (
                <Button onClick={handleSubmit} disabled={submitCheck.isPending}>
                  {submitCheck.isPending ? 'Submitting…' : 'Submit for Review'}
                </Button>
              )}
              {check.status === 'submitted' && (
                <Button onClick={handleReview} disabled={reviewCheck.isPending}>
                  {reviewCheck.isPending ? 'Reviewing…' : 'Mark as Reviewed'}
                </Button>
              )}
            </DialogFooter>
          </>
        ) : (
          <div className="py-8 text-center text-muted-foreground text-sm">Inventory check not found</div>
        )}
      </DialogContent>
    </Dialog>
  )
}
