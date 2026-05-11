'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ChatConversation } from '@/types/contact-center'

export function useLiveConversations() {
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    let cancelled = false

    async function load() {
      const { data, error } = await (supabase as any)
        .from('chat_conversations')
        .select(`
          id, customer_id, conversation_type, wati_phone,
          last_message, last_message_at, unread_count, created_at,
          service_customers(name)
        `)
        .order('last_message_at', { ascending: false })
        .limit(200)

      if (!cancelled && !error && data) {
        setConversations(
          (data as any[]).map((row) => ({
            ...row,
            customer_name: row.service_customers?.name ?? null,
          }))
        )
        setLoading(false)
      }
    }

    load()

    const channel = supabase
      .channel('live-conversations')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_conversations' },
        () => { if (!cancelled) load() }
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [])

  function markRead(conversationId: string) {
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, unread_count: 0 } : c))
    )
    ;(supabase as any)
      .from('chat_conversations')
      .update({ unread_count: 0 })
      .eq('id', conversationId)
  }

  return { conversations, loading, markRead }
}
