import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/logActivity'
import type { DBTable, DBInsert } from '@/types/database.types'
import { queryKeys } from '@/lib/queryKeys'

/**
 * D.1 auto-creates sub-containers with the name "<Warehouse> — <Division>",
 * which duplicates whatever warehouse is already selected in the parent UI.
 * This helper strips the prefix (case-insensitive) so filter rows show the
 * distinguishing bit only. Custom-named sub-containers pass through
 * unchanged.
 */
export function shortenSubContainerName(subName: string, warehouseName?: string | null): string {
  if (!warehouseName) return subName
  const wh = warehouseName.trim().toLowerCase()
  const trimmed = subName.trim()
  if (trimmed.toLowerCase().startsWith(wh)) {
    const rest = trimmed.slice(warehouseName.length).replace(/^\s*[—–-]\s*/, '')
    return rest || trimmed
  }
  return trimmed
}

export type WarehouseSubContainer = DBTable<'warehouse_sub_containers'> & {
  division_name: string | null
}

export type ActiveSubContainerRow = {
  sub_container_id:   string
  sub_container_name: string
  warehouse_id:       string
  warehouse_name:     string
  division_id:        string | null
  division_name:      string | null
}

/**
 * Phase D.14 — every active, non-virtual-warehouse sub-container the caller
 * can see. Powers the "Warehouse — Sub-container (Division)" composite
 * dropdown in the bulk inventory import template. RLS-scoped: Kitchen
 * operators bulk-importing shared inventory won't see Maintenance's
 * sub-containers here — that's correct; sharing metadata gets applied
 * post-import via the D.12 item-edit surface.
 */
export function useAllActiveSubContainers() {
  return useQuery({
    queryKey: ['warehouse-sub-containers', 'active-all'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      // Two-pass fetch: PostgREST's nested-FK join can 400 silently when
      // ambient RLS + implicit relationships disagree. Fetching the parent
      // tables separately and stitching client-side is boring but reliable.
      const { data: subs, error } = await supabase
        .from('warehouse_sub_containers')
        .select('id, name, warehouse_id, division_id')
        .eq('is_active', true)
        .limit(500)
      if (error) throw error
      const rawSubs = (subs ?? []) as Array<{
        id:           string
        name:         string
        warehouse_id: string
        division_id:  string | null
      }>
      if (rawSubs.length === 0) return []

      const whIds  = Array.from(new Set(rawSubs.map((s) => s.warehouse_id)))
      const divIds = Array.from(new Set(rawSubs.map((s) => s.division_id).filter((v): v is string => !!v)))

      const [{ data: whs }, { data: divs }] = await Promise.all([
        supabase.from('warehouses').select('id, name, is_virtual').in('id', whIds).limit(500),
        divIds.length > 0
          ? supabase.from('company_divisions').select('id, name').in('id', divIds).limit(500)
          : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      ])

      const whMap  = new Map<string, { name: string; is_virtual: boolean | null }>()
      for (const w of (whs ?? []) as Array<{ id: string; name: string; is_virtual: boolean | null }>) {
        whMap.set(w.id, { name: w.name, is_virtual: w.is_virtual })
      }
      const divMap = new Map<string, string>()
      for (const d of (divs ?? []) as Array<{ id: string; name: string }>) {
        divMap.set(d.id, d.name)
      }

      const rows: ActiveSubContainerRow[] = []
      for (const s of rawSubs) {
        const wh = whMap.get(s.warehouse_id)
        if (wh?.is_virtual) continue
        rows.push({
          sub_container_id:   s.id,
          sub_container_name: s.name,
          warehouse_id:       s.warehouse_id,
          warehouse_name:     wh?.name ?? '?',
          division_id:        s.division_id,
          division_name:      s.division_id ? (divMap.get(s.division_id) ?? null) : null,
        })
      }
      return rows.sort((a, b) => {
        const wCmp = a.warehouse_name.localeCompare(b.warehouse_name)
        if (wCmp !== 0) return wCmp
        return a.sub_container_name.localeCompare(b.sub_container_name)
      })
    },
  })
}

export function useWarehouseSubContainers(warehouseId?: string | null) {
  return useQuery({
    queryKey: queryKeys.warehouseSubContainers.byWarehouse(warehouseId ?? null),
    queryFn: async () => {
      if (!warehouseId) return [] as WarehouseSubContainer[]
      const supabase = createClient()
      const { data, error } = await supabase
        .from('warehouse_sub_containers')
        .select('*, company_divisions(name)')
        .eq('warehouse_id', warehouseId)
        .order('created_at')
      if (error) throw error
      return (data ?? []).map((row) => {
        const { company_divisions, ...rest } = row as typeof row & {
          company_divisions: { name: string } | null
        }
        return { ...rest, division_name: company_divisions?.name ?? null }
      }) as WarehouseSubContainer[]
    },
    enabled: !!warehouseId,
    staleTime: 60 * 1000,
  })
}

export function useCreateWarehouseSubContainer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: {
      warehouse_id: string
      division_id: string | null
      name: string
    }) => {
      const supabase = createClient()
      // The generated types were captured before Phase C.1's
      // ALTER COLUMN division_id DROP NOT NULL, so they still forbid null on
      // insert. At the DB level the trigger `_enforce_sub_container_division_rule`
      // permits null only for virtual warehouses. Cast through the Insert type
      // so callers can pass null when the parent warehouse is virtual.
      const payload = values as unknown as DBInsert<'warehouse_sub_containers'>
      const { data, error } = await supabase
        .from('warehouse_sub_containers')
        .insert(payload)
        .select()
        .single()
      if (error) throw error
      void logActivity({
        action: 'Sub-container Created',
        module: 'warehouses',
        entity_id: data.id,
        entity_type: 'warehouse_sub_container',
        new_data: data as unknown as Record<string, unknown>,
      })
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({
        queryKey: queryKeys.warehouseSubContainers.byWarehouse(data.warehouse_id),
      })
      qc.invalidateQueries({ queryKey: queryKeys.warehouses.all })
    },
  })
}

export function useUpdateWarehouseSubContainer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: {
      id: string
      name?: string
      is_active?: boolean
    }) => {
      const supabase = createClient()
      const { data: old } = await supabase
        .from('warehouse_sub_containers')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      const { data, error } = await supabase
        .from('warehouse_sub_containers')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      void logActivity({
        action: values.is_active === false ? 'Sub-container Deactivated' : 'Sub-container Updated',
        module: 'warehouses',
        entity_id: id,
        entity_type: 'warehouse_sub_container',
        old_data: old as unknown as Record<string, unknown> | null,
        new_data: data as unknown as Record<string, unknown>,
      })
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({
        queryKey: queryKeys.warehouseSubContainers.byWarehouse(data.warehouse_id),
      })
    },
  })
}

export function useDeactivateWarehouseSubContainer() {
  const update = useUpdateWarehouseSubContainer()
  return {
    ...update,
    mutate: (id: string, opts?: Parameters<typeof update.mutate>[1]) =>
      update.mutate({ id, is_active: false }, opts),
    mutateAsync: (id: string) => update.mutateAsync({ id, is_active: false }),
  }
}
