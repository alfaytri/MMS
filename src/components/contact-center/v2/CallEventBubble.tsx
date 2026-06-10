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
  const isMissed = m.delivery_status === 'failed' || /^missed call/i.test(m.text ?? '')
  const direction = m.from_type === 'agent' ? 'outbound' : 'inbound'

  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!isLive) return
    const start = new Date(m.created_at).getTime()
    const timer = setInterval(() => setTick(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [isLive, m.created_at])

  const Icon = isMissed ? PhoneMissed
             : isLive   ? PhoneCall
             : direction === 'inbound' ? PhoneIncoming : PhoneOutgoing

  const colour = isMissed ? 'text-destructive'
               : isLive   ? 'text-emerald-600'
               :            'text-muted-foreground'

  const wrapperClasses = isMissed
    ? 'flex items-start gap-2 rounded-md border border-destructive/40 p-2 my-1 bg-destructive/10'
    : 'flex items-start gap-2 rounded-md border border-border p-2 my-1 bg-muted/30'
  const titleClasses = isMissed
    ? 'text-xs font-semibold text-destructive'
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
