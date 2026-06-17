import { useMutation } from '@tanstack/react-query'
import type { CreateFollowUpRequestBody, FollowUpRequestConflictResponse } from '@/types/follow-ups'

export type CreateResult =
  | { ok: true; request_id: string; request_number: string }
  | { ok: false; conflict: FollowUpRequestConflictResponse }

export function useCreateFollowUpRequest() {
  return useMutation<CreateResult, Error, CreateFollowUpRequestBody>({
    mutationFn: async (body) => {
      const res = await fetch('/api/follow-up-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.status === 409) {
        const conflict = (await res.json()) as FollowUpRequestConflictResponse
        return { ok: false, conflict }
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'unknown' }))
        throw new Error(err.error ?? 'Request failed')
      }
      const data = await res.json()
      return { ok: true, request_id: data.request_id, request_number: data.request_number }
    },
  })
}
