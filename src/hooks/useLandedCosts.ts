import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

export type LandedCostLine = {
  description: string
  amount: number
  currency: string
  exchange_rate: number   // default 1; used for non-QAR lines
  bill_path?: string | null
}

export type LandedCostItemAllocation = {
  brand_variant_id: string
  item_name: string
  sku: string | null
  qty_received: number
  qty_remaining_at_lc: number
  original_unit_cost: number
  lc_per_unit: number
  allocated_lc_total: number
  // Legacy alias returned by RPC (allocated LC per received unit)
  allocated_cost: number
  updated_unit_cost: number
}

export type LandedCost = {
  id: string
  lc_number: string
  description: string | null
  total_amount: number
  currency: string
  lines: LandedCostLine[]
  attached_receival_ids: string[]
  attached_po_ids: string[]
  all_items_sold: boolean
  date: string
  item_allocations: LandedCostItemAllocation[] | null
  voided_at: string | null
  voided_reason: string | null
  applied_at: string | null
  revert_snapshot: unknown | null   // opaque JSONB — only the RPC reads it
  created_at: string
  updated_at: string
}

export type CreateLandedCostPayload = {
  description?: string | null
  date: string
  currency: string
  lines: LandedCostLine[]
  attached_receival_ids: string[]
  attached_po_ids: string[]
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useLandedCosts({ search = '' }: { search?: string } = {}) {
  return useQuery({
    queryKey: ['landed_costs', { search }],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('landed_costs')
        .select('*')
        .order('date', { ascending: false })
      if (search) {
        q = q.or(`lc_number.ilike.%${search}%,description.ilike.%${search}%`)
      }
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as LandedCost[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useLandedCost(id: string) {
  return useQuery({
    queryKey: ['landed_costs', id],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('landed_costs')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as LandedCost
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateLandedCost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateLandedCostPayload) => {
      const supabase = createClient()
      // total_amount computed in Postgres NUMERIC — no JS float rounding
      const { data, error } = await (supabase as any).rpc('create_landed_cost', {
        p_description:           payload.description ?? null,
        p_date:                  payload.date,
        p_currency:              payload.currency,
        p_lines:                 payload.lines,
        p_attached_receival_ids: payload.attached_receival_ids,
        p_attached_po_ids:       payload.attached_po_ids,
      })
      if (error) throw error
      return data as LandedCost
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['landed_costs'] }),
  })
}

export function useVoidLandedCost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('landed_costs')
        .update({ voided_at: new Date().toISOString(), voided_reason: reason })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['landed_costs'] }),
  })
}

export function useApplyLandedCost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .rpc('allocate_landed_cost', { p_lc_id: id })
      if (error) throw error
      return data as LandedCostItemAllocation[]
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['landed_costs'] }),
  })
}

export function useRevertLandedCost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .rpc('revert_landed_cost', { p_lc_id: id })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['landed_costs'] }),
  })
}

export type LcValidationItem = {
  brand_variant_id: string
  item_name: string
  sku: string | null
  qty_received: number
  qty_remaining_in_layers: number
  warning: string | null
}

export function useValidateLcAllocation(lcId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['validate-lc-allocation', lcId],
    enabled: !!lcId && enabled,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .rpc('validate_lc_allocation', { p_lc_id: lcId })
      if (error) throw error
      return (data ?? []) as LcValidationItem[]
    },
    staleTime: 0, // always fresh — called right before a destructive action
  })
}

export function useBillSignedUrls(paths: (string | null | undefined)[]) {
  const validPaths = (paths.filter(Boolean) as string[]).slice().sort()
  return useQuery({
    queryKey: ['bill-signed-urls', validPaths],
    enabled: validPaths.length > 0,
    queryFn: async () => {
      const supabase = createClient()
      const result: Record<string, string> = {}
      await Promise.all(
        validPaths.map(async (path) => {
          const { data } = await supabase.storage.from('lc-bills').createSignedUrl(path, 3600)
          if (data?.signedUrl) result[path] = data.signedUrl
        })
      )
      return result
    },
    staleTime: 50 * 60 * 1000, // tokens last 60 min; refresh at 50 min
  })
}
