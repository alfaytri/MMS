'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  GuardedDialog,
  type GuardedFormDialogHandle,
} from '@/components/shared/GuardedFormDialog'
import { useCreateShipment, type ShipmentMode } from '@/hooks/useShipments'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  poId: string
}

export function PoShipmentDialog({ open, onOpenChange, poId }: Props) {
  const createShipment = useCreateShipment()

  const [mode, setMode] = useState<ShipmentMode>('air')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [saving, setSaving] = useState(false)
  const guardRef = useRef<GuardedFormDialogHandle>(null)

  useEffect(() => {
    if (open) {
      setMode('air')
      setTrackingNumber('')
    }
  }, [open])

  // Dirty when the operator changes the mode away from 'air' default or
  // types anything into the tracking-number field.
  const isDirty = mode !== 'air' || trackingNumber.trim().length > 0

  async function submit() {
    if (!trackingNumber.trim()) { toast.error('Tracking number is required'); return }
    setSaving(true)
    try {
      await createShipment.mutateAsync({
        po_id: poId,
        mode,
        tracking_number: trackingNumber,
      })
      toast.success('Shipment created')
      guardRef.current?.closeAfterSubmit()
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Failed to create shipment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <GuardedDialog open={open} onOpenChange={onOpenChange} isDirty={isDirty} ref={guardRef}>
      <DialogContent className="max-w-md w-full">
        <DialogHeader>
          <DialogTitle>Create Shipment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="pos-mode">Mode *</Label>
            <Select value={mode} onValueChange={(v) => setMode((v ?? 'air') as ShipmentMode)}>
              <SelectTrigger id="pos-mode"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto">
                <SelectItem value="air">Air</SelectItem>
                <SelectItem value="sea">Sea</SelectItem>
                <SelectItem value="land">Land</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="pos-tracking">Tracking Number *</Label>
            <Input id="pos-tracking" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="TRK-12345" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => guardRef.current?.requestClose()}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Creating…' : 'Create Shipment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </GuardedDialog>
  )
}
