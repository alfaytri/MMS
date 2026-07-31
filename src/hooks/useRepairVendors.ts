/**
 * Phase 9.6 — Repair vendors CRUD hooks.
 *
 * `repair_vendors` is a plain table (no RPCs — direct inserts/updates).
 * The `_repair_vendor_provision_warehouse` AFTER-INSERT trigger auto-creates
 * a virtual `warehouses` row per vendor and back-links `virtual_warehouse_id`.
 * List queries include a `.limit(500)` per docs/supabase-budget.md.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import type { DBTable, DBInsert, DBUpdate } from '@/types/database.types'

export type RepairVendor = DBTable<'repair_vendors'>
export type RepairVendorInsert = DBInsert<'repair_vendors'>
export type RepairVendorUpdate = DBUpdate<'repair_vendors'>

export function useRepairVendors(options?: { activeOnly?: boolean }) {
  const activeOnly = options?.activeOnly ?? false
  return useQuery({
    queryKey: activeOnly ? queryKeys.repairVendors.active : queryKeys.repairVendors.all,
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('repair_vendors')
        .select('*')
        .order('name')
        .limit(500)
      if (activeOnly) q = q.eq('is_active', true)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as RepairVendor[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateRepairVendor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: Pick<RepairVendorInsert, 'name' | 'phone' | 'address' | 'notes'>) => {
      const supabase = createClient()
      // INSERT returns the pre-trigger row (virtual_warehouse_id null).
      // Refetch afterwards to pick up the back-linked warehouse id.
      const { data, error } = await supabase
        .from('repair_vendors')
        .insert({
          name: values.name.trim(),
          phone: values.phone?.trim() || null,
          address: values.address?.trim() || null,
          notes: values.notes?.trim() || null,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as RepairVendor
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.repairVendors.all })
      qc.invalidateQueries({ queryKey: queryKeys.repairVendors.active })
      qc.invalidateQueries({ queryKey: queryKeys.warehouses.all })
    },
  })
}

export function useUpdateRepairVendor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: { id: string } & Partial<Pick<RepairVendorUpdate, 'name' | 'phone' | 'address' | 'notes' | 'is_active'>>) => {
      const supabase = createClient()
      const payload: RepairVendorUpdate = {
        ...(values.name       !== undefined && { name: values.name.trim() }),
        ...(values.phone      !== undefined && { phone: values.phone?.trim() || null }),
        ...(values.address    !== undefined && { address: values.address?.trim() || null }),
        ...(values.notes      !== undefined && { notes: values.notes?.trim() || null }),
        ...(values.is_active  !== undefined && { is_active: values.is_active }),
        updated_at: new Date().toISOString(),
      }
      const { data, error } = await supabase
        .from('repair_vendors')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw error
      return data as RepairVendor
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.repairVendors.all })
      qc.invalidateQueries({ queryKey: queryKeys.repairVendors.active })
      qc.invalidateQueries({ queryKey: queryKeys.repairVendors.detail(variables.id) })
    },
  })
}
