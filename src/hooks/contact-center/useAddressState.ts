'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type AddressType = 'blue_plate' | 'google_coords'

export interface CustomerAddress {
  id: string
  customer_id: string
  address_type: AddressType
  label: string | null
  unit: string | null
  building: string | null
  street: string | null
  zone: string | null
  lat: number | null
  lng: number | null
  is_primary: boolean
  is_geocoded: boolean
  waze_link: string | null
  tags: string[]
  created_at: string
}

export interface AddressFormData {
  type: AddressType
  unit?: string
  building?: string
  street?: string
  zone?: string
  lat?: number
  lng?: number
  label?: string
  waze_link?: string
}

/** Generate a Waze deep-link from coordinates */
export function buildWazeLink(lat: number, lng: number): string {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
}

export function useAddressState(customerId: string | null) {
  const supabase = createClient()
  const qc = useQueryClient()
  const [addingAddress, setAddingAddress]   = useState(false)
  const [editingId, setEditingId]           = useState<string | null>(null)
  const [geocodingWarning, setGeocodingWarning] = useState(false)

  const { data: addresses = [], isLoading } = useQuery<CustomerAddress[]>({
    queryKey: ['cc-addresses', customerId],
    queryFn: async () => {
      if (!customerId) return []
      const { data, error } = await (supabase as any)
        .from('service_customer_addresses')
        .select('*')
        .eq('customer_id', customerId)
        .order('is_primary', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!customerId,
  })

  /** Validate a blue-plate address via the edge function.
   *  Returns resolved coords + waze_link on success, null on failure. */
  async function validateBluePlate(
    building: string, street: string, zone: string, unit?: string,
  ): Promise<{ lat: number; lng: number; waze_link: string } | null> {
    const plate = [unit ? `U${unit}` : '', `B${building}`, `S${street}`, `Z${zone}`]
      .filter(Boolean).join(' ')
    try {
      const { data: geo, error: geoErr } = await supabase.functions.invoke('blue-plate-lookup', {
        body: { plate },
      })
      if (!geoErr && geo?.lat && geo?.lng) {
        return { lat: geo.lat, lng: geo.lng, waze_link: buildWazeLink(geo.lat, geo.lng) }
      }
    } catch { /* fall through */ }
    return null
  }

  /** Build the DB payload for a blue-plate address */
  function buildBluePlatePayload(
    form: AddressFormData,
    coords: { lat: number; lng: number; waze_link: string } | null,
    isPrimary: boolean,
  ) {
    const autoLabel = `B${form.building} S${form.street} Z${form.zone}`
    return {
      address_type: 'blue-plate',
      label:        form.label || autoLabel,
      unit:         form.unit ?? null,
      building:     form.building,
      street:       form.street,
      zone:         form.zone,
      lat:          coords?.lat ?? null,
      lng:          coords?.lng ?? null,
      is_geocoded:  !!coords,
      waze_link:    coords?.waze_link ?? null,
      is_primary:   isPrimary,
    }
  }

  /** Build the DB payload for a google-coords address */
  function buildCoordsPayload(form: AddressFormData, isPrimary: boolean) {
    const la = form.lat ?? null
    const lo = form.lng ?? null
    return {
      address_type: 'google-coords',
      label:        form.label ?? null,
      lat:          la,
      lng:          lo,
      is_geocoded:  !!(la && lo),
      waze_link:    la && lo ? buildWazeLink(la, lo) : null,
      is_primary:   isPrimary,
    }
  }

  const addAddress = useMutation({
    mutationFn: async (form: AddressFormData & {
      resolvedCoords?: { lat: number; lng: number; waze_link: string } | null
    }) => {
      let payload: Record<string, unknown>

      if (form.type === 'blue_plate' && form.building && form.street && form.zone) {
        // Use pre-validated coords if available; otherwise try to resolve now
        let coords = form.resolvedCoords ?? null
        if (!coords) {
          coords = await validateBluePlate(form.building, form.street, form.zone, form.unit)
          if (!coords) setGeocodingWarning(true)
        }
        payload = buildBluePlatePayload(form, coords, addresses.length === 0)
      } else {
        payload = buildCoordsPayload(form, addresses.length === 0)
      }

      const { error } = await (supabase as any)
        .from('service_customer_addresses')
        .insert({ customer_id: customerId, ...payload })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cc-addresses', customerId] })
      setAddingAddress(false)
    },
  })

  const updateAddress = useMutation({
    mutationFn: async (args: {
      id: string
      form: AddressFormData
      resolvedCoords?: { lat: number; lng: number; waze_link: string } | null
    }) => {
      const { id, form } = args
      let payload: Record<string, unknown>

      if (form.type === 'blue_plate' && form.building && form.street && form.zone) {
        let coords = args.resolvedCoords ?? null
        if (!coords) {
          coords = await validateBluePlate(form.building, form.street, form.zone, form.unit)
          if (!coords) setGeocodingWarning(true)
        }
        const current = addresses.find((a) => a.id === id)
        payload = buildBluePlatePayload(form, coords, current?.is_primary ?? false)
      } else {
        const current = addresses.find((a) => a.id === id)
        payload = buildCoordsPayload(form, current?.is_primary ?? false)
      }

      const { error } = await (supabase as any)
        .from('service_customer_addresses')
        .update(payload)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cc-addresses', customerId] })
      setEditingId(null)
    },
  })

  return {
    addresses,
    isLoading,
    addingAddress,
    setAddingAddress,
    editingId,
    setEditingId,
    geocodingWarning,
    setGeocodingWarning,
    validateBluePlate,
    addAddress,
    updateAddress,
  }
}
