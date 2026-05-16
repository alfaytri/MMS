'use client'

import { useMemo } from 'react'
import type { ChatMessage, WindowStatus } from '@/types/contact-center'

const WINDOW_HOURS = 24
const SAFETY_BUFFER_MINUTES = 5

export function useWhatsAppWindow(messages: ChatMessage[], watiStatus?: string | null): WindowStatus {
  return useMemo(() => {
    // A resolved conversation is always closed regardless of the 24-hour timer.
    if (watiStatus === 'resolved') {
      return { isOpen: false, expiresAt: null, minutesRemaining: 0 }
    }

    const lastInbound = [...messages]
      .reverse()
      .find((m) => m.from_type === 'customer' && m.source === 'whatsapp_api')

    if (!lastInbound) {
      return { isOpen: false, expiresAt: null, minutesRemaining: 0 }
    }

    const inboundAt = new Date(lastInbound.created_at).getTime()
    const expiresAt  = new Date(inboundAt + WINDOW_HOURS * 60 * 60 * 1000)
    const now        = Date.now()
    const msRemaining = expiresAt.getTime() - now
    const minutesRemaining = Math.floor(msRemaining / 60_000)

    const isOpen = minutesRemaining > SAFETY_BUFFER_MINUTES

    return {
      isOpen,
      expiresAt: isOpen ? expiresAt : null,
      minutesRemaining: Math.max(0, minutesRemaining),
    }
  }, [messages, watiStatus])
}
