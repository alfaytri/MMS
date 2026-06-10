'use client'

import { Loader2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { SourceDivider, DayDivider } from './SourceDivider'
import { MessageBubble } from './MessageBubble'
import { CallEventBubble } from './CallEventBubble'
import { SystemEventBubble } from './SystemEventBubble'
import type { ChatMessage } from '@/types/contact-center'

interface PhoneEntry { id: string; phone: string }

interface Props {
  messages: ChatMessage[]
  loading:  boolean
  phones:   PhoneEntry[]
  onReact?: (messageId: string, externalId: string | null, emoji: string) => void
}

function last4(phone: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(-4) : digits
}

function dayKey(iso: string): string {
  const d = new Date(iso); d.setHours(0, 0, 0, 0); return d.toISOString()
}

// Legacy fallback — historic messages don't have message_kind='event' set,
// but their text matches one of these patterns. Treat them as system dividers.
const SYSTEM_TEXT_PATTERNS = [
  /^Chat is now assigned to/i,
  /^The ticket has been assigned to/i,
  /^Ticket assigned to/i,
  /^Automation will not work/i,
  /^This chat is now/i,
  /^Conversation (opened|closed|resolved)/i,
]

function isSystemEvent(m: ChatMessage): boolean {
  if (m.message_kind === 'event') return true
  const text = (m.text ?? '').trim()
  if (!text) return false
  return SYSTEM_TEXT_PATTERNS.some((re) => re.test(text))
}

function dayLabel(iso: string): string {
  const d = new Date(iso); d.setHours(0, 0, 0, 0)
  const today = new Date();    today.setHours(0, 0, 0, 0)
  const yest  = new Date(today); yest.setDate(yest.getDate() - 1)
  if (d.getTime() === today.getTime()) return 'Today'
  if (d.getTime() === yest.getTime())  return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
}

export function UnifiedThread({ messages, loading, phones, onReact }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const showPhoneBadges = phones.length > 1

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Loading messages…</span>
      </div>
    )
  }

  const items: JSX.Element[] = []
  let prevSource:  ChatMessage['source'] | null = null
  let prevPhoneId: string | null = null
  let prevDay:     string | null = null

  for (const m of messages) {
    const phone     = phones.find((p) => p.id === m.phone_id)
    const phoneL4   = last4(phone?.phone ?? null)
    const thisDay   = dayKey(m.created_at)
    const sourceChanged = m.source !== prevSource || m.phone_id !== prevPhoneId
    const dayChanged    = thisDay !== prevDay

    if (sourceChanged) {
      items.push(
        <SourceDivider
          key={`src-${m.id}`}
          source={m.source as 'whatsapp_api' | 'whatsapp_whapi' | '3cx_call' | 'manual'}
          phoneLast4={phoneL4}
          dateLabel={dayChanged ? dayLabel(m.created_at) : null}
        />
      )
    } else if (dayChanged) {
      items.push(<DayDivider key={`day-${m.id}`} dateLabel={dayLabel(m.created_at)} />)
    }

    prevSource  = m.source
    prevPhoneId = m.phone_id ?? null
    prevDay     = thisDay

    if (m.source === '3cx_call') {
      items.push(<CallEventBubble key={m.id} message={m} />)
    } else if (isSystemEvent(m)) {
      items.push(<SystemEventBubble key={m.id} message={m} />)
    } else {
      items.push(<MessageBubble key={m.id} message={m} phoneLast4={showPhoneBadges ? phoneL4 : null} onReact={onReact} />)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain px-2 py-2 flex flex-col gap-1">
      {items}
      <div ref={bottomRef} />
    </div>
  )
}
