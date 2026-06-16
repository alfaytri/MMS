'use client'

import { useEffect, useState } from 'react'
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, PhoneCall } from 'lucide-react'
import { AttachmentRenderer } from '@/components/contact-center/AttachmentRenderer'
import type { ChatMessage } from '@/types/contact-center'

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function CallEventBubble({ message: m }: { message: ChatMessage }) {
  const isLive = m.delivery_status === 'sending'
  const text = m.text ?? ''
  const isNoAnswer = /^no answer/i.test(text)
  const isMissed = !isNoAnswer && (m.delivery_status === 'failed' || /^missed call/i.test(text))
  const isReceived = !isMissed && !isNoAnswer && /^received call/i.test(text)
  const isConnected = !isMissed && !isNoAnswer && /^connected call/i.test(text)
  const direction = m.from_type === 'agent' ? 'outbound' : 'inbound'

  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!isLive) return
    const start = new Date(m.created_at).getTime()
    const timer = setInterval(() => setTick(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [isLive, m.created_at])

  const Icon = isMissed || isNoAnswer ? PhoneMissed
             : isLive                  ? PhoneCall
             : direction === 'inbound' ? PhoneIncoming : PhoneOutgoing

  const colour = isMissed    ? 'text-destructive'
               : isNoAnswer  ? 'text-yellow-700 dark:text-yellow-500'
               : isLive      ? 'text-emerald-600'
               : isReceived  ? 'text-emerald-700 dark:text-emerald-500'
               : isConnected ? 'text-sky-700 dark:text-sky-500'
               :               'text-muted-foreground'

  const wrapperClasses = isMissed
    ? 'flex items-start gap-2 rounded-md border border-destructive/40 p-2 my-1 bg-destructive/10'
    : isNoAnswer
      ? 'flex items-start gap-2 rounded-md border border-yellow-600/40 p-2 my-1 bg-yellow-500/10'
      : isReceived
        ? 'flex items-start gap-2 rounded-md border border-emerald-600/40 p-2 my-1 bg-emerald-500/10'
        : isConnected
          ? 'flex items-start gap-2 rounded-md border border-sky-600/40 p-2 my-1 bg-sky-500/10'
          : 'flex items-start gap-2 rounded-md border border-border p-2 my-1 bg-muted/30'
  const titleClasses = isMissed
    ? 'text-xs font-semibold text-destructive'
    : isNoAnswer
      ? 'text-xs font-semibold text-yellow-700 dark:text-yellow-500'
      : isReceived
        ? 'text-xs font-semibold text-emerald-700 dark:text-emerald-500'
        : isConnected
          ? 'text-xs font-semibold text-sky-700 dark:text-sky-500'
          : 'text-xs font-medium'

  return (
    <div className={wrapperClasses}>
      <Icon className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${colour}`} />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={titleClasses}>{m.text ?? 'Call'}</span>
          {isLive && (
            <span className="text-xs font-mono text-emerald-600 inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {fmtDuration(tick)}
            </span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground">
          {new Date(m.created_at).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
          {m.agent_name && ` · ${m.agent_name}`}
        </p>
        {m.attachments?.map((att, i) => (
          <AttachmentRenderer
            key={i}
            url={att.url}
            type={att.type}
            name={att.name}
            isAgent={false}
          />
        ))}
      </div>
    </div>
  )
}
