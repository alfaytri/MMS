'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ChatMessage } from '@/types/contact-center'

interface UnifiedConversationState {
  conversationIds: string[]
  messages:        ChatMessage[]
  loading:         boolean
  error:           string | null
}

// Loads ALL messages across every chat_conversations row tied to this customer
// (via either customer_id or customer_id_v2), plus any explicit activeConvId.
// This merges WATI + WHAPI threads into one timeline.
export function useUnifiedConversation(
  customerId: string | null,
  activeConvId: string | null = null,
): UnifiedConversationState {
  const [conversationIds, setConversationIds] = useState<string[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const convoIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    async function load() {
      setLoading(true); setError(null)

      const convIds = new Set<string>()
      if (activeConvId) convIds.add(activeConvId)

      if (customerId) {
        const { data: convos, error: convoErr } = await supabase
          .from('chat_conversations')
          .select('id')
          .or(`customer_id.eq.${customerId},customer_id_v2.eq.${customerId}`)
        if (cancelled) return
        if (convoErr) { setError(convoErr.message); setLoading(false); return }
        for (const c of (convos ?? []) as { id: string }[]) convIds.add(c.id)
      }

      const ids = Array.from(convIds)
      setConversationIds(ids)
      convoIdsRef.current = convIds

      if (ids.length === 0) { setMessages([]); setLoading(false); return }

      const { data: msgs, error: msgsErr } = await supabase
        .from('chat_messages')
        .select('*')
        .in('conversation_id', ids)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(500)
      if (cancelled) return
      if (msgsErr) { setError(msgsErr.message); setLoading(false); return }

      setMessages((msgs ?? []) as unknown as ChatMessage[])
      setLoading(false)
    }

    load()

    const channel = supabase
      .channel(`unified-thread-${customerId ?? 'none'}-${activeConvId ?? 'none'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const row = (payload.new ?? payload.old) as { conversation_id?: string; id?: string } | null
          if (!row || !row.conversation_id || !convoIdsRef.current.has(row.conversation_id)) return

          if (payload.eventType === 'INSERT') {
            setMessages((prev) => {
              if (prev.some((m) => m.id === (payload.new as ChatMessage).id)) return prev
              return [...prev, payload.new as ChatMessage]
            })
          } else if (payload.eventType === 'UPDATE') {
            // Merge so that nullable JSONB columns (attachments, reactions) are
            // preserved when a partial Realtime payload arrives with them null.
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== (payload.new as ChatMessage).id) return m
                const incoming = payload.new as Partial<ChatMessage>
                return {
                  ...m,
                  ...incoming,
                  attachments: incoming.attachments ?? m.attachments,
                  reactions:   incoming.reactions   ?? m.reactions,
                  text:        incoming.text        ?? m.text,
                } as ChatMessage
              })
            )
          } else if (payload.eventType === 'DELETE') {
            setMessages((prev) => prev.filter((m) => m.id !== (payload.old as ChatMessage).id))
          }
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [customerId, activeConvId])

  return { conversationIds, messages, loading, error }
}
