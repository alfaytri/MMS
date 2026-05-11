// src/hooks/useUserCompanyDivisions.ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface DivisionOption {
  id: string
  slug: string
  name: string
}

export function useUserCompanyDivisions() {
  return useQuery<DivisionOption[]>({
    queryKey: ['user-company-divisions'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []

      // profile id
      const { data: profile } = await (supabase as any)
        .from('profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()
      if (!profile?.id) return []

      // collect all company_ids from the user's assigned divisions
      const { data: ud } = await (supabase as any)
        .from('user_divisions')
        .select('divisions(company_id)')
        .eq('profile_id', profile.id)

      const companyIds: string[] = [
        ...new Set(
          ((ud ?? []) as any[])
            .map((row: any) => row.divisions?.company_id)
            .filter(Boolean) as string[]
        ),
      ]

      if (companyIds.length > 0) {
        // all active divisions for every company the user belongs to
        const { data: divisions } = await (supabase as any)
          .from('divisions')
          .select('id, slug, name')
          .in('company_id', companyIds)
          .eq('is_active', true)
          .order('sort_order')
        return (divisions ?? []) as DivisionOption[]
      }

      // fallback: all active divisions (admin with no explicit assignments)
      const { data: all } = await (supabase as any)
        .from('divisions')
        .select('id, slug, name')
        .eq('is_active', true)
        .order('sort_order')
      return (all ?? []) as DivisionOption[]
    },
  })
}
