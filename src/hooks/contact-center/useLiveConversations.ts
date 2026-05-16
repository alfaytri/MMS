'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ChatConversation } from '@/types/contact-center'

export function useLiveConversations() {
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const cancelledRef = useRef(false)
  // IDs that we've marked read locally — prevents the realtime re-fetch from
  // flashing the old unread count back while the DB update is in-flight.
  const locallyReadIds = useRef(new Set<string>())

  const load = useCallback(async () => {
    // Show last 3 days so the list stays populated even when the webhook is
    // briefly down or the sync runs slightly behind.
    const yesterdayStart = new Date()
    yesterdayStart.setDate(yesterdayStart.getDate() - 3)
    yesterdayStart.setHours(0, 0, 0, 0)

    const { data, error } = await (supabase as any)
      .from('chat_conversations')
      .select(`
        id, customer_id, conversation_type, wati_phone, wati_contact_name,
        last_message, last_message_at, unread_count,
        assigned_agent, is_opened, wati_status, created_at,
        service_customers(name)
      `)
      .not('last_message_at', 'is', null)
      .gte('last_message_at', yesterdayStart.toISOString())
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(200)

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
        // Keep unread_count at 0 for conversations we've already marked read
        // locally, even if the DB re-fetch still returns the old value.
        unread_count: locallyReadIds.current.has(row.id) ? 0 : row.unread_count,
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
    locallyReadIds.current.add(conversationId)
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, unread_count: 0 } : c))
    )
    ;(supabase as any)
      .from('chat_conversations')
      .update({ unread_count: 0 })
      .eq('id', conversationId)
      .then(() => {
        // DB confirmed — safe to stop overriding (new messages will increment correctly)
        locallyReadIds.current.delete(conversationId)
      })
  }

  function markOpened(conversationId: string) {
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, is_opened: true } : c))
    )
    ;(supabase as any)
      .from('chat_conversations')
      .update({ is_opened: true })
      .eq('id', conversationId)
  }

  return { conversations, loading, markRead, markOpened, refetch: load }
}
