'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export type Provider = 'wati' | 'whapi'

const LS_KEY = 'cc_provider'

function readCache(): Provider {
  if (typeof window === 'undefined') return 'wati'
  const v = localStorage.getItem(LS_KEY)
  return v === 'whapi' ? 'whapi' : 'wati'
}

export function useProviderSetting() {
  // Seed from localStorage so the correct provider is active immediately on
  // re-login, with no WATI→WHAPI flash while the DB query is in-flight.
  const [provider, setProviderState] = useState<Provider>(readCache)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    // Initial load — DB is authoritative; update cache if it differs
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'cc_provider')
      .single()
      .then(({ data }) => {
        const raw = data?.value
        const val = typeof raw === 'string' ? raw.replace(/^"+|"+$/g, '') : raw
        const resolved: Provider = val === 'whapi' ? 'whapi' : 'wati'
        localStorage.setItem(LS_KEY, resolved)
        setProviderState(resolved)
        setLoading(false)
      })

    // Realtime subscription for cross-tab sync
    const channel = supabase
      .channel('app_settings_provider')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'app_settings', filter: 'key=eq.cc_provider' },
        (payload) => {
          const raw = payload.new?.value
          const newVal = typeof raw === 'string' ? raw.replace(/^"+|"+$/g, '') : raw
          if (newVal === 'wati' || newVal === 'whapi') {
            setProviderState(newVal)
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  async function setProvider(value: Provider) {
    const previous = provider
    localStorage.setItem(LS_KEY, value)
    setProviderState(value) // optimistic
    try {
      const res = await fetch('/api/settings/cc-provider', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: value }),
      })
      if (!res.ok) throw new Error('Failed to update provider')
    } catch {
      localStorage.setItem(LS_KEY, previous)
      setProviderState(previous) // rollback
    }
  }

  return { provider, setProvider, loading }
}
