'use client'
import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
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

  // Blue Plate tab state
  const [bluePlateNo, setBluePlateNo] = useState('')
  const [unitNo, setUnitNo] = useState('')
  const [buildingNo, setBuildingNo] = useState('')
  const [streetNo, setStreetNo] = useState('')
  const [zoneNo, setZoneNo] = useState('')
  const [bpFetched, setBpFetched] = useState(false)

  // Coordinates tab state
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')

  function resetState() {
    setLabel('')
    setBluePlateNo(''); setUnitNo(''); setBuildingNo(''); setStreetNo(''); setZoneNo(''); setBpFetched(false)
    setLat(''); setLng('')
  }

  async function handleFetchBluePlate() {
    if (!bluePlateNo.trim()) return
    try {
      const result = await fetchByNumber.mutateAsync(bluePlateNo.trim())
      setUnitNo(result.unit_no ?? '')
      setBuildingNo(result.building_no ?? '')
      setStreetNo(result.street_no ?? '')
      setZoneNo(result.zone_no ?? '')
      setBpFetched(true)
      toast.success('Address fetched — review and save')
    } catch {
      toast.error('Blue Plate lookup failed — enter details manually below')
      setBpFetched(true)
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
    <Sheet open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetState() }}>
      <SheetContent side="bottom" className="h-auto max-h-[90vh] rounded-t-2xl overflow-y-auto sm:side-right sm:h-full sm:max-h-full sm:rounded-none sm:max-w-md">
        <SheetHeader className="mb-4">
          <SheetTitle>Add New Address</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 pb-6">
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

            {/* ── Blue Plate tab ── */}
            <TabsContent value="blue_plate" className="space-y-3 pt-4">
              <div className="space-y-1.5">
                <Label>Blue Plate Number</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g. 32662-5-58-70"
                    value={bluePlateNo}
                    onChange={(e) => setBluePlateNo(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleFetchBluePlate()}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={handleFetchBluePlate}
                    disabled={!bluePlateNo.trim() || fetchByNumber.isPending}
                    className="shrink-0"
                  >
                    {fetchByNumber.isPending ? 'Fetching…' : 'Fetch'}
                  </Button>
                </div>
                <p className="text-xs text-slate-400">
                  Fetches unit/zone from Qatar Municipality. Or enter fields manually below.
                </p>
              </div>

              {/* Manual fields — always visible once user clicks Fetch or types a plate */}
              {(bpFetched || bluePlateNo) && (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
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
                  <Button
                    className="w-full"
                    onClick={handleSaveBluePlate}
                    disabled={addAddress.isPending}
                  >
                    {addAddress.isPending ? 'Saving…' : 'Save Address'}
                  </Button>
                </div>
              )}

              {!bpFetched && !bluePlateNo && (
                <Button
                  variant="ghost"
                  className="w-full text-slate-400 text-sm"
                  onClick={() => setBpFetched(true)}
                >
                  Skip — enter address manually
                </Button>
              )}
            </TabsContent>

            {/* ── Coordinates tab ── */}
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
                Paste coordinates from Google Maps (right-click → "What's here?")
              </p>
              <Button className="w-full" onClick={handleSaveCoords} disabled={addAddress.isPending}>
                {addAddress.isPending ? 'Saving…' : 'Save Address'}
              </Button>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  )
}
