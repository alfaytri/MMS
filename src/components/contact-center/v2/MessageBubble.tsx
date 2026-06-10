'use client'

import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Check, CheckCheck, Smile } from 'lucide-react'
import { AttachmentRenderer } from '@/components/contact-center/AttachmentRenderer'
import type { ChatMessage } from '@/types/contact-center'

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

interface Props {
  message:     ChatMessage
  phoneLast4?: string | null
  onReact?:    (messageId: string, externalId: string | null, emoji: string) => void
}

function DeliveryTick({ status }: { status: ChatMessage['delivery_status'] }) {
  if (status === 'sending')   return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
  if (status === 'sent')      return <Check className="h-3 w-3 text-muted-foreground" />
  if (status === 'delivered') return <CheckCheck className="h-3 w-3 text-muted-foreground" />
  if (status === 'read')      return <CheckCheck className="h-3 w-3 text-blue-500" />
  return null
}

function ReactionBubbles({ reactions, onClick }: { reactions: ChatMessage['reactions']; onClick?: (e: string) => void }) {
  if (!reactions || reactions.length === 0) return null

  const groups = new Map<string, { count: number; hasCustomer: boolean; hasAgent: boolean }>()
  for (const r of reactions) {
    const g = groups.get(r.emoji) ?? { count: 0, hasCustomer: false, hasAgent: false }
    g.count++
    if (r.from_type === 'customer') g.hasCustomer = true
    else g.hasAgent = true
    groups.set(r.emoji, g)
  }

  return (
    <div className="flex flex-wrap gap-0.5 mt-1">
      {Array.from(groups.entries()).map(([emoji, g]) => (
        <button
          key={emoji}
          onClick={() => onClick?.(emoji)}
          title={g.hasCustomer ? 'Reacted on WhatsApp — click to toggle yours' : 'MMS only — click to toggle yours'}
          className={`inline-flex items-center gap-0.5 border rounded-full px-1.5 py-0.5 text-[11px] leading-none transition-transform hover:scale-105 ${
            g.hasCustomer
              ? 'bg-background border-border shadow-sm'
              : 'bg-muted/50 border-dashed border-border/60 opacity-70'
          }`}
        >
          {emoji}
          {g.count > 1 && <span className="text-muted-foreground">{g.count}</span>}
          {!g.hasCustomer && <span className="text-[9px] text-muted-foreground ml-0.5">MMS</span>}
        </button>
      ))}
    </div>
  )
}

function EmojiPickerPortal({
  x, y, onPick, onClose, onEnter,
}: { x: number; y: number; onPick: (e: string) => void; onClose: () => void; onEnter: () => void }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      style={{ position: 'fixed', top: y - 44, left: x, zIndex: 9999 }}
      onMouseEnter={onEnter}
      onMouseLeave={onClose}
    >
      <div className="flex gap-0.5 bg-popover border border-border rounded-full shadow-lg px-2 py-1">
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
    </div>,
    document.body,
  )
}

// JSONB columns from Postgres realtime can arrive as either a parsed array OR a
// stringified JSON, depending on driver version. Normalise to an array.
function parseAttachments(raw: unknown): { url: string | null; type: string | null; name: string | null; provider_url?: string | null; status?: string | null }[] {
  if (!raw) return []
  let arr: unknown = raw
  if (typeof raw === 'string') {
    try { arr = JSON.parse(raw) } catch { return [] }
  }
  if (!Array.isArray(arr)) return []
  return arr
    .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
    .map((a) => ({
      url:  typeof a.url  === 'string' ? a.url  : null,
      type: typeof a.type === 'string' ? a.type : null,
      name: typeof a.name === 'string' ? a.name : null,
      provider_url: typeof a.provider_url === 'string' ? a.provider_url : null,
      status: typeof a.status === 'string' ? a.status : null,
    }))
}

export function MessageBubble({ message: m, phoneLast4, onReact }: Props) {
  const isAgent = m.from_type === 'agent'
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attachments = parseAttachments(m.attachments)
  const hasContent = !!m.text?.trim() || attachments.length > 0

  // Skip empty ghost rows. A real in-flight send is still 'sending' (don't hide
  // those — the user needs to see them), and a row with no content that landed
  // as 'sent'/'delivered'/'read' is almost certainly a stray Wati webhook insert
  // that has nothing to do with what the user sent. Hide it.
  if (isAgent && !hasContent && m.delivery_status !== 'sending') {
    return null
  }

  function openPicker() {
    if (!onReact) return
    if (closeTimer.current) clearTimeout(closeTimer.current)
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPicker({ x: r.left, y: r.top })
  }
  function schedulePickerClose() { closeTimer.current = setTimeout(() => setPicker(null), 120) }
  function cancelPickerClose()   { if (closeTimer.current) clearTimeout(closeTimer.current) }

  function handlePick(emoji: string) {
    onReact?.(m.id, m.external_id, emoji)
    setPicker(null)
  }

  // Messages sent from WATI dashboard directly (not from MMS) have no sent_by_profile_id
  const isFromWati = isAgent && !m.sent_by_profile_id

  return (
    <div className={`group flex ${isAgent ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] flex flex-col ${isAgent ? 'items-end' : 'items-start'}`}>
        {isAgent && (
          <div className="flex items-center gap-1 mb-0.5">
            <span className={`inline-flex items-center px-1 py-0 rounded text-[9px] font-semibold leading-tight ${
              isFromWati
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
            }`}>
              {isFromWati ? 'WATI' : 'MMS'}
            </span>
            {m.agent_name && (
              <span className="text-[10px] font-medium text-muted-foreground">{m.agent_name}</span>
            )}
          </div>
        )}
        <div className={`relative rounded-lg px-2.5 py-1.5 text-xs ${isAgent ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>
          {m.text && (
            <span dir="auto" className="whitespace-pre-wrap break-words">{m.text}</span>
          )}
          {attachments.map((att, i) => (
            <AttachmentRenderer
              key={i}
              url={att.url}
              type={att.type}
              name={att.name}
              isAgent={isAgent}
              messageId={m.id}
              index={i}
              attachment={att as unknown as import('@/types/contact-center').ChatAttachment}
            />
          ))}
          {/* Fallback when text is empty AND no attachment rendered — keeps the
              bubble from collapsing to a tiny orange dot (e.g. WATI media still
              syncing, or attachments arrived as a stringified JSON). */}
          {!hasContent && (
            <span className="text-[10px] italic opacity-70">[empty message]</span>
          )}

          {/* React button — appears on hover */}
          {onReact && (
            <button
              ref={triggerRef}
              onClick={openPicker}
              onMouseEnter={cancelPickerClose}
              onMouseLeave={schedulePickerClose}
              title="React"
              className={`absolute -top-2 ${isAgent ? '-left-6' : '-right-6'} h-5 w-5 rounded-full bg-background border border-border shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity`}
            >
              <Smile className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>
        <ReactionBubbles reactions={m.reactions ?? []} onClick={handlePick} />
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-[10px] text-muted-foreground">
            {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {phoneLast4 && (
            <span className="text-[10px] text-muted-foreground font-mono">••{phoneLast4}</span>
          )}
          {isAgent && <DeliveryTick status={m.delivery_status} />}
        </div>
      </div>

      {picker && (
        <EmojiPickerPortal
          x={picker.x}
          y={picker.y}
          onPick={handlePick}
          onClose={schedulePickerClose}
          onEnter={cancelPickerClose}
        />
      )}
    </div>
  )
}
