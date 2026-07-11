// src/hooks/useInventoryReceivals.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { logActivity } from '@/lib/logActivity'

export type InventoryReceivalMode = 'carve' | 'new_stock'

export type CreateInventoryReceivalPayload = {
  mode: InventoryReceivalMode
  warehouse_id: string
  brand_variant_id: string
  qty: number
  unit_cost: number
  source_layer_id: string | null
  date: string
  notes: string | null
}

export type FifoLayerOption = {
  id: string
  receival_number: string | null
  date: string
  qty: number
  remaining_qty: number
  unit_cost: number
  landed_cost_per_unit: number
  total_unit_cost: number
}

// ─── Permission check ─────────────────────────────────────────────────────────

export function useCanCreateInventoryReceivals() {
  return useQuery({
    queryKey: queryKeys.receivals.canCreateInventoryReceival,
    queryFn: async (): Promise<boolean> => {
      const supabase = createClient()
      const { data: userRes, error: userErr } = await supabase.auth.getUser()
      if (userErr || !userRes.user) return false

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('auth_user_id', userRes.user.id)
        .maybeSingle()
      if (!profile) return false

      const { data, error } = await supabase
        .from('user_custom_roles')
        .select('custom_roles!inner(is_inventory_receiver, deleted_at)')
        .eq('profile_id', profile.id)

      if (error) return false
      type Row = {
        custom_roles:
          | { is_inventory_receiver: boolean | null; deleted_at: string | null }
          | null
      }
      return (data ?? []).some(
        (r) =>
          (r as unknown as Row).custom_roles?.is_inventory_receiver === true &&
          !(r as unknown as Row).custom_roles?.deleted_at,
      )
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ─── FIFO layers for a variant/warehouse ──────────────────────────────────────

export function useFifoLayersForVariant(
  brandVariantId: string | null,
  warehouseId: string | null,
) {
  return useQuery({
    enabled: !!brandVariantId && !!warehouseId,
    queryKey: queryKeys.receivals.inventoryReceivable(brandVariantId, warehouseId),
    queryFn: async (): Promise<FifoLayerOption[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('fifo_cost_layers')
        .select('id,receival_number,date,qty,remaining_qty,unit_cost,landed_cost_per_unit,total_unit_cost')
        .eq('brand_variant_id', brandVariantId!)
        .eq('warehouse_id', warehouseId!)
        .gt('remaining_qty', 0)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as FifoLayerOption[]
    },
  })
}

// ─── Create mutation ──────────────────────────────────────────────────────────

export function useCreateInventoryReceival() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateInventoryReceivalPayload) => {
      const supabase = createClient()
      // Cast until database.types.ts is regenerated to include the new RPC.
      const { data, error } = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>)(
        'create_inventory_receival',
        {
          p_mode: payload.mode,
          p_warehouse_id: payload.warehouse_id,
          p_brand_variant_id: payload.brand_variant_id,
          p_qty: payload.qty,
          p_unit_cost: payload.unit_cost,
          p_source_layer_id: payload.source_layer_id,
          p_date: payload.date,
          p_notes: payload.notes,
        },
      )
      if (error) throw error

      const result = data as unknown as {
        id: string
        receival_number: string
        [key: string]: unknown
      }

      void logActivity({
        action: 'Inventory Receival Created',
        module: 'receivals',
        entity_id: result.id,
        entity_type: 'receival',
        new_data: result as unknown as Record<string, unknown>,
      })

      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.receivals.all })
      queryClient.invalidateQueries({ queryKey: ['fifo-layers-for-variant'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-variants'] })
      queryClient.invalidateQueries({ queryKey: ['warehouse-stock'] })
    },
  })
}
