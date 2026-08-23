import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ShipmentMode = 'air' | 'sea' | 'land' | 'manual'
export type ShipmentStatus = 'booked' | 'in_transit' | 'customs' | 'delivered' | 'delayed'

export type ShipmentEvent = {
  date: string
  location: string
  status: string
  notes?: string
  // 17track auto-sync fields (optional — absent on manual events)
  normalizedTimestamp?: string
  hash?: string
}

export type Shipment = {
  id: string
  tracking_number: string
  po_id: string
  receival_id: string | null
  mode: ShipmentMode
  carrier: string
  status: ShipmentStatus
  origin: string | null
  destination: string | null
  etd: string | null
  eta: string | null
  events: ShipmentEvent[]
  archived: boolean
  carrier_code: string | null
  is_syncing: boolean
  last_synced_at: string | null
  sync_error: string | null
  created_at: string
  updated_at: string
  purchase_orders?: { po_number: string; supplier_name: string; expected_delivery: string | null } | null
}

export type CreateShipmentPayload = {
  po_id: string
  mode: ShipmentMode
  tracking_number: string
  carrier?: string | null
  origin?: string | null
  destination?: string | null
  etd?: string | null
  eta?: string | null
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useShipments({ archived = false, search = '' }: { archived?: boolean; search?: string } = {}) {
  return useQuery({
    queryKey: queryKeys.shipments.list(archived, search),
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('shipments')
        .select('*, purchase_orders(po_number, supplier_name, expected_delivery)')
        .eq('archived', archived)
        .order('created_at', { ascending: false })
      if (search) {
        q = q.or(`tracking_number.ilike.%${search}%,carrier.ilike.%${search}%`)
      }
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as Shipment[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateShipment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateShipmentPayload) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('shipments')
        .insert({ ...payload, events: [], archived: false, status: 'booked' })
        .select()
        .single()
      if (error) throw error
      return data as Shipment
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.shipments.all }),
  })
}

export function useUpdateShipmentStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ShipmentStatus }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('shipments')
        .update({ status })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.shipments.all }),
  })
}

export function useAddShipmentEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, event, currentEvents }: { id: string; event: ShipmentEvent; currentEvents: ShipmentEvent[] }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('shipments')
        .update({ events: [...currentEvents, event] })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.shipments.all }),
  })
}

export function useDeleteShipment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      // Hard delete: shipments have no inbound FK dependents (tracking events cascade),
      // so removal is clean.
      const { error } = await supabase
        .from('shipments')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.shipments.all }),
  })
}
