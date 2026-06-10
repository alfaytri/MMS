'use client'

import { useEffect, useState } from 'react'
import type { ChatMessage } from '@/types/contact-center'

type Provider = 'wati' | 'whapi'

interface Args {
  messages:    ChatMessage[]
  provider:    Provider
  setProvider: (p: Provider) => void
  composer:    { isFocused: boolean; text: string }
}

export function useProviderSuggest({ messages, provider, setProvider, composer }: Args) {
  const [suggested, setSuggested] = useState<Provider | null>(null)
  const [dismissedAt, setDismissedAt] = useState<string | null>(null)

  useEffect(() => {
    const last = [...messages].reverse().find((m) => m.from_type === 'customer')
    if (!last) { setSuggested(null); return }

    let want: Provider | null = null
    if (last.source === 'whatsapp_whapi' && provider === 'wati')  want = 'whapi'
    if (last.source === 'whatsapp_api'   && provider === 'whapi') want = 'wati'
    if (!want) { setSuggested(null); return }

    const isTyping = composer.isFocused || composer.text.trim().length > 0
    if (!isTyping) {
      setProvider(want)
      setSuggested(null)
      return
    }

    if (dismissedAt === last.id) return
    setSuggested(want)

    const timer = setTimeout(() => { setSuggested(null); setDismissedAt(last.id) }, 30_000)
    return () => clearTimeout(timer)
  }, [messages, provider, composer.isFocused, composer.text, setProvider, dismissedAt])

  function acceptSwitch() {
    if (suggested) {
      setProvider(suggested)
      setSuggested(null)
    }
  }
  function dismiss() {
    const last = [...messages].reverse().find((m) => m.from_type === 'customer')
    if (last) setDismissedAt(last.id)
    setSuggested(null)
  }

  return { suggested, acceptSwitch, dismiss }
}
