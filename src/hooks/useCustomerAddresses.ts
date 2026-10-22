import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { CustomerAddress } from '@/types/orders'
import type { Database } from '@/types/database.types'
import { queryKeys } from '@/lib/queryKeys'
import type { SupabaseClient } from '@supabase/supabase-js'

// Stage 4 cutover (customer consolidation): order addresses now live on the unified customers side
// (customer_addresses). The order-create flow still identifies a customer by their service_customer id,
// so we resolve the bridge (service_customers.customer_id) and read/write customer_addresses, mapping the
// *_no columns back to the building/street/zone/unit shape the UI (CustomerAddress) expects.
// Only the order-create AddressPicker/AddressCreationSheet use this hook; the Contact Centre uses a
// separate address hook. service_customer_addresses stays as read-only legacy (resolved via the book).
async function resolveBridge(supabase: SupabaseClient, serviceCustomerId: string): Promise<string | null> {
  const { data } = await supabase
    .from('service_customers')
    .select('customer_id')
    .eq('id', serviceCustomerId)
    .maybeSingle()
  return (data as { customer_id: string | null } | null)?.customer_id ?? null
}

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
      const bridgeId = await resolveBridge(supabase, customerId)
      if (!bridgeId) return []
      const { data, error } = await supabase
        .from('customer_addresses')
        .select('*')
        .eq('customer_id', bridgeId)
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
      const svcId = (input as { customer_id?: string | null }).customer_id ?? customerId
      const bridgeId = svcId ? await resolveBridge(supabase, svcId) : null
      if (!bridgeId) throw new Error('customer is not linked to a unified customer record')
      const i = input as unknown as Record<string, unknown>
      const row = {
        customer_id:  bridgeId,
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
