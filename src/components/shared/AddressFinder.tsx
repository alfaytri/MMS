'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { MapPin, Check, AlertTriangle, Loader2, LocateFixed } from 'lucide-react'

/** A stored address: a tidy human string plus optional coordinates. */
export interface AddressValue {
  address: string
  latitude: number | null
  longitude: number | null
}

export const EMPTY_ADDRESS: AddressValue = { address: '', latitude: null, longitude: null }

// Pull Zone/Street/Building out of a stored address so editing re-populates the
// blue-plate fields. Handles both "Zone 55, Street 185, Building 19" (what we
// write) and the operator's shorthand "B19.S185.Z55" / "B19,S185,Z55".
function parsePlate(address: string): { zone: string; street: string; building: string } | null {
  if (!address) return null
  const zone = address.match(/zone\s*(\d+)/i)?.[1] ?? address.match(/\bZ\s*[.,]?\s*(\d+)/i)?.[1]
  const street = address.match(/street\s*(\d+)/i)?.[1] ?? address.match(/\bS\s*[.,]?\s*(\d+)/i)?.[1]
  const building = address.match(/building\s*(\d+)/i)?.[1] ?? address.match(/\bB\s*[.,]?\s*(\d+)/i)?.[1]
  if (zone && street && building) return { zone, street, building }
  return null
}

