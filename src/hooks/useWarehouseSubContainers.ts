import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/logActivity'
import type { DBTable } from '@/types/database.types'
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
  division_name:               string | null
  // Populated when the row comes from get_warehouse_sub_containers_admin.
  // Null on the RLS-scoped useWarehouseSubContainers path (direct table
  // select doesn't join user_data).
  responsible_person_name?:    string | null
  responsible_person_phone?:   string | null
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

/**
 * Admin-scoped variant of useWarehouseSubContainers used by the Master
 * Data → Warehouses page. Calls the SECURITY DEFINER RPC so the operator
 * sees every sub regardless of their active_division_id, and receives
 * the joined responsible-person name + phone in one shot.
 *
 * Do NOT use this hook for operator-facing pickers — they must remain
 * RLS-scoped so a Maintenance operator doesn't see Kitchen subs.
 */
export function useWarehouseSubContainersAdmin(warehouseId?: string | null) {
  return useQuery({
    queryKey: ['warehouse-sub-containers', 'admin', warehouseId ?? null],
    queryFn: async () => {
      if (!warehouseId) return [] as WarehouseSubContainer[]
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_warehouse_sub_containers_admin', {
        p_warehouse_id: warehouseId,
      })
      if (error) throw error
      return (data ?? []).map((r): WarehouseSubContainer => ({
        id:                              r.id,
        warehouse_id:                    r.warehouse_id,
        division_id:                     r.division_id,
        division_name:                   r.division_name,
        name:                            r.name,
        is_active:                       r.is_active,
        team_id:                         r.team_id,
        responsible_person_profile_id:   r.responsible_person_profile_id,
        responsible_person_name:         r.responsible_person_name,
        responsible_person_phone:        r.responsible_person_phone,
        created_at:                      r.created_at,
        created_by:                      null,
        updated_at:                      r.updated_at,
      }))
    },
    enabled: !!warehouseId,
    staleTime: 60 * 1000,
  })
}

// Postgres error codes we translate to friendlier messages for the sub-container upsert.
function mapSubDbError(err: { code?: string; message?: string } | null | undefined): Error {
  if (!err) return new Error('Unknown error')
  if (err.code === '23505') {
    return new Error('A sub-container with that name already exists in this warehouse.')
  }
  return new Error(err.message ?? 'Unknown error')
}

export function useCreateWarehouseSubContainer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: {
      warehouse_id: string
      division_id: string | null
      name: string
      responsible_person_profile_id?: string | null
    }) => {
      const supabase = createClient()
      // Route through the SECURITY DEFINER upsert so admin can create subs
      // across divisions from the consolidated Warehouses page.
      const { data, error } = await supabase.rpc('rpc_upsert_warehouse_sub_container', {
        p_warehouse_id: values.warehouse_id,
        p_name:         values.name.trim(),
        p_division_id:  values.division_id ?? undefined,
        p_is_active:    true,
        p_responsible_person_profile_id: values.responsible_person_profile_id ?? undefined,
      })
      if (error) throw mapSubDbError(error)
      const newId = data as unknown as string
      void logActivity({
        action: 'Sub-container Created',
        module: 'warehouses',
        entity_id: newId,
        entity_type: 'warehouse_sub_container',
        new_data: { warehouse_id: values.warehouse_id, name: values.name } as Record<string, unknown>,
      })
      return { id: newId, warehouse_id: values.warehouse_id }
    },
    onSuccess: (data) => {
      qc.invalidateQueries({
        queryKey: queryKeys.warehouseSubContainers.byWarehouse(data.warehouse_id),
      })
      qc.invalidateQueries({ queryKey: ['warehouse-sub-containers', 'admin', data.warehouse_id] })
      qc.invalidateQueries({ queryKey: queryKeys.warehouses.all })
    },
  })
}

