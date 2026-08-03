/**
 * Phase 9.6 — Repair vendors CRUD hooks.
 *
 * `repair_vendors` is a plain table (no RPCs — direct inserts/updates).
 * Post-D.6.b: `_repair_vendor_provision_warehouse` is a BEFORE-INSERT trigger
 * that creates a `warehouse_sub_containers` row for the vendor under the
 * SHARED "Repair" warehouse (`is_virtual=true`, one row for all vendors) and
 * stamps `virtual_warehouse_id` + `sub_container_id` on the incoming NEW row.
 * The insert returns the fully-populated row — no separate refetch needed.
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
      // Post-D.6.b: BEFORE-INSERT trigger stamps virtual_warehouse_id +
      // sub_container_id, so the returned row is fully populated.
      // Cast payload: the BEFORE-INSERT trigger stamps virtual_warehouse_id
      // + sub_container_id post-D.6.b, but the generated Insert type treats
      // both as required. Cast documents the intentional under-specification.
      const { data, error } = await supabase
        .from('repair_vendors')
        .insert({
          name: values.name.trim(),
          phone: values.phone?.trim() || null,
          address: values.address?.trim() || null,
          notes: values.notes?.trim() || null,
        } as unknown as RepairVendorInsert)
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
