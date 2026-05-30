'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ChatConversation } from '@/types/contact-center'

export function useLiveConversations(provider: 'wati' | 'whapi' = 'wati') {
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const cancelledRef = useRef(false)
  // IDs that we've marked read locally — prevents the realtime re-fetch from
  // flashing the old unread count back while the DB update is in-flight.
  const locallyReadIds = useRef(new Set<string>())
  const localStatusPatch = useRef(new Map<string, string>())

  const load = useCallback(async () => {
    // WATI: only today + yesterday. WHAPI: full history, no cutoff.
    const yesterdayStart = new Date()
    yesterdayStart.setDate(yesterdayStart.getDate() - 1)
    yesterdayStart.setHours(0, 0, 0, 0)

    let query = (supabase as any)
      .from('chat_conversations')
      .select(`
        id, customer_id, conversation_type, wati_phone, wati_contact_name,
        last_message, last_message_at, unread_count,
        assigned_agent, is_opened, wati_status, created_at,
        service_customers(name)
      `)
      .eq('provider', provider)
      .not('last_message_at', 'is', null)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(500)

    if (provider === 'wati') {
      query = query.gte('last_message_at', yesterdayStart.toISOString())
    }

    const { data, error } = await query

    if (cancelledRef.current) return

    if (error) {
      console.error('[useLiveConversations] query error — code:', (error as any).code, '| message:', (error as any).message, '| details:', (error as any).details, '| raw:', JSON.stringify(error))
      setLoading(false)
      return
    }

    setConversations(
      (data as any[])
        // The SQL query already filters to last_message_at within 3 days — every
        // row returned has recent activity. Hiding by last_message text was too
        // aggressive: WATI's /getContacts API often omits lastMessage, so real
        // conversations were invisible even though they had a valid last_message_at.
        .filter((row: any) => row.last_message_at != null)
        .map((row) => ({
          ...row,
          // WHAPI/WATI phonebook name takes priority over CRM name — matches chat header order
          customer_name: row.wati_contact_name ?? row.service_customers?.name ?? null,
          unread_count: locallyReadIds.current.has(row.id) ? 0 : row.unread_count,
          // Keep locally-patched status until the DB confirms the change
          wati_status: localStatusPatch.current.has(row.id)
            ? localStatusPatch.current.get(row.id)
            : row.wati_status,
        }))
    )
    setLoading(false)
  }, [provider])

  useEffect(() => {
    cancelledRef.current = false
    load()

    // Poll every 5 seconds instead of using a Realtime subscription.
    // The previous postgres_changes channel on chat_conversations (no filter)
    // was one of the top consumers of the Realtime message quota.
    const poll = setInterval(() => {
      if (!cancelledRef.current) load()
    }, 5_000)

    return () => {
      cancelledRef.current = true
      clearInterval(poll)
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

  function patchConversation(id: string, patch: Record<string, unknown>) {
    if ('wati_status' in patch) localStatusPatch.current.set(id, patch.wati_status as string)
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  function clearStatusPatch(id: string) {
    localStatusPatch.current.delete(id)
  }

  return { conversations, loading, markRead, markOpened, patchConversation, clearStatusPatch, refetch: load }
}
