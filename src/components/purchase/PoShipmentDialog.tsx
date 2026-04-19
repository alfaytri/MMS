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
import { useCreateShipment, type ShipmentMode, type CreateShipmentPayload } from '@/hooks/useShipments'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  poId: string
}

export function PoShipmentDialog({ open, onOpenChange, poId }: Props) {
  const createShipment = useCreateShipment()

  const [mode, setMode] = useState<ShipmentMode>('air')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [carrier, setCarrier] = useState('')
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [etd, setEtd] = useState('')
  const [eta, setEta] = useState('')
  const [saving, setSaving] = useState(false)

  function reset() {
    setMode('air'); setTrackingNumber(''); setCarrier('')
    setOrigin(''); setDestination(''); setEtd(''); setEta('')
  }

  async function submit() {
    setSaving(true)
    try {
      const payload: CreateShipmentPayload = {
        po_id: poId,
        mode,
        tracking_number: trackingNumber,
        carrier,
        origin: origin || null,
        destination: destination || null,
        etd: etd || null,
        eta: eta || null,
      }
      await createShipment.mutateAsync(payload)
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
            <Label>Mode *</Label>
            <Select value={mode} onValueChange={(v) => setMode((v ?? 'air') as ShipmentMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="air">Air</SelectItem>
                <SelectItem value="sea">Sea</SelectItem>
                <SelectItem value="land">Land</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Tracking Number *</Label>
            <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="TRK-12345" />
          </div>
          <div className="space-y-1">
            <Label>Carrier *</Label>
            <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="DHL, FedEx…" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Origin</Label>
              <Input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Dubai" />
            </div>
            <div className="space-y-1">
              <Label>Destination</Label>
              <Input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Doha" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>ETD</Label>
              <Input type="date" value={etd} onChange={(e) => setEtd(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>ETA</Label>
              <Input type="date" value={eta} onChange={(e) => setEta(e.target.value)} />
            </div>
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
