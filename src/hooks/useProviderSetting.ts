'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export type Provider = 'wati' | 'whapi'

export function useProviderSetting() {
  const [provider, setProviderState] = useState<Provider>('wati')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    // Initial load
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'cc_provider')
      .single()
      .then(({ data }) => {
        if (data?.value === 'whapi') setProviderState('whapi')
        setLoading(false)
      })

    // Realtime subscription for cross-tab sync
    const channel = supabase
      .channel('app_settings_provider')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'app_settings', filter: 'key=eq.cc_provider' },
        (payload) => {
          const newVal = payload.new?.value
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
    setProviderState(value) // optimistic
    try {
      const res = await fetch('/api/settings/cc-provider', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: value }),
      })
      if (!res.ok) throw new Error('Failed to update provider')
    } catch {
      setProviderState(previous) // rollback
    }
  }

  return { provider, setProvider, loading }
}