export function useUpdateWarehouseSubContainer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: {
      id:                             string
      warehouse_id:                   string
      name?:                          string
      division_id?:                   string | null
      is_active?:                     boolean
      responsible_person_profile_id?: string | null   // undefined = leave alone, null = clear
    }) => {
      const supabase = createClient()

      // Resolve current values so the SECURITY DEFINER upsert always sees the
      // full payload. Direct table read is RLS-scoped; if the caller's active
      // division doesn't cover the sub, fall through to the admin RPC list
      // instead.
      let current: {
        name: string
        division_id: string | null
        is_active: boolean
        responsible_person_profile_id: string | null
      } | null = null
      const { data: directRow } = await supabase
        .from('warehouse_sub_containers')
        .select('name, division_id, is_active, responsible_person_profile_id')
        .eq('id', id)
        .maybeSingle()
      if (directRow) {
        current = directRow as unknown as typeof current
      } else {
        const { data: adminList } = await supabase.rpc('get_warehouse_sub_containers_admin', {
          p_warehouse_id: values.warehouse_id,
        })
        const match = (adminList ?? []).find((r: { id: string }) => r.id === id)
        if (match) {
          current = {
            name: match.name,
            division_id: match.division_id,
            is_active: match.is_active,
            responsible_person_profile_id: match.responsible_person_profile_id,
          }
        }
      }
      if (!current) throw new Error('Sub-container not found')

      const { data, error } = await supabase.rpc('rpc_upsert_warehouse_sub_container', {
        p_warehouse_id: values.warehouse_id,
        p_id:           id,
        p_name:         (values.name ?? current.name).trim(),
        p_division_id:  (values.division_id ?? current.division_id) ?? undefined,
        p_is_active:    values.is_active   ?? current.is_active,
        p_responsible_person_profile_id:
          (values.responsible_person_profile_id === undefined
            ? current.responsible_person_profile_id
            : values.responsible_person_profile_id) ?? undefined,
      })
      if (error) throw mapSubDbError(error)

      void logActivity({
        action: values.is_active === false ? 'Sub-container Deactivated'
              : values.is_active === true  ? 'Sub-container Reactivated'
              : 'Sub-container Updated',
        module: 'warehouses',
        entity_id: id,
        entity_type: 'warehouse_sub_container',
        old_data: current as unknown as Record<string, unknown>,
        new_data: values as unknown as Record<string, unknown>,
      })
      return { id: (data as unknown as string) ?? id, warehouse_id: values.warehouse_id }
    },
    onSuccess: (data) => {
      qc.invalidateQueries({
        queryKey: queryKeys.warehouseSubContainers.byWarehouse(data.warehouse_id),
      })
      qc.invalidateQueries({ queryKey: ['warehouse-sub-containers', 'admin', data.warehouse_id] })
      qc.invalidateQueries({ queryKey: queryKeys.warehouses.all })
    },
  })
}

export function useDeactivateWarehouseSubContainer() {
  const update = useUpdateWarehouseSubContainer()
  return {
    ...update,
    mutate: (
      { id, warehouse_id }: { id: string; warehouse_id: string },
      opts?: Parameters<typeof update.mutate>[1],
    ) => update.mutate({ id, warehouse_id, is_active: false }, opts),
    mutateAsync: ({ id, warehouse_id }: { id: string; warehouse_id: string }) =>
      update.mutateAsync({ id, warehouse_id, is_active: false }),
  }
}

export function useReactivateWarehouseSubContainer() {
  const update = useUpdateWarehouseSubContainer()
  return {
    ...update,
    mutate: (
      { id, warehouse_id }: { id: string; warehouse_id: string },
      opts?: Parameters<typeof update.mutate>[1],
    ) => update.mutate({ id, warehouse_id, is_active: true }, opts),
    mutateAsync: ({ id, warehouse_id }: { id: string; warehouse_id: string }) =>
      update.mutateAsync({ id, warehouse_id, is_active: true }),
  }
}
