'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCustomerAddresses } from '@/hooks/useCustomerAddresses'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ExternalLink } from 'lucide-react'
import type { CustomerAddress } from '@/types/orders'

type Mode = 'blue_plate' | 'coordinates'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  customerId: string
  phoneId: string
  onAdded: (address: CustomerAddress) => void
}

function googleMapsCoordUrl(lat: string, lng: string): string | null {
  const latNum = parseFloat(lat)
  const lngNum = parseFloat(lng)
  if (isNaN(latNum) || isNaN(lngNum)) return null
  return `https://www.google.com/maps?q=${latNum},${lngNum}`
}

function googleMapsPlateUrl(zone: string, street: string, building: string, unit: string): string | null {
  const parts = [
    building && `Building ${building}`,
    street && `Street ${street}`,
    zone && `Zone ${zone}`,
    unit && `Unit ${unit}`,
    'Qatar',
  ].filter(Boolean)
  if (parts.length <= 1) return null
  return `https://www.google.com/maps/search/${encodeURIComponent(parts.join(', '))}`
}

export function AddressCreationSheet({ open, onOpenChange, customerId, phoneId, onAdded }: Props) {
  const { addAddress } = useCustomerAddresses(customerId)

  const [mode, setMode] = useState<Mode>('blue_plate')
  const [label, setLabel] = useState('')

  // Blue Plate fields
  const [unitNo, setUnitNo] = useState('')
  const [buildingNo, setBuildingNo] = useState('')
  const [streetNo, setStreetNo] = useState('')
  const [zoneNo, setZoneNo] = useState('')

  // Coordinates fields
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')

  const coordsMapUrl = googleMapsCoordUrl(lat, lng)
  const plateMapUrl = googleMapsPlateUrl(zoneNo, streetNo, buildingNo, unitNo)

  function resetState() {
    setMode('blue_plate')
    setLabel('')
    setUnitNo(''); setBuildingNo(''); setStreetNo(''); setZoneNo('')
    setLat(''); setLng('')
  }

  async function handleSaveBluePlate() {
    if (!unitNo && !buildingNo && !streetNo && !zoneNo) {
      toast.error('Enter at least one address field')
      return
    }
    try {
      const address = await addAddress.mutateAsync({
        customer_id: customerId,
        phone_id: phoneId,
        label: label || null,
        address_type: 'blue_plate',
        blue_plate_no: null,
        unit_no: unitNo || null,
        building_no: buildingNo || null,
        street_no: streetNo || null,
        zone_no: zoneNo || null,
        lat: null, lng: null,
        is_primary: false,
      })
      onAdded(address)
      onOpenChange(false)
      resetState()
    } catch {
      toast.error('Failed to save address')
    }
  }

  async function handleSaveCoords() {
    const latNum = parseFloat(lat)
    const lngNum = parseFloat(lng)
    if (isNaN(latNum) || isNaN(lngNum)) {
      toast.error('Enter valid coordinates')
      return
    }
    try {
      const address = await addAddress.mutateAsync({
        customer_id: customerId,
        phone_id: phoneId,
        label: label || null,
        address_type: 'coordinates',
        blue_plate_no: null,
        unit_no: null, building_no: null, street_no: null, zone_no: null,
        lat: latNum, lng: lngNum,
        is_primary: false,
      })
      onAdded(address)
      onOpenChange(false)
      resetState()
    } catch {
      toast.error('Failed to save address')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetState() }}>
      <DialogContent className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Address</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">

          {/* Label */}
          <div className="space-y-1.5">
            <Label>
              Address Label{' '}
              <span className="font-normal text-slate-400">(optional)</span>
            </Label>
            <Input
              placeholder="e.g. Main Villa, Office Floor 3"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          {/* Mode toggle */}
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1 gap-1">
            {(['blue_plate', 'coordinates'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  'flex-1 rounded-md py-1.5 text-sm font-medium transition-colors',
                  mode === m
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                {m === 'blue_plate' ? 'Blue Plate' : 'Coordinates'}
              </button>
            ))}
          </div>

          {/* ── Blue Plate ── */}
          {mode === 'blue_plate' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Unit No.</Label>
                  <Input placeholder="5" value={unitNo} onChange={(e) => setUnitNo(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Building No.</Label>
                  <Input placeholder="58" value={buildingNo} onChange={(e) => setBuildingNo(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Street No.</Label>
                  <Input placeholder="662" value={streetNo} onChange={(e) => setStreetNo(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Zone No.</Label>
                  <Input placeholder="70" value={zoneNo} onChange={(e) => setZoneNo(e.target.value)} />
                </div>
              </div>

              {plateMapUrl && (
                <a
                  href={plateMapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Verify on Google Maps
                </a>
              )}

              <Button className="w-full" onClick={handleSaveBluePlate} disabled={addAddress.isPending}>
                {addAddress.isPending ? 'Saving…' : 'Save Address'}
              </Button>
            </div>
          )}

          {/* ── Coordinates ── */}
          {mode === 'coordinates' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Latitude</Label>
                  <Input placeholder="25.3764" value={lat} onChange={(e) => setLat(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Longitude</Label>
                  <Input placeholder="51.4480" value={lng} onChange={(e) => setLng(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-slate-400">
                  From Google Maps → right-click on location → "What's here?"
                </p>
                {coordsMapUrl && (
                  <a
                    href={coordsMapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Verify on Google Maps
                  </a>
                )}
              </div>

              <Button className="w-full" onClick={handleSaveCoords} disabled={addAddress.isPending}>
                {addAddress.isPending ? 'Saving…' : 'Save Address'}
              </Button>
            </div>
          )}

        </div>
      </DialogContent>
    </Dialog>
  )
}
