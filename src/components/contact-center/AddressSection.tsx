'use client'

import { useState } from 'react'
import { MapPin, AlertTriangle, Plus, GripVertical, Navigation, Pencil, CheckCircle2, XCircle, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import type { useAddressState, CustomerAddress, AddressFormData } from '@/hooks/contact-center/useAddressState'

type AddressStateReturn = ReturnType<typeof useAddressState>

interface ValidationResult {
  lat: number
  lng: number
  waze_link: string
}

interface AddressFormProps {
  initial?: CustomerAddress
  existingCount: number
  validateBluePlate: AddressStateReturn['validateBluePlate']
  onSave: (form: AddressFormData, resolved: ValidationResult | null) => Promise<void>
  onCancel: () => void
  saving: boolean
}

function AddressForm({ initial, validateBluePlate, onSave, onCancel, saving }: AddressFormProps) {
  const defaultType = initial
    ? (initial.address_type === 'blue_plate' ? 'blue_plate' : 'google_coords')
    : 'blue_plate'

  const [step, setStep]         = useState<1 | 2>(initial ? 2 : 1)
  const [addrType, setAddrType] = useState<'blue_plate' | 'google_coords'>(defaultType)
  const [form, setForm]         = useState({
    unit:     initial?.unit     ?? '',
    building: initial?.building ?? '',
    street:   initial?.street   ?? '',
    zone:     initial?.zone     ?? '',
    lat:      initial?.lat      != null ? String(initial.lat) : '',
    lng:      initial?.lng      != null ? String(initial.lng) : '',
    label:    initial?.label    ?? '',
  })
  const [validating, setValidating]         = useState(false)
  const [validated, setValidated]           = useState<ValidationResult | null>(
    // pre-fill if editing and coords already exist
    initial?.lat && initial?.lng && initial?.waze_link
      ? { lat: initial.lat, lng: initial.lng, waze_link: initial.waze_link }
      : null,
  )
  const [validationFailed, setValidationFailed] = useState(false)

  const canValidate = addrType === 'blue_plate' && !!form.building && !!form.street && !!form.zone

  function handleFieldChange(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
    // Reset validation when blue-plate fields change
    if (['building', 'street', 'zone', 'unit'].includes(field)) {
      setValidated(null)
      setValidationFailed(false)
    }
  }

  async function handleValidate() {
    if (!canValidate) return
    setValidating(true)
    setValidated(null)
    setValidationFailed(false)
    const result = await validateBluePlate(form.building, form.street, form.zone, form.unit || undefined)
    setValidating(false)
    if (result) {
      setValidated(result)
    } else {
      setValidationFailed(true)
    }
  }

  async function handleSave() {
    if (addrType === 'blue_plate' && (!form.building || !form.street || !form.zone)) {
      toast.error('Building, Street and Zone are required')
      return
    }
    if (addrType === 'google_coords') {
      const latNum = parseFloat(form.lat)
      const lngNum = parseFloat(form.lng)
      if (isNaN(latNum) || isNaN(lngNum) || Math.abs(latNum) > 90 || Math.abs(lngNum) > 180) {
        toast.error('Invalid coordinates — use format: 25.2854, 51.5310')
        return
      }
    }

    const data: AddressFormData = addrType === 'blue_plate'
      ? {
          type:     'blue_plate',
          unit:     form.unit     || undefined,
          building: form.building,
          street:   form.street,
          zone:     form.zone,
          label:    form.label    || undefined,
        }
      : {
          type:  'google_coords',
          lat:   parseFloat(form.lat),
          lng:   parseFloat(form.lng),
          label: form.label || undefined,
        }

    await onSave(data, validated)
  }

  // Step 1: pick type (only for new addresses)
  if (!initial && step === 1) {
    return (
      <div className="space-y-2 rounded-md border border-border p-2">
        <p className="text-xs font-medium text-muted-foreground">Address type</p>
        <div className="flex gap-2">
          {(['blue_plate', 'google_coords'] as const).map((t) => (
            <button
              key={t}
              className={`flex-1 rounded-md border p-2 text-xs text-center transition-colors ${addrType === t ? 'border-primary bg-primary/5 text-primary' : 'border-border'}`}
              onClick={() => setAddrType(t)}
            >
              {t === 'blue_plate' ? 'Blue Plate' : 'GPS Coords'}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" className="flex-1 h-7 text-xs" onClick={() => setStep(2)}>Next</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    )
  }

  // Step 2: fill details
  return (
    <div className="space-y-2 rounded-md border border-border p-2">
      {addrType === 'blue_plate' ? (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <Label className="text-xs">Unit</Label>
              <Input value={form.unit} onChange={(e) => handleFieldChange('unit', e.target.value)} className="h-7 text-xs" placeholder="Optional" />
            </div>
            <div>
              <Label className="text-xs">Building *</Label>
              <Input value={form.building} onChange={(e) => handleFieldChange('building', e.target.value)} className="h-7 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Street *</Label>
              <Input value={form.street} onChange={(e) => handleFieldChange('street', e.target.value)} className="h-7 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Zone *</Label>
              <Input value={form.zone} onChange={(e) => handleFieldChange('zone', e.target.value)} className="h-7 text-xs" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Label (optional)</Label>
            <Input
              value={form.label}
              onChange={(e) => handleFieldChange('label', e.target.value)}
              className="h-7 text-xs"
              placeholder="e.g. Home, Office…"
            />
          </div>

          {/* Validate button */}
          {canValidate && !validated && (
            <Button
              size="sm"
              variant="outline"
              className="w-full h-7 text-xs gap-1"
              onClick={handleValidate}
              disabled={validating}
            >
              {validating
                ? <><Loader2 className="h-3 w-3 animate-spin" /> Checking address…</>
                : 'Check address'}
            </Button>
          )}

          {/* Validation success */}
          {validated && (
            <div className="rounded-md bg-emerald-50 border border-emerald-200 px-2.5 py-2 space-y-1">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                <span className="text-xs font-medium text-emerald-700">Address validated</span>
              </div>
              <p className="text-[11px] text-emerald-700 font-mono pl-5">
                {Number(validated.lat).toFixed(6)}, {Number(validated.lng).toFixed(6)}
              </p>
              <a
                href={validated.waze_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 pl-5 text-[11px] text-blue-600 hover:underline"
              >
                <Navigation className="h-2.5 w-2.5" /> View in Waze
              </a>
            </div>
          )}

          {/* Validation failure */}
          {validationFailed && (
            <div className="rounded-md bg-red-50 border border-red-200 px-2.5 py-2 flex items-center gap-1.5">
              <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
              <span className="text-xs text-red-600">Address not found — please check the details</span>
            </div>
          )}
        </>
      ) : (
        <>
          <div>
            <Label className="text-xs">Coordinates *</Label>
            <div className="flex gap-1.5">
              <div className="flex-1">
                <Input
                  value={form.lat}
                  onChange={(e) => { setForm((f) => ({ ...f, lat: e.target.value.trim() })); setValidated(null); setValidationFailed(false) }}
                  className="h-7 text-xs font-mono"
                  placeholder="25.2854"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5 text-center">Latitude</p>
              </div>
              <div className="flex-1">
                <Input
                  value={form.lng}
                  onChange={(e) => { setForm((f) => ({ ...f, lng: e.target.value.trim() })); setValidated(null); setValidationFailed(false) }}
                  className="h-7 text-xs font-mono"
                  placeholder="51.5310"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5 text-center">Longitude</p>
              </div>
            </div>
          </div>

          {/* Verify button */}
          {!validated && (
            <Button
              size="sm"
              variant="outline"
              className="w-full h-7 text-xs gap-1"
              disabled={!form.lat || !form.lng || validating}
              onClick={() => {
                const latNum = parseFloat(form.lat)
                const lngNum = parseFloat(form.lng)
                if (isNaN(latNum) || isNaN(lngNum) || Math.abs(latNum) > 90 || Math.abs(lngNum) > 180) {
                  setValidationFailed(true)
                  return
                }
                setValidationFailed(false)
                setValidated({ lat: latNum, lng: lngNum, waze_link: `https://waze.com/ul?ll=${latNum},${lngNum}&navigate=yes` })
              }}
            >
              Verify coordinates
            </Button>
          )}

          {/* Verification success */}
          {validated && (
            <div className="rounded-md bg-emerald-50 border border-emerald-200 px-2.5 py-2 space-y-1">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                <span className="text-xs font-medium text-emerald-700">Coordinates verified</span>
              </div>
              <p className="text-[11px] text-emerald-700 font-mono pl-5">
                {Number(validated.lat).toFixed(6)}, {Number(validated.lng).toFixed(6)}
              </p>
              <a
                href={validated.waze_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 pl-5 text-[11px] text-blue-600 hover:underline"
              >
                <Navigation className="h-2.5 w-2.5" /> View in Waze
              </a>
            </div>
          )}

          {/* Verification failure */}
          {validationFailed && (
            <div className="rounded-md bg-red-50 border border-red-200 px-2.5 py-2 flex items-center gap-1.5">
              <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
              <span className="text-xs text-red-600">Invalid coordinates — check the values and try again</span>
            </div>
          )}

          <div>
            <Label className="text-xs">Label (optional)</Label>
            <Input value={form.label} onChange={(e) => handleFieldChange('label', e.target.value)} className="h-7 text-xs" placeholder="e.g. Office" />
          </div>
        </>
      )}

      <div className="flex gap-1.5 pt-1">
        <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleSave} disabled={saving}>
          {saving ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Saving…</> : 'Save'}
        </Button>
        {!initial && step === 2 && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setStep(1)}>Back</Button>
        )}
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>
          {initial ? <X className="h-3 w-3" /> : 'Cancel'}
        </Button>
      </div>
    </div>
  )
}

export function AddressSection({ addressState }: { addressState: AddressStateReturn }) {
  const {
    customerId,
    addresses, addingAddress, setAddingAddress,
    editingId, setEditingId,
    setGeocodingWarning, validateBluePlate, addAddress, updateAddress,
  } = addressState

  function handleDragStart(e: React.DragEvent, address: CustomerAddress) {
    e.dataTransfer.setData('application/mms-address', JSON.stringify(address))
    e.dataTransfer.effectAllowed = 'copy'
  }

  async function handleAdd(form: AddressFormData, resolved: ValidationResult | null) {
    if (!customerId) {
      toast.error('No customer selected — resolve a customer before adding an address')
      return
    }
    try {
      await addAddress.mutateAsync({ ...form, resolvedCoords: resolved } as any)
      toast.success('Address saved')
    } catch {
      toast.error('Failed to save address')
    }
  }

  async function handleUpdate(id: string, form: AddressFormData, resolved: ValidationResult | null) {
    try {
      await updateAddress.mutateAsync({ id, form, resolvedCoords: resolved })
      toast.success('Address updated')
    } catch {
      toast.error('Failed to update address')
    }
  }

  return (
    <div className="px-3 py-2 space-y-2">
      {addresses.map((a) => {
        const isEditing = editingId === a.id

        const autoLabel = [
          a.building ? `B${a.building}` : '',
          a.street   ? `S${a.street}`   : '',
          a.zone     ? `Z${a.zone}`     : '',
        ].filter(Boolean).join(' ') || 'Address'
        const displayLabel = a.label ?? autoLabel
        const coordText    = a.lat && a.lng
          ? `${Number(a.lat).toFixed(5)}, ${Number(a.lng).toFixed(5)}`
          : null

        if (isEditing) {
          return (
            <AddressForm
              key={a.id}
              initial={a}
              existingCount={addresses.length}
              validateBluePlate={validateBluePlate}
              onSave={(form, resolved) => handleUpdate(a.id, form, resolved)}
              onCancel={() => setEditingId(null)}
              saving={updateAddress.isPending}
            />
          )
        }

        return (
          <div
            key={a.id}
            draggable
            onDragStart={(e) => handleDragStart(e, a)}
            className="flex items-start gap-2 rounded-md border border-border p-2 group cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0 space-y-0.5">
              {/* Label + badges */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                <span className="text-xs font-medium">{displayLabel}</span>
                {a.is_primary && <Badge variant="secondary" className="text-[10px] py-0 px-1 h-4">primary</Badge>}
              </div>

              {/* Blue plate breakdown */}
              {(a.building || a.street || a.zone) && (
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
                  <Navigation className="h-2.5 w-2.5" /> Open in Waze
                </a>
              )}
            </div>

            {/* Edit button — visible on hover */}
            <button
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted flex-shrink-0"
              onClick={(e) => { e.stopPropagation(); setAddingAddress(false); setEditingId(a.id) }}
              title="Edit address"
            >
              <Pencil className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>
        )
      })}

      {/* Add button */}
      {!addingAddress && !editingId && (
        customerId ? (
          <Button
            size="sm"
            variant="outline"
            className="w-full h-7 text-xs"
            onClick={() => { setGeocodingWarning(false); setAddingAddress(true) }}
          >
            <Plus className="h-3 w-3 mr-1" /> Add address
          </Button>
        ) : (
          <p className="text-center text-[11px] text-muted-foreground py-1">
            Resolve a customer first to add addresses
          </p>
        )
      )}

      {/* New address form */}
      {addingAddress && (
        <AddressForm
          existingCount={addresses.length}
          validateBluePlate={validateBluePlate}
          onSave={handleAdd}
          onCancel={() => setAddingAddress(false)}
          saving={addAddress.isPending}
        />
      )}
    </div>
  )
}
