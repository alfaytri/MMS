'use client'

import { useEffect, useRef } from 'react'
import { Loader2, Check, CheckCheck, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AttachmentRenderer } from './AttachmentRenderer'
import type { ChatMessage } from '@/types/contact-center'
import type { useChatMessages } from '@/hooks/contact-center/useChatMessages'

type ChatMessagesReturn = ReturnType<typeof useChatMessages>

interface Props {
  messages: ChatMessage[]
  loading: boolean
  phone: string
  chatMessages: ChatMessagesReturn
}

function DeliveryTick({ status }: { status: ChatMessage['delivery_status'] }) {
  if (status === 'sending')   return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
  if (status === 'sent')      return <Check className="h-3 w-3 text-muted-foreground" />
  if (status === 'delivered') return <CheckCheck className="h-3 w-3 text-muted-foreground" />
  if (status === 'read')      return <CheckCheck className="h-3 w-3 text-blue-500" />
  return null
}

export function ChatSection({ messages, loading, phone, chatMessages }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const userScrolledUp = useRef(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (isNearBottom || !userScrolledUp.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    userScrolledUp.current = !isNearBottom
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-2 py-2 space-y-2 overscroll-contain"
    >
      {messages.map((msg) => {
        const isAgent = msg.from_type === 'agent'
        return (
          <div key={msg.id} className={`flex ${isAgent ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] flex flex-col ${isAgent ? 'items-end' : 'items-start'}`}>
              <span className="text-xs text-muted-foreground mb-0.5">
                {isAgent ? (msg.agent_name ?? 'Agent') : phone}
              </span>

              <div className={`rounded-lg px-2.5 py-1.5 text-xs ${
                isAgent ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
              }`}>
                {msg.text && (
                  <span dir="auto" className="whitespace-pre-wrap break-words">
                    {msg.text}
                  </span>
                )}
                {msg.attachments?.map((att, i) => (
                  <AttachmentRenderer key={i} url={att.url} type={att.type} name={att.name} />
                ))}
                {!isAgent && msg.source === 'whatsapp_api' && (
                  <Badge variant="secondary" className="ml-1.5 text-xs py-0 px-1 align-middle">WA API</Badge>
                )}
              </div>

              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-xs text-muted-foreground">
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                {isAgent && <DeliveryTick status={msg.delivery_status} />}
                {isAgent && msg.delivery_status === 'failed' && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5"
                    onClick={() => chatMessages.retryMessage(msg, phone)}
                  >
                    <RefreshCw className="h-3 w-3 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
