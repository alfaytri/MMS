/**
 * Teams + Places module — hook family for Place sub-containers.
 *
 * Places live as sub-containers under the single shared virtual warehouse
 * with `warehouse_kind='places'`. Each row is an off-site custody spot:
 * a client site (coded like "F004"), an office storage room, a satellite
 * location. The sub-container's `name` doubles as the site code until a
 * proper places table lands (per operator decision on 2026-08-03).
 *
 * Master-data list uses the get_places_master_list SECURITY DEFINER RPC
 * so cross-division rows show on admin surfaces (matches the Teams pattern).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import type { DBUpdate } from '@/types/database.types'

export type PlaceRow = {
  id:            string
  name:          string
  division_id:   string
  division_name: string
  is_active:     boolean
  created_at:    string | null
  updated_at:    string | null
}

function mapDbError(err: { code?: string; message?: string } | null | undefined): Error {
  if (!err) return new Error('Unknown error')
  if (err.code === '23505') {
    return new Error('A place with that name already exists in this division.')
  }
  return new Error(err.message ?? 'Unknown error')
}

// ─── 1. Read ────────────────────────────────────────────────────────────
export function usePlaces() {
  return useQuery({
    queryKey: queryKeys.places.all,
    queryFn: async (): Promise<PlaceRow[]> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_places_master_list')
      if (error) throw error
      return (data ?? []).map((r): PlaceRow => ({
        id:            r.id,
        name:          r.name,
        division_id:   r.division_id,
        division_name: r.division_name,
        is_active:     r.is_active,
        created_at:    r.created_at,
        updated_at:    r.updated_at,
      }))
    },
    staleTime: 60_000,
  })
}

// ─── 2. Create ──────────────────────────────────────────────────────────
export function useCreatePlace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { name: string; division_id: string }) => {
      const supabase = createClient()
      const { data: wh, error: whErr } = await supabase
        .from('warehouses')
        .select('id')
        .eq('warehouse_kind', 'places')
        .maybeSingle()
      if (whErr) throw whErr
      if (!wh)   throw new Error('Places warehouse not found — migration missing?')

      const { data, error } = await supabase
        .from('warehouse_sub_containers')
        .insert({
          warehouse_id: wh.id,
          division_id:  payload.division_id,
          name:         payload.name.trim(),
          is_active:    true,
        })
        .select()
        .single()
      if (error) throw mapDbError(error)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.places.all })
    },
  })
}

// ─── 3. Update ──────────────────────────────────────────────────────────
export function useUpdatePlace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { id: string; name?: string; division_id?: string; is_active?: boolean }) => {
      const supabase = createClient()
      const patch: DBUpdate<'warehouse_sub_containers'> = {}
      if (payload.name        !== undefined) patch.name        = payload.name.trim()
      if (payload.division_id !== undefined) patch.division_id = payload.division_id
      if (payload.is_active   !== undefined) patch.is_active   = payload.is_active
      const { data, error } = await supabase
        .from('warehouse_sub_containers')
        .update(patch)
        .eq('id', payload.id)
        .select()
        .single()
      if (error) throw mapDbError(error)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.places.all })
    },
  })
}
