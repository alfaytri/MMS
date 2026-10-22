import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { CustomerAddress } from '@/types/orders'
import type { Database } from '@/types/database.types'
import { queryKeys } from '@/lib/queryKeys'

// Customer consolidation: order addresses live on the unified customers side (customer_addresses).
// Stage 5 flipped the order-create flow to a customers.id, so this hook reads/writes customer_addresses
// directly by that id, mapping the *_no columns back to the building/street/zone/unit shape the UI
// (CustomerAddress) expects. Only the order-create AddressPicker/AddressCreationSheet use this hook.
function mapRow(ca: Record<string, unknown>): CustomerAddress {
  return {
    id:           ca.id,
    customer_id:  ca.customer_id,
    label:        ca.label ?? null,
    address_type: ca.address_type,
    unit:         ca.unit_no ?? null,
    building:     ca.building_no ?? null,
    street:       ca.street_no ?? null,
    zone:         ca.zone_no ?? null,
    lat:          ca.lat ?? null,
    lng:          ca.lng ?? null,
    is_primary:   ca.is_primary ?? false,
    is_geocoded:  ca.is_geocoded ?? false,
    waze_link:    ca.waze_link ?? null,
    tags:         ca.tags ?? [],
  } as unknown as CustomerAddress
}

export function useCustomerAddresses(customerId: string | null) {
  const supabase = createClient()
  const qc = useQueryClient()

  const { data: addresses = [], isLoading } = useQuery({
    queryKey: queryKeys.contactCenter.serviceCustomerAddresses(customerId),
    queryFn: async (): Promise<CustomerAddress[]> => {
      if (!customerId) return []
      // Stage 5: customerId is a customers.id — read customer_addresses directly.
      const { data, error } = await supabase
        .from('customer_addresses')
        .select('*')
        .eq('customer_id', customerId)
        .order('is_primary', { ascending: false })
      if (error) throw error
      return (data ?? []).map((r) => mapRow(r as unknown as Record<string, unknown>))
    },
    enabled: !!customerId,
  })

  const addAddress = useMutation({
    mutationFn: async (
      input: Omit<CustomerAddress, 'id' | 'created_at'>
    ): Promise<CustomerAddress> => {
      const custId = (input as { customer_id?: string | null }).customer_id ?? customerId
      if (!custId) throw new Error('no customer id')
      const i = input as unknown as Record<string, unknown>
      const row = {
        customer_id:  custId,
        label:        (i.label as string | null) ?? null,
        address_type: i.address_type,
        unit_no:      (i.unit as string | null) ?? null,
        building_no:  (i.building as string | null) ?? null,
        street_no:    (i.street as string | null) ?? null,
        zone_no:      (i.zone as string | null) ?? null,
        lat:          (i.lat as number | null) ?? null,
        lng:          (i.lng as number | null) ?? null,
        is_primary:   (i.is_primary as boolean) ?? false,
        is_geocoded:  (i.is_geocoded as boolean) ?? false,
        waze_link:    (i.waze_link as string | null) ?? null,
        tags:         (i.tags as string[]) ?? [],
      }
      const { data, error } = await supabase
        .from('customer_addresses')
        .insert(row as unknown as Database['public']['Tables']['customer_addresses']['Insert'])
        .select()
        .single()
      if (error) throw error
      return mapRow(data as unknown as Record<string, unknown>)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.contactCenter.serviceCustomerAddresses(customerId) })
    },
  })

  return { addresses, isLoading, addAddress }
}
