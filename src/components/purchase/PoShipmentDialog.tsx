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

  function reset() {
    setMode('air'); setTrackingNumber('')
  }

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
      reset()
      onOpenChange(false)
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Failed to create shipment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-full">
        <DialogHeader>
          <DialogTitle>Create Shipment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="pos-mode">Mode *</Label>
            <Select value={mode} onValueChange={(v) => setMode((v ?? 'air') as ShipmentMode)}>
              <SelectTrigger id="pos-mode"><SelectValue /></SelectTrigger>
              <SelectContent>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Creating…' : 'Create Shipment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