// Extract the first "lat, lng" pair from pasted text or a Google Maps URL
// (…@25.25,51.45… / …q=25.25,51.45… / a bare "25.25, 51.45"). Shortened
// maps.app.goo.gl links carry no coords in the text — the operator pastes the
// expanded link or the raw pair. Range-checked to reject nonsense.
function parseCoords(text: string): { lat: number; lng: number } | null {
  const m = text.match(/(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/)
  if (!m) return null
  const lat = parseFloat(m[1])
  const lng = parseFloat(m[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

function fmtPlate(zone: string, street: string, building: string): string {
  return `Zone ${zone}, Street ${street}, Building ${building}`
}

type VerifyStatus = 'idle' | 'loading' | 'verified' | 'notfound' | 'error'

export function AddressFinder({
  value,
  onChange,
  disabled,
}: {
  value: AddressValue
  onChange: (v: AddressValue) => void
  disabled?: boolean
}) {
  const initialPlate = parsePlate(value.address)
  // If the stored address isn't a blue plate but we have coordinates, start on
  // the coordinates tab; otherwise default to the blue-plate entry.
  const [mode, setMode] = useState<'plate' | 'coords'>(
    !initialPlate && (value.latitude != null || value.longitude != null) ? 'coords' : 'plate',
  )
  const [zone, setZone] = useState(initialPlate?.zone ?? '')
  const [street, setStreet] = useState(initialPlate?.street ?? '')
  const [building, setBuilding] = useState(initialPlate?.building ?? '')
  const [status, setStatus] = useState<VerifyStatus>(
    initialPlate && value.latitude != null ? 'verified' : 'idle',
  )
  // Coordinate-mode local inputs.
  const [coordsText, setCoordsText] = useState(
    value.latitude != null && value.longitude != null && !initialPlate
      ? `${value.latitude}, ${value.longitude}`
      : '',
  )
  const [placeName, setPlaceName] = useState(!initialPlate ? value.address : '')

  // Plate fields: reflect what's typed immediately (advisory — a plate can be
  // saved unverified), but drop any stale coordinates until re-verified.
  function updatePlate(next: { zone?: string; street?: string; building?: string }) {
    const z = next.zone ?? zone
    const s = next.street ?? street
    const b = next.building ?? building
    if (next.zone !== undefined) setZone(next.zone)
    if (next.street !== undefined) setStreet(next.street)
    if (next.building !== undefined) setBuilding(next.building)
    setStatus('idle')
    onChange({ address: z || s || b ? fmtPlate(z, s, b) : '', latitude: null, longitude: null })
  }

  async function verify() {
    if (!zone || !street || !building) return
    setStatus('loading')
    try {
      const res = await fetch(`/api/qnas/lookup?zone=${encodeURIComponent(zone)}&street=${encodeURIComponent(street)}&building=${encodeURIComponent(building)}`)
      const data = await res.json()
      if (res.ok && data.found) {
        setStatus('verified')
        onChange({ address: fmtPlate(zone, street, building), latitude: data.lat ?? null, longitude: data.lng ?? null })
      } else if (res.ok && data.found === false) {
        setStatus('notfound')
        onChange({ address: fmtPlate(zone, street, building), latitude: null, longitude: null })
      } else {
        setStatus('error')
        onChange({ address: fmtPlate(zone, street, building), latitude: null, longitude: null })
      }
    } catch {
      setStatus('error')
      onChange({ address: fmtPlate(zone, street, building), latitude: null, longitude: null })
    }
  }

  function updateCoords(rawText: string, name?: string) {
    setCoordsText(rawText)
    if (name !== undefined) setPlaceName(name)
    const parsed = parseCoords(rawText)
    const nm = name ?? placeName
    onChange({
      address: nm.trim() || (parsed ? `${parsed.lat}, ${parsed.lng}` : ''),
      latitude: parsed?.lat ?? null,
      longitude: parsed?.lng ?? null,
    })
  }

  const coordsParsed = parseCoords(coordsText)

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      {/* Mode switch */}
      <div className="flex items-center gap-1 text-xs">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setMode('plate')}
          className={`flex items-center gap-1 rounded px-2 py-1 transition-colors ${mode === 'plate' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <MapPin className="h-3 w-3" /> Blue Plate
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setMode('coords')}
          className={`flex items-center gap-1 rounded px-2 py-1 transition-colors ${mode === 'coords' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <LocateFixed className="h-3 w-3" /> Coordinates
        </button>
      </div>

      {mode === 'plate' ? (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Zone</label>
              <Input inputMode="numeric" placeholder="55" value={zone} disabled={disabled}
                onChange={(e) => updatePlate({ zone: e.target.value.replace(/\D/g, '') })} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Street</label>
              <Input inputMode="numeric" placeholder="185" value={street} disabled={disabled}
                onChange={(e) => updatePlate({ street: e.target.value.replace(/\D/g, '') })} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Building</label>
              <Input inputMode="numeric" placeholder="19" value={building} disabled={disabled}
                onChange={(e) => updatePlate({ building: e.target.value.replace(/\D/g, '') })} className="h-8 text-xs" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" className="h-8 text-xs"
              disabled={disabled || !zone || !street || !building || status === 'loading'} onClick={verify}>
              {status === 'loading' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <MapPin className="h-3 w-3 mr-1" />}
              Verify blue plate
            </Button>
            {status === 'verified' && (
              <span className="flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400">
                <Check className="h-3 w-3" /> Verified{value.latitude != null ? ` · ${value.latitude?.toFixed(5)}, ${value.longitude?.toFixed(5)}` : ''}
              </span>
            )}
            {status === 'notfound' && (
              <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" /> Not in QNAS — saved as entered, or use Coordinates
              </span>
            )}
            {status === 'error' && (
              <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" /> QNAS unreachable — saved as entered
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Google coordinates or map link</label>
            <Input placeholder="25.25170, 51.45127  (or paste a Google Maps link)" value={coordsText} disabled={disabled}
              onChange={(e) => updateCoords(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Place / area name (optional)</label>
            <Input placeholder="e.g. Birkat Al Awamer yard" value={placeName} disabled={disabled}
              onChange={(e) => updateCoords(coordsText, e.target.value)} className="h-8 text-xs" />
          </div>
          {coordsText && (
            coordsParsed ? (
              <span className="flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400">
                <Check className="h-3 w-3" /> {coordsParsed.lat.toFixed(5)}, {coordsParsed.lng.toFixed(5)}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" /> Couldn&apos;t read coordinates — paste as &ldquo;lat, lng&rdquo;
              </span>
            )
          )}
        </div>
      )}
    </div>
  )
}
