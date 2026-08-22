// src/hooks/useDeductOrderStock.ts
import { useMutation } from '@tanstack/react-query'
import type { StockDeductionItem } from '@/types/team-leader'

interface DeductPayload {
  visitId: string
  teamId: string
  profileId: string
  items: StockDeductionItem[]
}

interface DeductResult {
  ok: boolean
  reason?: string
}

export function useDeductOrderStock() {
  return useMutation<DeductResult, Error, DeductPayload>({
    mutationFn: async (payload) => {
      const res = await fetch('/api/deduct-order-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Deduction failed')
      return json
    },
  })
}
