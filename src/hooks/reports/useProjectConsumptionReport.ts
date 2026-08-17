import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { ReportFilters } from '@/components/reports/ReportFilterBar'

export type ProjectConsumptionRow = {
  consumer_kind:   string
  consumer_id:     string
  consumer_name:   string
  project_number:  string | null
  discipline_name: string | null
  milestone_label: string
  code:            string | null
  item_name:       string | null
  sku:             string | null
  consumed_on:     string
  qty:             number
  total_cost:      number
}

/** VWh Projects Phase 4 — consumption spend by consumer (team/project), with discipline + milestone rows within each consumer band. */
export function useProjectConsumptionReport(filters: ReportFilters, enabled = true) {
  return useQuery({
    queryKey: ['report', 'project-consumption', filters.start, filters.end, filters.divisionIds],
    enabled,
    queryFn: async (): Promise<ProjectConsumptionRow[]> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_report_project_consumption' as never, {
        p_from: filters.start || null,
        p_to: filters.end || null,
        p_division_ids: filters.divisionIds.length ? filters.divisionIds : null,
      } as never)
      if (error) throw new Error(error.message)
      return (data as unknown as ProjectConsumptionRow[]) ?? []
    },
    staleTime: 60_000,
  })
}
