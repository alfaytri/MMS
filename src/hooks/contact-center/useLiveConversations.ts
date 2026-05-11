'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ChatConversation } from '@/types/contact-center'

export function useLiveConversations() {
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const cancelledRef = useRef(false)

  const load = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from('chat_conversations')
      .select(`
        id, customer_id, conversation_type, wati_phone, wati_contact_name,
        last_message, last_message_at, unread_count, created_at,
        service_customers(name)
      `)
      .not('last_message_at', 'is', null)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(500)

    if (cancelledRef.current) return

    if (error) {
      console.error('[useLiveConversations] query error', error)
      setLoading(false)
      return
    }

    setConversations(
      (data as any[]).map((row) => ({
        ...row,
        customer_name: row.service_customers?.name ?? row.wati_contact_name ?? null,
      }))
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    cancelledRef.current = false
    load()

    const channel = supabase
      .channel('live-conversations')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_conversations' },
        () => { if (!cancelledRef.current) load() }
      )
      .subscribe()

    return () => {
      cancelledRef.current = true
      supabase.removeChannel(channel)
    }
  }, [load])

  function markRead(conversationId: string) {
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, unread_count: 0 } : c))
    )
    ;(supabase as any)
      .from('chat_conversations')
      .update({ unread_count: 0 })
      .eq('id', conversationId)
  }

  return { conversations, loading, markRead, refetch: load }
}
