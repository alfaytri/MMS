import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface SiteVisitDetail {
  id: string
  visit_id: string
  customer_id: string
  customer_name: string
  customer_phone: string
  customer_phone_id: string | null
  arrival_phone: string | null
  status: string
  mode: string
  scheduled_date: string | null
  address: string | null
  notes: string | null
  created_at: string
  assignments: Array<{
    id: string
    team_name: string
    scheduled_date: string | null
    time_slot: string | null
    duration: string
  }>
}

export function useSiteVisitDetail(visitId: string | null) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['site-visit-detail', visitId],
    enabled: !!visitId,
    queryFn: async (): Promise<SiteVisitDetail> => {
      const { data, error } = await (supabase as any)
        .from('site_visits')
        .select(`
          id, visit_id, customer_id, status, mode,
          scheduled_date, address, notes, arrival_phone, created_at,
          customers(name, customer_phones(id, phone)),
          site_visit_team_assignments(id, scheduled_date, time_slot, duration, teams(name_en, name))
        `)
        .eq('id', visitId)
        .single()

      if (error) throw error

      const primaryPhone = data.customers?.customer_phones?.[0]
      return {
        id: data.id,
        visit_id: data.visit_id,
        customer_id: data.customer_id,
        customer_name: data.customers?.name ?? '',
        customer_phone: primaryPhone?.phone ?? '',
        customer_phone_id: primaryPhone?.id ?? null,
        arrival_phone: data.arrival_phone ?? null,
        status: data.status,
        mode: data.mode,
        scheduled_date: data.scheduled_date,
        address: data.address ?? null,
        notes: data.notes ?? null,
        created_at: data.created_at,
        assignments: (data.site_visit_team_assignments ?? []).map((a: any) => ({
          id: a.id,
          team_name: a.teams?.name_en ?? a.teams?.name ?? '—',
          scheduled_date: a.scheduled_date,
          time_slot: a.time_slot,
          duration: a.duration ?? '1',
        })),
      }
    },
  })
}
