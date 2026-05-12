'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Check, CheckCheck, RefreshCw, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AttachmentRenderer } from './AttachmentRenderer'
import type { ChatMessage } from '@/types/contact-center'
import type { useChatMessages } from '@/hooks/contact-center/useChatMessages'

type ChatMessagesReturn = ReturnType<typeof useChatMessages>

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

interface Props {
  messages: ChatMessage[]
  loading: boolean
  fetchingWati?: boolean
  canLoadMore?: boolean
  onLoadMore?: () => void
  phone: string
  chatMessages: ChatMessagesReturn
  onReact?: (messageId: string, externalId: string | null, emoji: string) => void
}

function DeliveryTick({ status }: { status: ChatMessage['delivery_status'] }) {
  if (status === 'sending')   return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
  if (status === 'sent')      return <Check className="h-3 w-3 text-muted-foreground" />
  if (status === 'delivered') return <CheckCheck className="h-3 w-3 text-muted-foreground" />
  if (status === 'read')      return <CheckCheck className="h-3 w-3 text-blue-500" />
  return null
}

function ReactionBubbles({ reactions }: { reactions: ChatMessage['reactions'] }) {
  if (!reactions || reactions.length === 0) return null

  // Count by emoji
  const counts = new Map<string, number>()
  for (const r of reactions) {
    counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1)
  }

  return (
    <div className="flex flex-wrap gap-0.5 mt-1">
      {Array.from(counts.entries()).map(([emoji, count]) => (
        <span
          key={emoji}
          className="inline-flex items-center gap-0.5 bg-muted border border-border rounded-full px-1.5 py-0.5 text-xs leading-none"
        >
          {emoji}
          {count > 1 && <span className="text-muted-foreground text-xs">{count}</span>}
        </span>
      ))}
    </div>
  )
}

function EmojiPicker({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
  return (
    <div
      className="absolute z-[200] flex gap-0.5 bg-popover border border-border rounded-full shadow-md px-2 py-1 -top-9"
      onMouseLeave={onClose}
    >
      {QUICK_EMOJIS.map((e) => (
        <button
          key={e}
          className="text-base hover:scale-125 transition-transform leading-none p-0.5"
          onClick={() => { onPick(e); onClose() }}
        >
          {e}
        </button>
      ))}
    </div>
  )
}

export function ChatSection({ messages, loading, fetchingWati, canLoadMore, onLoadMore, phone, chatMessages, onReact }: Props) {
  const bottomRef     = useRef<HTMLDivElement>(null)
  const scrollRef     = useRef<HTMLDivElement>(null)
  const userScrolledUp = useRef(false)
  const [pickerFor, setPickerFor] = useState<string | null>(null)

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
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Loading messages…</span>
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-2 py-2 overscroll-contain"
    >
      {/* Load older messages */}
      {canLoadMore && onLoadMore && (
        <div className="flex justify-center mb-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1 text-muted-foreground"
            onClick={onLoadMore}
            disabled={fetchingWati}
          >
            {fetchingWati
              ? <><Loader2 className="h-3 w-3 animate-spin" /> Loading older…</>
              : <><ChevronUp className="h-3 w-3" /> Load older messages</>}
          </Button>
        </div>
      )}

      {/* Fetching indicator when no messages yet */}
      {fetchingWati && messages.length === 0 && (
        <div className="flex flex-col items-center justify-center py-6 gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-xs">Fetching message history…</span>
        </div>
      )}

      <div className="space-y-2">
        {messages.map((msg) => {
          const isAgent = msg.from_type === 'agent'

          // System activity events: message_kind='event' OR legacy [digit] rows already in DB
          const isEvent =
            msg.message_kind === 'event' ||
            /^\[\d+\]$/.test(msg.text ?? '') && !msg.attachments?.length

          if (isEvent) {
            const label = msg.text && !/^\[\d+\]$/.test(msg.text)
              ? msg.text
              : null
            return (
              <div key={msg.id} className="flex items-center gap-2 py-1 px-2">
                <div className="flex-1 h-px bg-border/60" />
                <span className="text-xs text-muted-foreground italic text-center shrink-0 max-w-[80%]">
                  {label ?? 'System event'}
                </span>
                <div className="flex-1 h-px bg-border/60" />
              </div>
            )
          }

          return (
            <div
              key={msg.id}
              className={`flex ${isAgent ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[85%] flex flex-col ${isAgent ? 'items-end' : 'items-start'}`}>
                {isAgent && (
                  <span className="text-xs text-muted-foreground mb-0.5">
                    {msg.agent_name ?? 'Agent'}
                  </span>
                )}

                {/* Bubble + emoji picker — onMouseLeave on this wrapper so moving
                    into the picker (DOM child) doesn't close it */}
                <div
                  className={`relative group ${pickerFor === msg.id ? 'z-[100]' : ''}`}
                  onMouseEnter={() => setPickerFor(msg.id)}
                  onMouseLeave={() => setPickerFor(null)}
                >
                  {pickerFor === msg.id && onReact && (
                    <EmojiPicker
                      onPick={(emoji) => onReact(msg.id, msg.external_id, emoji)}
                      onClose={() => setPickerFor(null)}
                    />
                  )}

                  <div
                    className={`rounded-lg px-2.5 py-1.5 text-xs cursor-default select-text ${
                      isAgent ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                    }`}
                  >
                    {/* Regular text */}
                    {msg.text && msg.text !== '' && (
                      <span dir="auto" className="whitespace-pre-wrap break-words">
                        {msg.text}
                      </span>
                    )}
                    {msg.attachments?.map((att, i) => (
                      <AttachmentRenderer key={i} url={att.url} type={att.type} name={att.name} />
                    ))}
                    {/* Fallback: attachment with unavailable URL */}
                    {(!msg.text || msg.text === '') && !msg.attachments?.length && (
                      <span className="italic text-xs opacity-50">📎 Attachment</span>
                    )}
                  </div>
                </div>

                {/* Reactions */}
                <ReactionBubbles reactions={msg.reactions ?? []} />

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
      </div>
      <div ref={bottomRef} />
    </div>
  )
}
