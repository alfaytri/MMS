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

export type PlaceRow = {
  id:                              string
  name:                            string
  division_id:                     string
  division_name:                   string
  is_active:                       boolean
  responsible_person_profile_id:   string | null
  responsible_person_name:         string | null
  responsible_person_phone:        string | null
  created_at:                      string | null
  updated_at:                      string | null
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
        id:                              r.id,
        name:                            r.name,
        division_id:                     r.division_id,
        division_name:                   r.division_name,
        is_active:                       r.is_active,
        responsible_person_profile_id:   r.responsible_person_profile_id,
        responsible_person_name:         r.responsible_person_name,
        responsible_person_phone:        r.responsible_person_phone,
        created_at:                      r.created_at,
        updated_at:                      r.updated_at,
      }))
    },
    staleTime: 60_000,
  })
}

// ─── 2. Create ──────────────────────────────────────────────────────────
// Goes through rpc_upsert_team_or_place — SECURITY DEFINER, bypasses the
// sub_container_scope_insert_r RLS so admin can create places in any division.
export function useCreatePlace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      name: string
      division_id: string
      responsible_person_profile_id?: string | null
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_upsert_team_or_place', {
        p_kind:        'places',
        p_name:        payload.name.trim(),
        p_division_id: payload.division_id,
        p_is_active:   true,
        p_responsible_person_profile_id: payload.responsible_person_profile_id ?? undefined,
      })
      if (error) throw mapDbError(error)
      return data as unknown as string
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
    mutationFn: async (payload: {
      id: string
      name?: string
      division_id?: string
      is_active?: boolean
      responsible_person_profile_id?: string | null
    }) => {
      const supabase = createClient()
      const { data: rows, error: listErr } = await supabase.rpc('get_places_master_list')
      if (listErr) throw listErr
      const current = (rows ?? []).find((r) => r.id === payload.id)
      if (!current) throw new Error('Place not found')

      const { data, error } = await supabase.rpc('rpc_upsert_team_or_place', {
        p_kind:        'places',
        p_id:          payload.id,
        p_name:        (payload.name        ?? current.name).trim(),
        p_division_id:  payload.division_id ?? current.division_id,
        p_is_active:    payload.is_active   ?? current.is_active,
        p_responsible_person_profile_id:
          (payload.responsible_person_profile_id === undefined
            ? current.responsible_person_profile_id
            : payload.responsible_person_profile_id) ?? undefined,
      })
      if (error) throw mapDbError(error)
      return data as unknown as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.places.all })
    },
  })
}
