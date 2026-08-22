'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { tryNormalisePhone } from '@/lib/contact-center/normalise-phone'

export interface TeamSlim {
  id:          string
  name_en:     string | null
  name_ar:     string | null
  phone:       string
  division_id: string | null
}

export interface UseTeamPhonesResult {
  teams:     TeamSlim[]
  byPhone:   Map<string, TeamSlim>
  isLoading: boolean
}

export function useTeamPhones(): UseTeamPhonesResult {
  const supabase = createClient()

  const { data, isLoading } = useQuery({
    queryKey: ['cc', 'team-phones'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teams')
        .select('id, name_en, name_ar, phone, division_id')
        .is('deleted_at', null)
      if (error) throw error
      return (data ?? []) as TeamSlim[]
    },
    staleTime:            60_000,
    refetchOnWindowFocus: true,
  })

  return useMemo(() => {
    const teams = (data ?? []).filter((t): t is TeamSlim => !!t.phone)
    const byPhone = new Map<string, TeamSlim>()
    for (const t of teams) {
      const n = tryNormalisePhone(t.phone)
      if (n) byPhone.set(n, t)
    }
    return { teams, byPhone, isLoading }
  }, [data, isLoading])
}
