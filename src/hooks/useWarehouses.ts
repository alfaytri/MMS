import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/logActivity'
import type { DBTable, DBInsert, DBUpdate } from '@/types/database.types'
import { queryKeys } from '@/lib/queryKeys'

export type WarehouseResponsiblePerson = {
  profile_id: string
  full_name: string | null
}

export type WarehouseSubContainerBreakdown = {
  sub_container_id: string
  sub_container_name: string
  is_active: boolean
  item_count: number
  total_value: number
  division_id: string | null
  division_name: string | null
}

// Natural (numeric-aware) name order so "Team 2" sorts before "Team 10" and
// zero-padded names ("Team 01") stay correct too — used for every
// sub-container list/picker so teams read in a-z / 1..N order.
export function compareSubContainerName(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

export type Warehouse = DBTable<'warehouses'> & {
  responsible_persons: WarehouseResponsiblePerson[]
  division_name: string | null
  company_name: string | null
  sub_container_breakdown: WarehouseSubContainerBreakdown[]
  // Added by migration 20261008000000 (Blue Plate / coordinates); not yet in the
  // generated DBTable type. `select('*')` returns them at runtime.
  latitude: number | null
  longitude: number | null
}
export type WarehouseInsert = DBInsert<'warehouses'>
export type WarehouseUpdate = DBUpdate<'warehouses'>

/**
 * Fetch warehouses. By default excludes virtual warehouses (repair-vendor
 * shadows introduced in Phase 9.2). Virtual warehouses are internal-only
 * transfer targets — they must NOT appear in operator warehouse pickers
 * (restock, receival source, delivery source, transfer picker, etc.). The
 * only surface that legitimately needs them is Master Data → Warehouses
 * (for admin visibility); that page opts in with `{ includeVirtual: true }`.
 */
export function useWarehouses(options?: { includeVirtual?: boolean; excludeKinds?: string[] }) {
  const includeVirtual = options?.includeVirtual ?? false
  const excludeKinds   = options?.excludeKinds ?? []
  return useQuery({
    queryKey: [...queryKeys.warehouses.all, { includeVirtual, excludeKinds: excludeKinds.slice().sort().join(',') }],
    queryFn: async () => {
      const supabase = createClient()
      // Phase E: warehouses.division_id is gone. The embedded
      // `company_divisions(name)` join relied on that FK — dropping it 400s
      // every subsequent read. `division_name` on the returned rows is now
      // always null (per-warehouse division doesn't exist anymore — a
      // warehouse hosts N per-division sub-containers). Callers that used
      // it (WhWarehousesTab, master-data admin page) already fall through
      // to null-safe rendering; the field stays on the type for source
      // compatibility until the next sweep.
      let q = supabase
        .from('warehouses')
        .select(
          '*, companies(name_en), warehouse_responsible_persons(profile_id, user_data(full_name))'
        )
        .order('name')
      if (!includeVirtual) {
        // is_virtual defaults to false, but be explicit — legacy rows and
        // any future virtual-flag additions must be filtered too.
        q = q.or('is_virtual.is.null,is_virtual.eq.false')
      }
      if (excludeKinds.length > 0) {
        // Teams and Places kinds ship as is_virtual=true so they're already
        // filtered when includeVirtual=false. This is only meaningful when
        // includeVirtual=true (Master Data → Warehouses) to keep Repair
        // visible while hiding Teams/Places from the admin overview.
        q = q.not('warehouse_kind', 'in', `(${excludeKinds.map((k) => `"${k}"`).join(',')})`)
      }
      // Fan out the warehouse fetch and the sub-container breakdown fetch in
      // parallel — the breakdown feeds WhWarehousesTab card totals (D.9).
      // Phase E: don't fail the whole warehouse list if the breakdown view
      // errors — WhWarehousesTab degrades gracefully to empty breakdowns
      // whereas every other picker (PO Receive, delivery, transfer, etc.)
      // stops working entirely if warehouses returns nothing. A hard failure
      // here manifested as an empty Warehouse dropdown on PO Receive after
      // the Phase E column drops.
      const [{ data, error }, breakdownRes] =
        await Promise.all([
          q,
          supabase
            .from('warehouse_sub_container_totals')
            .select('warehouse_id, sub_container_id, sub_container_name, sub_container_is_active, item_count, total_value, division_id, division_name'),
        ])
      if (error) throw error
      // division_id/division_name were appended to the view (migration
      // 20261007000000) after the checked-in database.types were generated, so
      // cast to the current shape rather than trusting the stale Row type.
      const breakdownRows = (breakdownRes.error ? [] : breakdownRes.data ?? []) as unknown as Array<{
        warehouse_id: string | null
        sub_container_id: string | null
        sub_container_name: string | null
        sub_container_is_active: boolean | null
        item_count: number | null
        total_value: number | null
        division_id: string | null
        division_name: string | null
      }>
      if (breakdownRes.error) {
        console.warn('[useWarehouses] sub-container breakdown fetch failed — cards will show without breakdowns:', breakdownRes.error.message)
      }

      const breakdownByWh = new Map<string, WarehouseSubContainerBreakdown[]>()
      for (const b of breakdownRows) {
        if (!b.warehouse_id || !b.sub_container_id) continue
        const arr = breakdownByWh.get(b.warehouse_id) ?? []
        arr.push({
          sub_container_id: b.sub_container_id,
          sub_container_name: b.sub_container_name ?? 'Unnamed',
          is_active: b.sub_container_is_active ?? true,
          item_count: Number(b.item_count ?? 0),
          total_value: Number(b.total_value ?? 0),
          division_id: b.division_id ?? null,
          division_name: b.division_name ?? null,
        })
        breakdownByWh.set(b.warehouse_id, arr)
      }
      // Order every warehouse's sub-containers a-z / 1..N by name (the view is
      // unordered; teams were landing in insertion order).
      for (const arr of breakdownByWh.values()) {
        arr.sort((a, b) => compareSubContainerName(a.sub_container_name, b.sub_container_name))
      }

      return (data ?? []).map((row) => {
        const { warehouse_responsible_persons, companies, ...rest } =
          row as typeof row & {
            companies: { name_en: string } | null
            warehouse_responsible_persons: Array<{
              profile_id: string
              user_data: { full_name: string | null } | null
            }>
          }
        const rps = (warehouse_responsible_persons ?? []).map((rp) => ({
          profile_id: rp.profile_id,
          full_name: rp.user_data?.full_name ?? null,
        }))
        return {
          ...rest,
          responsible_persons: rps,
          division_name: null,
          company_name: companies?.name_en ?? null,
          sub_container_breakdown: breakdownByWh.get(rest.id) ?? [],
        }
      }) as Warehouse[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateWarehouse() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: WarehouseInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('warehouses')
        .insert(values)
        .select()
        .single()
      if (error) throw error
      void logActivity({
        action: 'Warehouse Created',
        module: 'warehouses',
        entity_id: data.id,
        entity_type: 'warehouse',
        new_data: data as unknown as Record<string, unknown>,
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouses.all })
    },
  })
}

export function useUpdateWarehouse() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: WarehouseUpdate & { id: string }) => {
      const supabase = createClient()
      const { data: old } = await supabase
        .from('warehouses')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      const { data, error } = await supabase
        .from('warehouses')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      void logActivity({
        action: 'Warehouse Updated',
        module: 'warehouses',
        entity_id: id,
        entity_type: 'warehouse',
        old_data: old as unknown as Record<string, unknown> | null,
        new_data: data as unknown as Record<string, unknown>,
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouses.all })
    },
  })
}

