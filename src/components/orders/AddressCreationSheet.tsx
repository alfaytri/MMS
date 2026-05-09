'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCustomerAddresses } from '@/hooks/useCustomerAddresses'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ExternalLink, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import type { CustomerAddress } from '@/types/orders'

type Mode = 'blue_plate' | 'coordinates'
type VerifyState = 'idle' | 'loading' | 'found' | 'not_found' | 'error'

interface QnasResult { lat: number; lng: number }

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  customerId: string
  phoneId: string
  onAdded: (address: CustomerAddress) => void
}

function googleMapsCoordUrl(lat: number | string, lng: number | string): string {
  return `https://www.google.com/maps?q=${lat},${lng}`
}

function wazeUrl(lat: number, lng: number): string {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
}

export function AddressCreationSheet({ open, onOpenChange, customerId, phoneId, onAdded }: Props) {
  const { addAddress } = useCustomerAddresses(customerId)

  const [mode, setMode] = useState<Mode>('blue_plate')
  const [label, setLabel] = useState('')

  // Blue Plate fields
  const [buildingNo, setBuildingNo] = useState('')
  const [streetNo, setStreetNo] = useState('')
  const [zoneNo, setZoneNo] = useState('')

  // QNAS verification state
  const [verifyState, setVerifyState] = useState<VerifyState>('idle')
  const [qnasResult, setQnasResult] = useState<QnasResult | null>(null)

  // Coordinates fields
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')

  const coordsMapUrl = (lat && lng) ? googleMapsCoordUrl(lat, lng) : null

  // Reset QNAS state when blue plate fields change
  function onBluePlateChange(setter: (v: string) => void, value: string) {
    setter(value)
    setVerifyState('idle')
    setQnasResult(null)
  }

  async function handleVerifyQnas() {
    if (!zoneNo || !streetNo || !buildingNo) {
      toast.error('Enter Zone, Street, and Building to verify')
      return
    }
    setVerifyState('loading')
    setQnasResult(null)
    try {
      const res = await fetch(
        `/api/qnas/lookup?zone=${encodeURIComponent(zoneNo)}&street=${encodeURIComponent(streetNo)}&building=${encodeURIComponent(buildingNo)}`
      )
      const data = await res.json()
      if (!res.ok || data.error) {
        setVerifyState('error')
        return
      }
      if (data.found) {
        setVerifyState('found')
        setQnasResult({ lat: data.lat, lng: data.lng })
      } else {
        setVerifyState('not_found')
      }
    } catch {
      setVerifyState('error')
    }
  }

  function resetState() {
    setMode('blue_plate')
    setLabel('')
    setBuildingNo(''); setStreetNo(''); setZoneNo('')
    setLat(''); setLng('')
    setVerifyState('idle')
    setQnasResult(null)
  }

  async function handleSaveBluePlate() {
    if (!buildingNo && !streetNo && !zoneNo) {
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
        unit_no: null,
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
                  <Label>Zone No.</Label>
                  <Input placeholder="35" value={zoneNo} onChange={(e) => onBluePlateChange(setZoneNo, e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Street No.</Label>
                  <Input placeholder="877" value={streetNo} onChange={(e) => onBluePlateChange(setStreetNo, e.target.value)} />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Building No.</Label>
                  <Input placeholder="41" value={buildingNo} onChange={(e) => onBluePlateChange(setBuildingNo, e.target.value)} />
                </div>
              </div>

              {/* QNAS Verification */}
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleVerifyQnas}
                  disabled={verifyState === 'loading' || !zoneNo || !streetNo || !buildingNo}
                >
                  {verifyState === 'loading' ? (
                    <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Verifying…</>
                  ) : (
                    'Verify on Qatar National Address System'
                  )}
                </Button>

                {verifyState === 'found' && qnasResult && (
                  <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-green-700">
                      <CheckCircle2 className="h-4 w-4" />
                      Address verified
                    </div>
                    <p className="text-xs text-green-600">
                      {qnasResult.lat.toFixed(6)}, {qnasResult.lng.toFixed(6)}
                    </p>
                    <div className="flex gap-3">
                      <a
                        href={googleMapsCoordUrl(qnasResult.lat, qnasResult.lng)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-green-700 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Google Maps
                      </a>
                      <a
                        href={wazeUrl(qnasResult.lat, qnasResult.lng)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-green-700 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Waze
                      </a>
                    </div>
                  </div>
                )}

                {verifyState === 'not_found' && (
                  <div className="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    <XCircle className="h-4 w-4 shrink-0" />
                    Address not found in Qatar national database
                  </div>
                )}

                {verifyState === 'error' && (
                  <p className="text-xs text-slate-500">
                    Could not reach QNAS service. You can still save the address.
                  </p>
                )}
              </div>

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

              {coordsMapUrl && (
                <div className="flex gap-3">
                  <a
                    href={coordsMapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Google Maps
                  </a>
                  <a
                    href={wazeUrl(parseFloat(lat), parseFloat(lng))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Waze
                  </a>
                </div>
              )}

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
