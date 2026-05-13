'use client'

import { useState } from 'react'
import { MapPin, AlertTriangle, Plus, GripVertical, Navigation } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import type { useAddressState, CustomerAddress, AddressFormData } from '@/hooks/contact-center/useAddressState'

type AddressStateReturn = ReturnType<typeof useAddressState>

export function AddressSection({ addressState }: { addressState: AddressStateReturn }) {
  const { addresses, addingAddress, setAddingAddress, geocodingWarning, setGeocodingWarning, addAddress } = addressState
  const [step, setStep] = useState<1 | 2>(1)
  const [addrType, setAddrType] = useState<'blue_plate' | 'google_coords'>('blue_plate')
  const [form, setForm] = useState({ unit: '', building: '', street: '', zone: '', lat: '', lng: '', label: '' })

  function resetForm() {
    setStep(1)
    setForm({ unit: '', building: '', street: '', zone: '', lat: '', lng: '', label: '' })
    setGeocodingWarning(false)
  }

  async function handleSave() {
    const data: AddressFormData = addrType === 'blue_plate'
      ? {
          type: 'blue_plate',
          unit: form.unit || undefined,
          building: form.building,
          street: form.street,
          zone: form.zone,
          label: form.label || undefined,
        }
      : {
          type: 'google_coords',
          lat: parseFloat(form.lat),
          lng: parseFloat(form.lng),
          label: form.label || undefined,
        }

    if (addrType === 'blue_plate' && (!form.building || !form.street || !form.zone)) {
      toast.error('Building, Street, and Zone are required')
      return
    }
    if (addrType === 'google_coords') {
      const latNum = parseFloat(form.lat)
      const lngNum = parseFloat(form.lng)
      if (isNaN(latNum) || isNaN(lngNum) || Math.abs(latNum) > 90 || Math.abs(lngNum) > 180) {
        toast.error('Invalid coordinates. Use format: 25.2854, 51.5310')
        return
      }
    }

    try {
      await addAddress.mutateAsync(data)
      resetForm()
      toast.success('Address saved')
    } catch {
      toast.error('Failed to save address')
    }
  }

  function handleDragStart(e: React.DragEvent, address: CustomerAddress) {
    e.dataTransfer.setData('application/mms-address', JSON.stringify(address))
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div className="px-3 py-2 space-y-2">
      {addresses.map((a) => {
        const autoLabel = [
          a.building ? `B${a.building}` : '',
          a.street   ? `S${a.street}`   : '',
          a.zone     ? `Z${a.zone}`     : '',
        ].filter(Boolean).join(' ') || 'Address'
        const displayLabel = a.label ?? autoLabel

        const coordText = a.lat && a.lng
          ? `${Number(a.lat).toFixed(5)}, ${Number(a.lng).toFixed(5)}`
          : null

        return (
          <div
            key={a.id}
            draggable
            onDragStart={(e) => handleDragStart(e, a)}
            className="flex items-start gap-2 rounded-md border border-border p-2 cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0 space-y-0.5">
              {/* Label row */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                <span className="text-xs font-medium">{displayLabel}</span>
                {a.is_primary && <Badge variant="secondary" className="text-[10px] py-0 px-1 h-4">primary</Badge>}
              </div>

              {/* Blue plate details */}
              {a.address_type === 'blue_plate' && (a.building || a.street || a.zone) && (
                <p className="text-[11px] text-muted-foreground font-mono pl-4">
                  {[a.unit ? `U${a.unit}` : '', a.building ? `B${a.building}` : '', a.street ? `S${a.street}` : '', a.zone ? `Z${a.zone}` : ''].filter(Boolean).join(' · ')}
                </p>
              )}

              {/* Coordinates */}
              {coordText && (
                <p className="text-[11px] text-muted-foreground font-mono pl-4">{coordText}</p>
              )}

              {/* No GPS warning */}
              {!a.is_geocoded && (
                <div className="flex items-center gap-1 pl-4">
                  <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0" />
                  <span className="text-[11px] text-amber-600">No GPS coords</span>
                </div>
              )}

              {/* Waze link */}
              {a.waze_link && (
                <a
                  href={a.waze_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 pl-4 text-[11px] text-blue-600 hover:text-blue-700 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Navigation className="h-2.5 w-2.5" />
                  Open in Waze
                </a>
              )}
            </div>
          </div>
        )
      })}

      {!addingAddress && (
        <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={() => setAddingAddress(true)}>
          <Plus className="h-3 w-3 mr-1" /> Add address
        </Button>
      )}

      {addingAddress && step === 1 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Address type</p>
          <div className="flex gap-2">
            <button
              className={`flex-1 rounded-md border p-2 text-xs text-center transition-colors ${addrType === 'blue_plate' ? 'border-primary bg-primary/5 text-primary' : 'border-border'}`}
              onClick={() => setAddrType('blue_plate')}
            >
              Blue Plate
            </button>
            <button
              className={`flex-1 rounded-md border p-2 text-xs text-center transition-colors ${addrType === 'google_coords' ? 'border-primary bg-primary/5 text-primary' : 'border-border'}`}
              onClick={() => setAddrType('google_coords')}
            >
              Google Coords
            </button>
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" className="flex-1 h-7 text-xs" onClick={() => setStep(2)}>Next</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setAddingAddress(false); resetForm() }}>Cancel</Button>
          </div>
        </div>
      )}

      {addingAddress && step === 2 && addrType === 'blue_plate' && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <Label className="text-xs">Unit</Label>
              <Input value={form.unit} onChange={(e) => setForm(f => ({ ...f, unit: e.target.value }))} className="h-7 text-xs" placeholder="Optional" />
            </div>
            <div>
              <Label className="text-xs">Building *</Label>
              <Input value={form.building} onChange={(e) => setForm(f => ({ ...f, building: e.target.value }))} className="h-7 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Street *</Label>
              <Input value={form.street} onChange={(e) => setForm(f => ({ ...f, street: e.target.value }))} className="h-7 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Zone *</Label>
              <Input value={form.zone} onChange={(e) => setForm(f => ({ ...f, zone: e.target.value }))} className="h-7 text-xs" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Label (optional)</Label>
            <Input value={form.label} onChange={(e) => setForm(f => ({ ...f, label: e.target.value }))} className="h-7 text-xs" placeholder="e.g. Home" />
          </div>
          {geocodingWarning && (
            <div className="flex items-center gap-1.5 rounded bg-amber-50 border border-amber-200 px-2 py-1.5 text-xs text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              Coordinates unavailable — saved without GPS
            </div>
          )}
          <div className="flex gap-1.5">
            <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleSave} disabled={addAddress.isPending}>
              {addAddress.isPending ? 'Saving…' : 'Save'}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setStep(1)}>Back</Button>
          </div>
        </div>
      )}

      {addingAddress && step === 2 && addrType === 'google_coords' && (
        <div className="space-y-2">
          <div>
            <Label className="text-xs">Coordinates *</Label>
            <Input
              value={`${form.lat}${form.lat && form.lng ? ', ' : ''}${form.lng}`}
              onChange={(e) => {
                const parts = e.target.value.split(',').map(s => s.trim())
                setForm(f => ({ ...f, lat: parts[0] ?? '', lng: parts[1] ?? '' }))
              }}
              className="h-7 text-xs font-mono"
              placeholder="25.2854, 51.5310"
            />
            <p className="text-xs text-muted-foreground mt-0.5">lat, lng format e.g. 25.2854, 51.5310</p>
          </div>
          <div>
            <Label className="text-xs">Label (optional)</Label>
            <Input value={form.label} onChange={(e) => setForm(f => ({ ...f, label: e.target.value }))} className="h-7 text-xs" placeholder="e.g. Office" />
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleSave} disabled={addAddress.isPending}>
              {addAddress.isPending ? 'Saving…' : 'Save'}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setStep(1)}>Back</Button>
          </div>
        </div>
      )}
    </div>
  )
}
