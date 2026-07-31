'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Wrench } from 'lucide-react'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useRepairVendors } from '@/hooks/useRepairVendors'
import { useSendDamagedForRepair } from '@/hooks/useSendDamagedForRepair'

interface SendForRepairDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dispositionId: string
  warehouseId: string
  warehouseName?: string | null
  itemName?: string | null
  qty?: number | null
  returnId?: string | null
  onComplete?: () => void
}

/**
 * Step 2 of the send-for-repair flow. The disposition row already exists
 * (created by ReplacementDeliveryDialog / Record Inventory Disposition with
 * warehouse_transfer_id NULL); this dialog collects the vendor + expected
 * return date and fires rpc_send_damaged_for_repair to create the outbound
 * transfer.
 *
 * Vendor dropdown uses `vendor.name` for display (per Dropdown UUID Guard)
 * and filters to `is_active=true`. Date defaults to today + 7 days.
 */
export function SendForRepairDialog({
  open, onOpenChange, dispositionId, warehouseId, warehouseName, itemName, qty, returnId, onComplete,
}: SendForRepairDialogProps) {
  const { data: vendors = [], isLoading: vendorsLoading } = useRepairVendors({ activeOnly: true })
  const send = useSendDamagedForRepair()

  const [vendorId, setVendorId] = useState('')
  const [expectedReturn, setExpectedReturn] = useState<string>(() => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return d.toISOString().slice(0, 10)
  })
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!open) {
      setVendorId('')
      setNotes('')
      const d = new Date()
      d.setDate(d.getDate() + 7)
      setExpectedReturn(d.toISOString().slice(0, 10))
    }
  }, [open])

  const singleVendor = vendors.length === 1
  useEffect(() => {
    if (open && singleVendor && !vendorId) setVendorId(vendors[0].id)
  }, [open, singleVendor, vendors, vendorId])

  const canSubmit = !!vendorId && !!expectedReturn && !!dispositionId && !!warehouseId

  function handleSubmit() {
    send.mutate(
      {
        dispositionId,
        repairVendorId: vendorId,
        warehouseId,
        expectedReturnDate: expectedReturn,
        notes: notes.trim() || null,
        returnId,
      },
      {
        onSuccess: () => {
          toast.success('Sent for repair — transfer created')
          onOpenChange(false)
          onComplete?.()
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-md sm:rounded-lg p-0 flex flex-col max-h-[90vh] overflow-hidden">
        <div className="px-6 pt-6 flex-shrink-0">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2">
              <Wrench className="h-4 w-4 text-orange-600" />
              Send for Repair
            </DialogTitle>
            <div className="text-xs text-muted-foreground mt-1 space-y-0.5 min-h-8">
              {itemName && <div className="truncate">{itemName}{qty ? ` — ${qty} unit${qty === 1 ? '' : 's'}` : ''}</div>}
              {warehouseName && <div>From: <span className="text-foreground">{warehouseName}</span></div>}
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 pb-4 space-y-5 overflow-y-auto flex-1 min-h-0">
          <div className="space-y-2">
            <Label htmlFor="sfr-vendor">Repair Vendor *</Label>
            <Select
              value={vendorId}
              onValueChange={setVendorId}
              disabled={vendorsLoading || vendors.length === 0}
            >
              <SelectTrigger id="sfr-vendor" className="w-full h-10">
                <SelectValue placeholder={vendorsLoading ? 'Loading vendors…' : vendors.length === 0 ? 'No active vendors — add one first' : 'Select vendor'} />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!vendorsLoading && vendors.length === 0 && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                Add a repair vendor at <span className="font-mono">/warehouse/repair-vendors</span> before sending units for repair.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="sfr-date">Expected Return Date *</Label>
            <Input
              id="sfr-date"
              type="date"
              value={expectedReturn}
              onChange={(e) => setExpectedReturn(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              className="w-full h-10"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sfr-notes">Notes</Label>
            <Textarea
              id="sfr-notes"
              rows={3}
              className="resize-none"
              placeholder="Damage description, quoted repair cost, contact person…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 border-t bg-background px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={send.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || send.isPending}>
            {send.isPending ? 'Sending...' : 'Send for Repair'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
