'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import type { DBInsert, DBUpdate } from '@/types/database.types'

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

/** Map a service-shaped address payload (unit/building/street/zone) to the
 *  customer_addresses column names (*_no). address_type stays as-is ('blue-plate'). */
function toCustomerAddressRow(payload: Record<string, unknown>): Record<string, unknown> {
  const { unit, building, street, zone, ...rest } = payload
  return {
    ...rest,
    unit_no:     (unit as string | null) ?? null,
    building_no: (building as string | null) ?? null,
    street_no:   (street as string | null) ?? null,
    zone_no:     (zone as string | null) ?? null,
  }
}

export function useAddressState(customerId: string | null) {
  const supabase = createClient()
  const qc = useQueryClient()
  const [addingAddress, setAddingAddress]   = useState(false)
  const [editingId, setEditingId]           = useState<string | null>(null)
  const [geocodingWarning, setGeocodingWarning] = useState(false)

  const { data: addresses = [], isLoading } = useQuery<CustomerAddress[]>({
    queryKey: queryKeys.contactCenter.addresses(customerId),
    queryFn: async () => {
      if (!customerId) return []
      const { data, error } = await supabase
        .from('customer_addresses')
        .select('*')
        .eq('customer_id', customerId)
        .order('is_primary', { ascending: false })
      if (error) throw error
      // customer_addresses stores *_no columns; map to building/street/zone/unit and
      // normalise the DB hyphen address_type ('blue-plate') to the TS underscore form.
      return (data ?? []).map((row) => {
        const r = row as unknown as Record<string, unknown>
        return {
          id:           r.id,
          customer_id:  r.customer_id,
          address_type: (((r.address_type as string) ?? '').replace('-', '_')) as AddressType,
          label:        (r.label as string | null) ?? null,
          unit:         (r.unit_no as string | null) ?? null,
          building:     (r.building_no as string | null) ?? null,
          street:       (r.street_no as string | null) ?? null,
          zone:         (r.zone_no as string | null) ?? null,
          lat:          (r.lat as number | null) ?? null,
          lng:          (r.lng as number | null) ?? null,
          is_primary:   (r.is_primary as boolean) ?? false,
          is_geocoded:  (r.is_geocoded as boolean) ?? false,
          waze_link:    (r.waze_link as string | null) ?? null,
          tags:         (r.tags as string[]) ?? [],
          created_at:   r.created_at,
        } as CustomerAddress
      })
    },
    enabled: !!customerId,
  })

  /** Validate a blue-plate address via the QARS GIS service.
   *  Returns resolved coords + waze_link on success, null on failure. */
  async function validateBluePlate(
    building: string, street: string, zone: string, _unit?: string,
  ): Promise<{ lat: number; lng: number; waze_link: string } | null> {
    try {
      const { data: geo, error: geoErr } = await supabase.functions.invoke('blue-plate-lookup', {
        body: {
          zone_no:     zone,
          street_no:   street,
          building_no: building,
        },
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

      const { error } = await supabase
        .from('customer_addresses')
        .insert(toCustomerAddressRow({ customer_id: customerId!, ...payload }) as unknown as DBInsert<'customer_addresses'>)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.contactCenter.addresses(customerId) })
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

      const { error } = await supabase
        .from('customer_addresses')
        .update(toCustomerAddressRow(payload) as unknown as DBUpdate<'customer_addresses'>)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.contactCenter.addresses(customerId) })
      setEditingId(null)
    },
  })

  return {
    customerId,
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
