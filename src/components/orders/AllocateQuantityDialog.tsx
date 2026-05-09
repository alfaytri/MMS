// src/components/orders/AllocateQuantityDialog.tsx
'use client'
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { OrderServiceDraft } from '@/types/orders'

interface Allocation {
  teamId: string
  teamName: string
  timeSlot: string
  qty: number
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  service: OrderServiceDraft
  teamId: string
  teamName: string
  timeSlot: string
  onConfirm: (allocations: Allocation[]) => void
}

export function AllocateQuantityDialog({
  open,
  onOpenChange,
  service,
  teamId,
  teamName,
  timeSlot,
  onConfirm,
}: Props) {
  const [thisQty, setThisQty] = useState(service.qty)

  function handleConfirm() {
    onConfirm([{ teamId, teamName, timeSlot, qty: thisQty }])
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Allocate Quantity</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-slate-600">
            Assigning <strong>{service.serviceName}</strong> (total qty:{' '}
            {service.qty}) to <strong>{teamName}</strong> at{' '}
            <strong>{timeSlot}</strong>
          </p>
          <div className="flex items-center gap-3">
            <label className="w-24 text-sm text-slate-500">Qty to assign</label>
            <Input
              type="number"
              min={1}
              max={service.qty}
              value={thisQty}
              onChange={(e) =>
                setThisQty(
                  Math.min(
                    service.qty,
                    Math.max(1, parseInt(e.target.value) || 1),
                  )
                )
              }
              className="w-20 text-center"
            />
            <span className="text-sm text-slate-400">/ {service.qty}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>Assign {thisQty}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