export function useDeleteWarehouse() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { data: old } = await supabase
        .from('warehouses')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      // delete_warehouse() removes the warehouse together with its (empty)
      // sub-containers atomically. A bare warehouses.delete() hit the
      // sub-container FK (RESTRICT) whenever any sub-container row remained, and
      // deleting sub-containers client-side is blocked by their RESTRICTIVE
      // division-scope policy when the active division differs. The RPC bypasses
      // that policy but raises a friendly error if any stock/history remains.
      // 'delete_warehouse' isn't in the generated RPC types yet — cast name+args.
      const { error } = await supabase.rpc(
        'delete_warehouse' as never,
        { p_warehouse_id: id } as never,
      )
      // Throw the RAW error so Sentry captures full DB detail; the page's
      // onError humanizes it for the toast (humanizeDbError passes the RPC's
      // P0001 "still has stock" message through and friendlies the rest).
      if (error) throw error
      void logActivity({
        action: 'Warehouse Deleted',
        module: 'warehouses',
        entity_id: id,
        entity_type: 'warehouse',
        severity: 'warning',
        old_data: old as unknown as Record<string, unknown> | null,
      })
    },
    onSuccess: () => {
      // The warehouse and its sub-containers are gone — refresh both the
      // warehouse list and every sub-container-derived view (division map,
      // totals, custody warehouses).
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouses.all })
      queryClient.invalidateQueries({ queryKey: ['warehouse-sub-containers'] })
      queryClient.invalidateQueries({ queryKey: ['sub-containers-by-warehouse'] })
      queryClient.invalidateQueries({ queryKey: queryKeys.custody.warehouses })
    },
  })
}
