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
  const [bluePlateNo, setBluePlateNo] = useState('')
  const [fetched, setFetched] = useState<Awaited<ReturnType<typeof fetchByNumber.mutateAsync>> | null>(null)
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')

  async function handleFetchBluePlate() {
    try {
      const result = await fetchByNumber.mutateAsync(bluePlateNo.trim())
      setFetched(result)
    } catch {
      toast.error('Blue Plate not found — enter address manually or use coordinates')
    }
  }

  async function handleSaveBluePlate() {
    if (!fetched) return
    try {
      const address = await addAddress.mutateAsync({
        customer_id: customerId,
        phone_id: phoneId,
        label: label || null,
        address_type: 'blue_plate',
        blue_plate_no: bluePlateNo,
        unit_no: fetched.unit_no,
        building_no: fetched.building_no,
        street_no: fetched.street_no,
        zone_no: fetched.zone_no,
        lat: fetched.lat,
        lng: fetched.lng,
        is_primary: false,
      })
      onAdded(address)
      onOpenChange(false)
      setLabel(''); setBluePlateNo(''); setFetched(null)
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
      setLabel(''); setLat(''); setLng('')
    } catch {
      toast.error('Failed to save address')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add New Address</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label>Address Label (optional)</Label>
            <Input placeholder="e.g. Main Villa, Office Floor 3" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <Tabs defaultValue="blue_plate">
            <TabsList className="w-full">
              <TabsTrigger value="blue_plate" className="flex-1">Blue Plate</TabsTrigger>
              <TabsTrigger value="coordinates" className="flex-1">Coordinates</TabsTrigger>
            </TabsList>
            <TabsContent value="blue_plate" className="space-y-3 pt-3">
              <div className="flex gap-2">
                <Input placeholder="Blue Plate Number" value={bluePlateNo} onChange={(e) => setBluePlateNo(e.target.value)} />
                <Button variant="outline" onClick={handleFetchBluePlate} disabled={!bluePlateNo || fetchByNumber.isPending}>
                  {fetchByNumber.isPending ? 'Fetching…' : 'Fetch'}
                </Button>
              </div>
              {fetched && (
                <div className="rounded-md bg-slate-50 p-3 text-sm space-y-1">
                  <p><span className="text-slate-500">Unit:</span> {fetched.unit_no}</p>
                  <p><span className="text-slate-500">Building:</span> {fetched.building_no}</p>
                  <p><span className="text-slate-500">Street:</span> {fetched.street_no}</p>
                  <p><span className="text-slate-500">Zone:</span> {fetched.zone_no}</p>
                  <Button className="mt-2 w-full" onClick={handleSaveBluePlate} disabled={addAddress.isPending}>
                    Save Address
                  </Button>
                </div>
              )}
            </TabsContent>
            <TabsContent value="coordinates" className="space-y-3 pt-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Latitude</Label>
                  <Input placeholder="25.3764" value={lat} onChange={(e) => setLat(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Longitude</Label>
                  <Input placeholder="51.4480" value={lng} onChange={(e) => setLng(e.target.value)} />
                </div>
              </div>
              <Button className="w-full" onClick={handleSaveCoords} disabled={addAddress.isPending}>
                Save Address
              </Button>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  )
}
