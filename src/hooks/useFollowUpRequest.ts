import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { FollowUpRequest } from '@/types/follow-ups'

export function useFollowUpRequest(requestId: string | null) {
  return useQuery<FollowUpRequest | null>({
    queryKey: ['follow-up-request', requestId],
    enabled: !!requestId,
    queryFn: async () => {
      if (!requestId) return null
      const supabase = createClient()
      const { data, error } = await supabase
        .from('follow_up_requests')
        .select('*')
        .eq('id', requestId)
        .single()
      if (error) throw error
      return data as unknown as FollowUpRequest
    },
  })
}
