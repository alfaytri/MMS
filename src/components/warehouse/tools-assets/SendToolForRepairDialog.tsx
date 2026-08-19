'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Wrench } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { Button } from '@/components/ui/button'
import { useRepairVendors } from '@/hooks/useRepairVendors'
import { useSendToolForRepair } from '@/hooks/useToolRepair'

/** Dispatch a bucket tool to a repair vendor — it moves to Out for Repair. */
export function SendToolForRepairDialog({ unit, onClose }: { unit: { id: string; label: string }; onClose: () => void }) {
  const { data: vendors = [], isLoading } = useRepairVendors({ activeOnly: true })
  const [vendorId, setVendorId] = useState('')
  const [expected, setExpected] = useState('')
  const [notes, setNotes] = useState('')
  const send = useSendToolForRepair()

  useEffect(() => { if (vendors.length === 1) setVendorId(vendors[0].id) }, [vendors])

  async function handleSend() {
    try {
      await send.mutateAsync({
        unitId: unit.id,
        vendorId,
        expectedReturnDate: expected || undefined,
        notes: notes.trim() || undefined,
      })
      toast.success(`${unit.label} sent for repair`)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send for repair')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full h-full sm:h-auto sm:max-w-md rounded-none sm:rounded-lg flex flex-col gap-0 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4 shrink-0 text-amber-600" /> Send {unit.label} to a vendor
          </DialogTitle>
          <DialogDescription>
            Dispatch this tool to a repair vendor. It moves to <strong>Out for Repair</strong> until it comes back.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto py-4 space-y-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">Repair vendor</label>
            <Select value={vendorId} onValueChange={(v) => setVendorId(v ?? '')} disabled={isLoading || vendors.length <= 1}>
              <SelectTrigger className="h-10 w-full">
                <SelectValue placeholder={isLoading ? 'Loading…' : 'Select vendor…'} />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isLoading && vendors.length === 0 && (
              <p className="text-xs text-muted-foreground">No active repair vendor yet. Add one on the Damaged Stock page.</p>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Expected return (optional)</label>
            <DatePicker value={expected} onChange={setExpected} placeholder="Pick a date" className="h-10" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Fault, invoice ref…"
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSend} disabled={!vendorId || send.isPending}>
            {send.isPending ? 'Sending…' : 'Send for repair'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
