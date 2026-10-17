import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type Engagement = 'not_started' | 'in_discussion' | 'quotation_received' | 'negotiating' | 'ready_to_order' | 'on_hold'
export type ForecastStatus = 'open' | 'ordered' | 'cancelled'

export type PurchaseForecast = {
  id: string
  forecast_number: string
  division_id: string
  brand_variant_id: string | null
  item_name: string | null
  sku: string | null
  qty: number
  supplier_id: string | null
  supplier_name: string | null
  currency: string
  est_value: number | null
  planned_order_date: string | null
  needed_by_date: string | null
  engagement: Engagement
  status: ForecastStatus
  po_id: string | null
  shipment_id: string | null
  notes: string | null
  created_at: string
}

export type ForecastInput = {
  division_id: string
  brand_variant_id: string | null
  item_name: string | null
  sku: string | null
  qty: number
  supplier_id: string | null
  supplier_name: string | null
  currency: string
  est_value: number | null
  planned_order_date: string | null
  needed_by_date: string | null
  engagement: Engagement
  notes: string | null
}

// purchase_forecasts is not in the generated Database types (same situation as
// the shipment tables) — reach it through a loose handle and cast to the row type.
type LooseResult = { data: unknown; error: { message: string } | null }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function looseFrom(t: string): any { return (createClient().from as unknown as (t: string) => unknown)(t) }

export function usePurchaseForecasts(filters?: { status?: ForecastStatus; engagement?: Engagement; search?: string; divisionId?: string }) {
  return useQuery({
    queryKey: queryKeys.forecasts.list(filters),
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<PurchaseForecast[]> => {
      const { data, error } = (await looseFrom('purchase_forecasts')
        .select('*').order('created_at', { ascending: false })) as LooseResult
      if (error) throw new Error(error.message)
      let rows = (data as PurchaseForecast[]) ?? []
      if (filters?.divisionId) rows = rows.filter((r) => r.division_id === filters.divisionId)
      if (filters?.status) rows = rows.filter((r) => r.status === filters.status)
      if (filters?.engagement) rows = rows.filter((r) => r.engagement === filters.engagement)
      const s = filters?.search?.trim().toLowerCase()
      if (s) rows = rows.filter((r) =>
        r.forecast_number.toLowerCase().includes(s) ||
        (r.item_name ?? '').toLowerCase().includes(s) ||
        (r.sku ?? '').toLowerCase().includes(s) ||
        (r.supplier_name ?? '').toLowerCase().includes(s))
      return rows
    },
  })
}

export function useForecast(id: string | null) {
  return useQuery({
    queryKey: ['purchase-forecasts', 'one', id],
    enabled: !!id,
    queryFn: async (): Promise<PurchaseForecast | null> => {
      const { data, error } = (await looseFrom('purchase_forecasts').select('*').eq('id', id!).maybeSingle()) as LooseResult
      if (error) throw new Error(error.message)
      return (data as PurchaseForecast) ?? null
    },
  })
}

export function useCreateForecast() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ForecastInput) => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = (await looseFrom('purchase_forecasts')
        .insert({ ...input, created_by: user?.id ?? null })) as LooseResult
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.forecasts.all }),
  })
}

export function useUpdateForecast() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<ForecastInput> & { id: string; engagement?: Engagement }) => {
      const { error } = (await looseFrom('purchase_forecasts').update(patch).eq('id', id)) as LooseResult
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.forecasts.all }),
  })
}

export function useCancelForecast() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = (await looseFrom('purchase_forecasts').update({ status: 'cancelled' }).eq('id', id)) as LooseResult
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.forecasts.all }),
  })
}

export function useLinkForecastPo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ forecastId, poId }: { forecastId: string; poId: string }) => {
      const supabase = createClient()
      const { error } = await (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ error: { message: string } | null }>)(
        'rpc_link_forecast_po', { p_forecast_id: forecastId, p_po_id: poId })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.forecasts.all }) },
  })
}
