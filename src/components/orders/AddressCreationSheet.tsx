'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useBlueplate } from '@/hooks/useBlueplate'
import { useCustomerAddresses } from '@/hooks/useCustomerAddresses'
import { toast } from 'sonner'
import type { CustomerAddress } from '@/types/orders'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  customerId: string
  phoneId: string
  onAdded: (address: CustomerAddress) => void
}

export function AddressCreationSheet({ open, onOpenChange, customerId, phoneId, onAdded }: Props) {
  const { fetchByNumber } = useBlueplate()
  const { addAddress } = useCustomerAddresses(phoneId)

  const [label, setLabel] = useState('')

  // Blue Plate tab
  const [bluePlateNo, setBluePlateNo] = useState('')
  const [unitNo, setUnitNo] = useState('')
  const [buildingNo, setBuildingNo] = useState('')
  const [streetNo, setStreetNo] = useState('')
  const [zoneNo, setZoneNo] = useState('')
  const [showManual, setShowManual] = useState(false)

  // Coordinates tab
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')

  function resetState() {
    setLabel('')
    setBluePlateNo(''); setUnitNo(''); setBuildingNo(''); setStreetNo(''); setZoneNo(''); setShowManual(false)
    setLat(''); setLng('')
  }

  async function handleFetch() {
    if (!bluePlateNo.trim()) return
    try {
      const result = await fetchByNumber.mutateAsync(bluePlateNo.trim())
      setUnitNo(result.unit_no ?? '')
      setBuildingNo(result.building_no ?? '')
      setStreetNo(result.street_no ?? '')
      setZoneNo(result.zone_no ?? '')
      setShowManual(true)
      toast.success('Address fetched — review and save')
    } catch {
      setShowManual(true)
      toast.error('Lookup failed — enter details manually')
    }
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
        blue_plate_no: bluePlateNo || null,
        unit_no: unitNo || null,
        building_no: buildingNo || null,
        street_no: streetNo || null,
        zone_no: zoneNo || null,
        lat: null,
        lng: null,
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
        lat: latNum,
        lng: lngNum,
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

        <div className="space-y-4">
          {/* Label */}
          <div className="space-y-1.5">
            <Label>Address Label (optional)</Label>
            <Input
              placeholder="e.g. Main Villa, Office Floor 3"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <Tabs defaultValue="blue_plate">
            <TabsList className="w-full">
              <TabsTrigger value="blue_plate" className="flex-1">Blue Plate</TabsTrigger>
              <TabsTrigger value="coordinates" className="flex-1">Coordinates</TabsTrigger>
            </TabsList>

            {/* Blue Plate */}
            <TabsContent value="blue_plate" className="space-y-3 pt-4">
              <div className="space-y-1.5">
                <Label>Blue Plate Number</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g. 32662-5-58-70"
                    value={bluePlateNo}
                    onChange={(e) => setBluePlateNo(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={handleFetch}
                    disabled={!bluePlateNo.trim() || fetchByNumber.isPending}
                    className="shrink-0"
                  >
                    {fetchByNumber.isPending ? 'Fetching…' : 'Fetch'}
                  </Button>
                </div>
                <p className="text-xs text-slate-400">
                  Fetches from Qatar Municipality, or enter manually below.
                </p>
              </div>

              {!showManual && (
                <button
                  type="button"
                  onClick={() => setShowManual(true)}
                  className="text-sm text-slate-500 underline-offset-2 hover:underline"
                >
                  Skip — enter address manually
                </button>
              )}

              {showManual && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Unit No.</Label>
                      <Input placeholder="5" value={unitNo} onChange={(e) => setUnitNo(e.target.value)} className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Building No.</Label>
                      <Input placeholder="58" value={buildingNo} onChange={(e) => setBuildingNo(e.target.value)} className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Street No.</Label>
                      <Input placeholder="662" value={streetNo} onChange={(e) => setStreetNo(e.target.value)} className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Zone No.</Label>
                      <Input placeholder="70" value={zoneNo} onChange={(e) => setZoneNo(e.target.value)} className="h-9" />
                    </div>
                  </div>
                  <Button className="w-full" onClick={handleSaveBluePlate} disabled={addAddress.isPending}>
                    {addAddress.isPending ? 'Saving…' : 'Save Address'}
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* Coordinates */}
            <TabsContent value="coordinates" className="space-y-3 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Latitude</Label>
                  <Input placeholder="25.3764" value={lat} onChange={(e) => setLat(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Longitude</Label>
                  <Input placeholder="51.4480" value={lng} onChange={(e) => setLng(e.target.value)} />
                </div>
              </div>
              <p className="text-xs text-slate-400">
                Paste from Google Maps → right-click → "What's here?"
              </p>
              <Button className="w-full" onClick={handleSaveCoords} disabled={addAddress.isPending}>
                {addAddress.isPending ? 'Saving…' : 'Save Address'}
              </Button>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}
