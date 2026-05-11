'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ChatMessage } from '@/types/contact-center'

export function useLiveThread(conversationId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (!conversationId) {
      setMessages([])
      return
    }

    let cancelled = false
    setLoading(true)

    async function load() {
      const { data, error } = await (supabase as any)
        .from('chat_messages')
        .select(`
          id, conversation_id, from_type, source,
          text, attachment_url, attachment_type, attachment_name,
          delivery_status, external_id, reply_to_external_id,
          sent_by_profile_id, created_at,
          profiles!sent_by_profile_id(full_name)
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(200)

      if (!cancelled) {
        if (!error && data) {
          setMessages(
            (data as any[]).map((row) => ({
              ...row,
              agent_name: row.profiles?.full_name ?? null,
            }))
          )
        } else if (error) {
          console.error('[useLiveThread] query error', error)
        }
        setLoading(false)
      }
    }

    load()

    const channel = supabase
      .channel(`thread-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (cancelled) return
          if (payload.eventType === 'INSERT') {
            setMessages((prev) => {
              if (prev.some((m) => m.id === (payload.new as ChatMessage).id)) return prev
              return [...prev, payload.new as ChatMessage]
            })
          } else if (payload.eventType === 'UPDATE') {
            setMessages((prev) =>
              prev.map((m) => (m.id === (payload.new as ChatMessage).id ? { ...m, ...payload.new } : m))
            )
          }
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [conversationId])

  function patchMessage(id: string, patch: Partial<ChatMessage>) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }

  return { messages, loading, patchMessage }
}
