import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface SiteVisitListItem {
  id: string
  visit_id: string
  customer_id: string
  customer_name: string
  customer_phone: string
  arrival_phone: string | null
  status: string
  mode: string
  scheduled_date: string | null
  address: string | null
  notes: string | null
  created_at: string
}

export interface SiteVisitsFilter {
  statuses?: string[]
  visitDateFrom?: string
  visitDateTo?: string
  customerPhone?: string
  visitNumber?: string
}

export function useSiteVisits(filter: SiteVisitsFilter = {}) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['site-visits', filter],
    queryFn: async (): Promise<SiteVisitListItem[]> => {
      const { data, error } = await (supabase as any)
        .from('site_visits')
        .select(`
          id, visit_id, customer_id, status, mode,
          scheduled_date, address, notes, arrival_phone, created_at,
          customers(name, customer_phones(phone))
        `)
        .order('scheduled_date', { ascending: false })
        .limit(200) as { data: any[] | null; error: any }

      if (error) throw error

      return (data ?? []).map((v: any) => ({
        id: v.id,
        visit_id: v.visit_id,
        customer_id: v.customer_id,
        customer_name: v.customers?.name ?? '',
        customer_phone: v.customers?.customer_phones?.[0]?.phone ?? '',
        arrival_phone: v.arrival_phone ?? null,
        status: v.status,
        mode: v.mode,
        scheduled_date: v.scheduled_date,
        address: v.address ?? null,
        notes: v.notes ?? null,
        created_at: v.created_at,
      }))
    },
  })
}
