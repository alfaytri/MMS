import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useCompanies, type Company } from '@/hooks/useCompanies'
import { useAllDivisions, type Division } from '@/hooks/useDivisions'

interface UserDivisionScope {
  isSuperViewer:   boolean
  userDivisionIds: string[]
  companies:       Company[]
  divisions:       Division[]
}

function parseJwtClaims(token: string): { user_type?: string; division_ids?: string[] } {
  try {
    return JSON.parse(atob(token.split('.')[1]))
  } catch {
    return {}
  }
}

export function useUserDivisionScope(): UserDivisionScope {
  const { data: allCompanies = [] } = useCompanies()
  const { data: allDivisions = [] } = useAllDivisions()

  const { data: claims } = useQuery({
    queryKey: ['jwt-claims'],
    queryFn: async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return { userType: '', divisionIds: [] as string[] }
      const payload = parseJwtClaims(session.access_token)
      return {
        userType:    (payload.user_type    ?? '') as string,
        divisionIds: (payload.division_ids ?? []) as string[],
      }
    },
    staleTime: 5 * 60 * 1000,
  })

  const userType      = claims?.userType    ?? ''
  const divisionIds   = claims?.divisionIds ?? []
  const isSuperViewer = userType === 'owner' || userType === 'accountant'

  const companies = isSuperViewer
    ? allCompanies
    : allCompanies.filter((c) =>
        allDivisions.some((d) => d.company_id === c.id && divisionIds.includes(d.id))
      )

  const divisions = isSuperViewer
    ? allDivisions
    : allDivisions.filter((d) => divisionIds.includes(d.id))

  return { isSuperViewer, userDivisionIds: divisionIds, companies, divisions }
}
