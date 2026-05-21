'use client'

import { useMemo } from 'react'
import type { ChatMessage, WindowStatus } from '@/types/contact-center'

const WINDOW_HOURS = 24
const SAFETY_BUFFER_MINUTES = 5

const CLOSE_EVENT_PATTERN = /clos|resolv|ended|expir|انتهت|أغلق|تم الإغلاق/i

export function useWhatsAppWindow(messages: ChatMessage[], watiStatus?: string | null): WindowStatus {
  return useMemo(() => {
    // A resolved conversation is always closed regardless of the 24-hour timer.
    if (watiStatus === 'resolved') {
      return { isOpen: false, expiresAt: null, minutesRemaining: 0 }
    }

    // Exclude event messages (system notifications, expiry notices) — only real
    // customer chat messages reset the 24-hour window.
    const lastInbound = [...messages]
      .reverse()
      .find((m) => m.from_type === 'customer' && m.source === 'whatsapp_api' && m.message_kind !== 'event')

    if (!lastInbound) {
      return { isOpen: false, expiresAt: null, minutesRemaining: 0 }
    }

    // If the conversation was closed by WATI (bot or agent) AFTER the last customer
    // message and no new customer message arrived since, treat the window as closed.
    // This handles the case where the webhook is lagging and wati_status is stale.
    const lastInboundTime = new Date(lastInbound.created_at).getTime()
    const hasCloseEventAfterInbound = messages.some(
      (m) =>
        m.message_kind === 'event' &&
        new Date(m.created_at).getTime() > lastInboundTime &&
        CLOSE_EVENT_PATTERN.test(m.text ?? ''),
    )
    if (hasCloseEventAfterInbound) {
      return { isOpen: false, expiresAt: null, minutesRemaining: 0 }
    }

    const inboundAt = lastInboundTime
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
