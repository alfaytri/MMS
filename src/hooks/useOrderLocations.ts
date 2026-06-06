// src/hooks/useOrderLocations.ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type OrderLocationStatus = 'scheduled' | 'in-progress' | 'completed' | 'pending'

export interface OrderLocation {
  id: string
  orderId: string
  customerName: string
  service: string
  address: string
  lat: number
  lng: number
  status: OrderLocationStatus
  visitDate: string | null
}

/** Map DB order status to the simplified map pin status */
function toMapStatus(dbStatus: string | null): OrderLocationStatus {
  switch (dbStatus) {
    case 'in-progress': return 'in-progress'
    case 'scheduled':
    case 'confirmed': return 'scheduled'
    case 'completed': return 'completed'
    default: return 'pending'
  }
}

/**
 * Returns today's date string in YYYY-MM-DD format.
 * Extracted so tests can mock it if needed.
 */
function getToday(): string {
  return new Date().toISOString().split('T')[0]
}

/**
 * Returns tomorrow's date string in YYYY-MM-DD format.
 */
function getTomorrow(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

interface UseOrderLocationsOptions {
  /** When set, overrides the default today+tomorrow date range for visit_date filtering */
  dateFrom?: string | null
  dateTo?: string | null
}

/**
 * Fetches non-completed orders that have geocoded addresses (lat/lng not null).
 * Defaults to orders with visit_date = today or tomorrow.
 * Polls every 60 seconds.
 */
export function useOrderLocations(opts?: UseOrderLocationsOptions) {
  const dateFrom = opts?.dateFrom ?? undefined
  const dateTo = opts?.dateTo ?? undefined

  return useQuery({
    queryKey: queryKeys.orders.locations(dateFrom, dateTo),
    queryFn: async (): Promise<OrderLocation[]> => {
      const supabase = createClient()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = supabase
        .from('orders')
        .select(`
          id, order_id, address, status, scheduled_date,
          service_customers!inner(name),
          order_services(name),
          service_customer_addresses!orders_address_id_fkey(lat, lng)
        `)
        .not('status', 'in', '("completed","cancelled")')
        .not('service_customer_addresses.lat', 'is', null)
        .not('service_customer_addresses.lng', 'is', null)

      // Date filtering — defaults to today + tomorrow
      const from = dateFrom ?? getToday()
      const to = dateTo ?? getTomorrow()
      query = query.gte('scheduled_date', from).lte('scheduled_date', to)

      const { data, error } = await query.limit(500)
      if (error) throw error

      type OrderRow = (typeof data extends (infer R)[] | null ? R : never) & {
        service_customers: { name?: string } | null
        order_services: { name?: string }[] | null
        service_customer_addresses: { lat: number | null; lng: number | null } | null
      }
      return ((data ?? []) as OrderRow[])
        .filter((o) => {
          const addr = o.service_customer_addresses
          return addr && addr.lat != null && addr.lng != null
        })
        .map((o) => ({
          id: o.id,
          orderId: o.order_id,
          customerName: o.service_customers?.name ?? '',
          service: o.order_services?.[0]?.name ?? '',
          address: o.address ?? '',
          lat: o.service_customer_addresses!.lat!,
          lng: o.service_customer_addresses!.lng!,
          status: toMapStatus(o.status),
          visitDate: o.scheduled_date ?? null,
        }))
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
}
