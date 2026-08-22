import { useQuery } from '@tanstack/react-query'
import type { FollowUpRequestWithContext } from '@/types/follow-ups'

export function useFollowUpRequests(status: string = 'pending') {
  return useQuery<FollowUpRequestWithContext[]>({
    queryKey: ['follow-up-requests', status],
    queryFn: async () => {
      const res = await fetch(`/api/follow-up-requests?status=${encodeURIComponent(status)}`)
      if (!res.ok) throw new Error('Failed to load follow-up requests')
      const data = await res.json()
      return data.rows as FollowUpRequestWithContext[]
    },
    refetchInterval: () => {
      if (typeof document !== 'undefined' && document.hidden) return false
      return 60_000
    },
    refetchIntervalInBackground: false,
  })
}
