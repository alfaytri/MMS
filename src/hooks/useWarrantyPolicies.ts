// src/hooks/useWarrantyPolicies.ts
//
// TanStack Query hooks for the warranty_policies master-data table.
// Powers the /master-data/warranty-policies page and the policy pickers
// on the category and item edit dialogs.
//
// Table is division-agnostic (global master data) — all authenticated
// users can SELECT; admin gate for INSERT/UPDATE is enforced by the
// master-data page component, mirroring reason_lists.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import type { DBTable, DBInsert, DBUpdate } from '@/types/database.types'

export type WarrantyPolicy = DBTable<'warranty_policies'>
export type WarrantyPolicyInsert = DBInsert<'warranty_policies'>
export type WarrantyPolicyUpdate = DBUpdate<'warranty_policies'>

export const COVERAGE_TYPES = [
  'none',
  'parts_only',
  'parts_and_labor',
  'replacement_only',
] as const
export type CoverageType = (typeof COVERAGE_TYPES)[number]

export const COVERAGE_TYPE_LABELS: Record<CoverageType, string> = {
  none:               'No Coverage',
  parts_only:         'Parts Only',
  parts_and_labor:    'Parts & Labor',
  replacement_only:   'Replacement Only',
}

export const STARTS_FROM_OPTIONS = ['delivery_date', 'invoice_date'] as const
export type StartsFrom = (typeof STARTS_FROM_OPTIONS)[number]

export const STARTS_FROM_LABELS: Record<StartsFrom, string> = {
  delivery_date: 'Delivery Date',
  invoice_date:  'Invoice Date',
}

// ── Lists ─────────────────────────────────────────────────────────────────

export function useWarrantyPolicies() {
  return useQuery({
    queryKey: queryKeys.warranty.policies,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('warranty_policies')
        .select('*')
        .order('is_active', { ascending: false })
        .order('name', { ascending: true })
      if (error) throw error
      return (data ?? []) as WarrantyPolicy[]
    },
    staleTime: 60 * 1000,
  })
}

/**
 * Active-only list — for pickers on category/item edit dialogs.
 * Inactive policies remain valid on historical warranty_records but
 * must not be selectable on new configurations.
 */
export function useActiveWarrantyPolicies() {
  return useQuery({
    queryKey: queryKeys.warranty.policiesActive,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('warranty_policies')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true })
      if (error) throw error
      return (data ?? []) as WarrantyPolicy[]
    },
    staleTime: 60 * 1000,
  })
}

export function useWarrantyPolicy(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.warranty.policyDetail(id ?? null),
    queryFn: async () => {
      if (!id) return null
      const supabase = createClient()
      const { data, error } = await supabase
        .from('warranty_policies')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as WarrantyPolicy | null
    },
    enabled: !!id,
    staleTime: 60 * 1000,
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────

function throwDbError(prefix: string, err: unknown): never {
  // PostgrestError isn't an Error subclass — surface all fields per
  // feedback_surface_raw_db_errors so the caller sees the real reason.
  if (err && typeof err === 'object') {
    const e = err as { code?: string; message?: string; details?: string; hint?: string }
    const parts = [
      e.code    ? `[${e.code}]` : null,
      e.message ?? null,
      e.details ? `— ${e.details}` : null,
      e.hint    ? `(hint: ${e.hint})` : null,
    ].filter(Boolean)
    throw new Error(`${prefix}: ${parts.join(' ')}`.trim())
  }
  throw new Error(`${prefix}: ${String(err)}`)
}

export function useCreateWarrantyPolicy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Omit<WarrantyPolicyInsert, 'id' | 'created_at' | 'updated_at'>) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('warranty_policies')
        .insert(payload)
        .select()
        .single()
      if (error) throwDbError('Failed to create warranty policy', error)
      return data as WarrantyPolicy
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.warranty.policies })
      qc.invalidateQueries({ queryKey: queryKeys.warranty.policiesActive })
    },
  })
}

export function useUpdateWarrantyPolicy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & WarrantyPolicyUpdate) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('warranty_policies')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throwDbError('Failed to update warranty policy', error)
      return data as WarrantyPolicy
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: queryKeys.warranty.policies })
      qc.invalidateQueries({ queryKey: queryKeys.warranty.policiesActive })
      qc.invalidateQueries({ queryKey: queryKeys.warranty.policyDetail(row.id) })
    },
  })
}

/**
 * Toggle a policy's is_active flag. Doesn't delete — inactive policies
 * remain valid on existing warranty_records. There is intentionally
 * no delete mutation: warranty_records.policy_id is ON DELETE RESTRICT.
 */
export function useToggleWarrantyPolicyActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('warranty_policies')
        .update({ is_active })
        .eq('id', id)
      if (error) throwDbError('Failed to toggle warranty policy', error)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.warranty.policies })
      qc.invalidateQueries({ queryKey: queryKeys.warranty.policiesActive })
    },
  })
}
