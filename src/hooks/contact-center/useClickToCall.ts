'use client'

import { useCallback, useState } from 'react'
import { toast } from 'sonner'

interface UseClickToCallResult {
  dial:    (phoneE164: string) => Promise<boolean>
  loading: boolean
}

export function useClickToCall(): UseClickToCallResult {
  const [loading, setLoading] = useState(false)

  const dial = useCallback(async (phoneE164: string): Promise<boolean> => {
    if (!phoneE164) {
      toast.error('No phone number')
      return false
    }
    setLoading(true)
    try {
      const res = await fetch('/api/3cx/call/make', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ destination: phoneE164 }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.error ?? `Call failed (${res.status})`)
        return false
      }
      toast.success('Calling — answer your softphone to connect')
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Call failed')
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  return { dial, loading }
}
