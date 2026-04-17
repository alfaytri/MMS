'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useCreateStockAdjustment } from '@/hooks/useWarehouseOperations'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WhAdjustmentDialog({ open, onOpenChange }: Props) {
  const { data: warehouses } = useWarehouses()
  const createAdjustment = useCreateStockAdjustment()
  const [warehouseId, setWarehouseId] = useState('')
  const [brandVariantId, setBrandVariantId] = useState('')
  const [adjustmentType, setAdjustmentType] = useState<'increase' | 'decrease' | 'set'>('increase')
  const [qty, setQty] = useState(0)
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')

  function reset() {
    setWarehouseId(''); setBrandVariantId(''); setQty(0); setReason(''); setNotes('')
  }

  function handleSubmit() {
    if (!warehouseId) { toast.error('Select a warehouse'); return }
    if (!brandVariantId.trim()) { toast.error('Enter a Brand Variant ID'); return }
    if (!reason.trim()) { toast.error('Reason is required'); return }

    createAdjustment.mutate(
      {
        warehouse_id: warehouseId,
        brand_variant_id: brandVariantId.trim(),
        adjustment_type: adjustmentType,
        qty,
        reason,
        notes: notes || null,
      },
      {
        onSuccess: () => {
          toast.success('Adjustment submitted for approval')
          onOpenChange(false)
          reset()
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-md sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>New Stock Adjustment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="adj-wh">Warehouse *</Label>
            <select
              id="adj-wh"
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
            <Label htmlFor="adj-bv">Brand Variant ID *</Label>
            <Input
              id="adj-bv"
              value={brandVariantId}
              onChange={(e) => setBrandVariantId(e.target.value)}
              placeholder="UUID of the brand variant"
            />
          </div>
          <div className="space-y-1">
            <Label>Adjustment Type *</Label>
            <div className="flex gap-2">
              {(['increase', 'decrease', 'set'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setAdjustmentType(t)}
                  className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium capitalize transition-colors ${
                    adjustmentType === t ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="adj-qty">Quantity *</Label>
            <Input
              id="adj-qty"
              type="number"
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="adj-reason">Reason *</Label>
            <Input
              id="adj-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Physical count discrepancy"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="adj-notes">Notes</Label>
            <Textarea
              id="adj-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createAdjustment.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createAdjustment.isPending}>
            {createAdjustment.isPending ? 'Submitting…' : 'Submit for Approval'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
