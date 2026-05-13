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

export function useAddressState(customerId: string | null) {
  const supabase = createClient()
  const qc = useQueryClient()
  const [addingAddress, setAddingAddress] = useState(false)
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

  const addAddress = useMutation({
    mutationFn: async (form: AddressFormData) => {
      let lat: number | null = form.lat ?? null
      let lng: number | null = form.lng ?? null
      let isGeocoded = true

      /** Build a Waze deep-link from coordinates */
      function wazeLink(la: number, lo: number): string {
        return `https://waze.com/ul?ll=${la},${lo}&navigate=yes`
      }

      if (form.type === 'blue_plate' && form.building && form.street && form.zone) {
        const autoLabel = `B${form.building} S${form.street} Z${form.zone}`
        try {
          const { data: geo, error: geoErr } = await supabase.functions.invoke('blue-plate-lookup', {
            body: { plate: autoLabel },
          })
          if (!geoErr && geo?.lat && geo?.lng) {
            lat = geo.lat
            lng = geo.lng
          } else {
            isGeocoded = false
            setGeocodingWarning(true)
          }
        } catch {
          isGeocoded = false
          setGeocodingWarning(true)
        }

        const label = form.label || autoLabel
        const { error } = await (supabase as any)
          .from('service_customer_addresses')
          .insert({
            customer_id:  customerId,
            address_type: 'blue-plate',
            label,
            unit:         form.unit ?? null,
            building:     form.building,
            street:       form.street,
            zone:         form.zone,
            lat,
            lng,
            is_geocoded:  isGeocoded,
            waze_link:    lat && lng ? wazeLink(lat, lng) : null,
            is_primary:   addresses.length === 0,
          })
        if (error) throw error
      } else {
        const la = form.lat ?? null
        const lo = form.lng ?? null
        const { error } = await (supabase as any)
          .from('service_customer_addresses')
          .insert({
            customer_id:  customerId,
            address_type: 'google-coords',
            label:        form.label ?? null,
            lat:          la,
            lng:          lo,
            is_geocoded:  true,
            waze_link:    la && lo ? wazeLink(la, lo) : null,
            is_primary:   addresses.length === 0,
          })
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cc-addresses', customerId] })
      setAddingAddress(false)
    },
  })

  return {
    addresses,
    isLoading,
    addingAddress,
    setAddingAddress,
    geocodingWarning,
    setGeocodingWarning,
    addAddress,
  }
}
