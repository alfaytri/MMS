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

      let query = supabase
        .from('orders')
        .select(`
          id, order_id, address, status, scheduled_date, address_id,
          service_customers!inner(name),
          order_services(name)
        `)
        .not('status', 'in', '("completed","cancelled")')

      // Date filtering — defaults to today + tomorrow
      const from = dateFrom ?? getToday()
      const to = dateTo ?? getTomorrow()
      query = query.gte('scheduled_date', from).lte('scheduled_date', to)

      const { data, error } = await query.limit(500)
      if (error) throw error

      type OrderRow = {
        id: string; order_id: string; address: string | null; status: string | null
        scheduled_date: string | null; address_id: string | null
        service_customers: { name?: string } | null
        order_services: { name?: string }[] | null
      }
      const rows = (data ?? []) as unknown as OrderRow[]

      // Stage 4: resolve lat/lng via the unified address book (works whether address_id points at the
      // old service table or the new customer table), then keep only geocoded orders. Decouples this
      // read from the address FK so the later FK remap is non-breaking.
      const addrIds = Array.from(new Set(rows.map((o) => o.address_id).filter((x): x is string => !!x)))
      const geo = new Map<string, { lat: number | null; lng: number | null }>()
      if (addrIds.length) {
        const { data: addrs } = await supabase
          // view shares service_customer_addresses' column shape; cast the typed name (runtime queries the view).
          .from('order_address_book' as unknown as 'service_customer_addresses')
          .select('id, lat, lng')
          .in('id', addrIds)
        for (const a of (addrs ?? []) as { id: string; lat: number | null; lng: number | null }[]) {
          geo.set(a.id, { lat: a.lat, lng: a.lng })
        }
      }

      return rows
        .map((o) => ({ o, addr: o.address_id ? geo.get(o.address_id) ?? null : null }))
        .filter((x): x is { o: OrderRow; addr: { lat: number; lng: number } } =>
          !!x.addr && x.addr.lat != null && x.addr.lng != null)
        .map(({ o, addr }) => ({
          id: o.id,
          orderId: o.order_id,
          customerName: o.service_customers?.name ?? '',
          service: o.order_services?.[0]?.name ?? '',
          address: o.address ?? '',
          lat: addr.lat,
          lng: addr.lng,
          status: toMapStatus(o.status),
          visitDate: o.scheduled_date ?? null,
        }))
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
}
