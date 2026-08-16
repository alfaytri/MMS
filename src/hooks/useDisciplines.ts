import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable } from '@/types/database.types'
import { queryKeys } from '@/lib/queryKeys'

export type Discipline = DBTable<'disciplines'>

// Wraps a Supabase/PostgREST error into a real Error concatenating its
// diagnostic fields — PostgrestError is a plain object, not an Error subclass.
// Mirrors useProjects.ts / useProjectMilestones.ts.
function wrapDbError(
  error: { code?: string; message?: string; details?: string; hint?: string } | null,
  fallback: string,
): Error {
  return new Error(
    [error?.code, error?.message, error?.details, error?.hint].filter(Boolean).join(' — ') || fallback,
  )
}

// Escape ILIKE wildcards so a discipline name is matched literally (but
// case-insensitively), not treated as a pattern.
function escapeLike(s: string): string {
  return s.replace(/([\\%_])/g, '\\$1')
}

/**
 * Reference list of disciplines (Plumbing / Electrical / Automation, seeded).
 * Feeds the discipline multi-select checkboxes in `ProjectFormDialog` and
 * the discipline-name join in `useProjects`. Rarely changes — long staleTime.
 */
export function useDisciplines() {
  return useQuery({
    queryKey: queryKeys.disciplines.all,
    queryFn: async (): Promise<Discipline[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('disciplines')
        .select('id, name, sort_order, is_active, created_at')
        .eq('is_active', true)
        .order('sort_order')
        .limit(200)
      if (error) {
        throw new Error(
          [error.code, error.message, error.details, error.hint].filter(Boolean).join(' — ')
            || 'Failed to load disciplines',
        )
      }
      return (data ?? []) as Discipline[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Get-or-create a master discipline by name (case-insensitive). A discipline an
 * operator types on one project is recorded in the shared `disciplines` table so
 * it's reusable on every future project and rolls up in the spend report
 * ("connect to the original data"). Reuses an existing row — reactivating it if
 * it was deactivated — instead of creating a near-duplicate; the UNIQUE(name)
 * index plus a 23505 re-select guard against a concurrent add. Writes are
 * permitted by the `disciplines_write` RLS policy (warehouse.projects.manage),
 * so no RPC is needed.
 */
export function useGetOrCreateDiscipline() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (rawName: string): Promise<Discipline> => {
      const name = rawName.trim()
      if (!name) throw new Error('Discipline name is required')
      const supabase = createClient()

      // 1. Reuse an existing discipline of the same name (any case, active or not).
      const { data: existing, error: selErr } = await supabase
        .from('disciplines')
        .select('id, name, sort_order, is_active, created_at')
        .ilike('name', escapeLike(name))
        .limit(1)
        .maybeSingle()
      if (selErr) throw wrapDbError(selErr, 'Failed to look up discipline')
      if (existing) {
        if (existing.is_active) return existing as Discipline
        const { data: reactivated, error: upErr } = await supabase
          .from('disciplines')
          .update({ is_active: true })
          .eq('id', existing.id)
          .select('id, name, sort_order, is_active, created_at')
          .single()
        if (upErr) throw wrapDbError(upErr, 'Failed to reactivate discipline')
        qc.invalidateQueries({ queryKey: queryKeys.disciplines.all })
        return reactivated as Discipline
      }

      // 2. Create new — appended after existing rows (sort_order = max + 1).
      const { data: maxRow } = await supabase
        .from('disciplines')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle()
      const nextSort = (maxRow?.sort_order ?? 0) + 1

      const { data: created, error: insErr } = await supabase
        .from('disciplines')
        .insert({ name, sort_order: nextSort })
        .select('id, name, sort_order, is_active, created_at')
        .single()
      if (insErr) {
        // Concurrent add of the same name tripped UNIQUE(name) — re-select it.
        if ((insErr as { code?: string }).code === '23505') {
          const { data: raced } = await supabase
            .from('disciplines')
            .select('id, name, sort_order, is_active, created_at')
            .ilike('name', escapeLike(name))
            .limit(1)
            .maybeSingle()
          if (raced) return raced as Discipline
        }
        throw wrapDbError(insErr, 'Failed to create discipline')
      }
      qc.invalidateQueries({ queryKey: queryKeys.disciplines.all })
      return created as Discipline
    },
  })
}
