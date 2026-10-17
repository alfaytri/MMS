import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type CurrentUser = { id: string; email: string | null; name: string | null }

/**
 * The signed-in user with a display name resolved from user_data.full_name
 * (falls back to email). Cached for the session — used to stamp "who did it"
 * on actions like marking a shipment stage reached.
 */
export function useCurrentUser() {
  return useQuery<CurrentUser | null>({
    queryKey: ['current-user'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null
      const { data } = await supabase.from('user_data').select('full_name').eq('auth_user_id', user.id).maybeSingle()
      const fullName = (data?.full_name as string | null) ?? null
      return { id: user.id, email: user.email ?? null, name: fullName || user.email || null }
    },
  })
}
