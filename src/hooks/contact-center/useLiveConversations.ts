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
  const localStatusPatch = useRef(new Map<string, string>())

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
      console.error('[useLiveConversations] query error — code:', (error as any).code, '| message:', (error as any).message, '| details:', (error as any).details, '| raw:', JSON.stringify(error))
      setLoading(false)
      return
    }

    setConversations(
      (data as any[])
        // Hide contacts synced from WATI that have never had a real message
        .filter((row: any) => row.last_message != null || row.unread_count > 0)
        .map((row) => ({
          ...row,
          customer_name: row.service_customers?.name ?? row.wati_contact_name ?? null,
          unread_count: locallyReadIds.current.has(row.id) ? 0 : row.unread_count,
          // Keep locally-patched status until the DB confirms the change
          wati_status: localStatusPatch.current.has(row.id)
            ? localStatusPatch.current.get(row.id)
            : row.wati_status,
        }))
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    cancelledRef.current = false
    load()

    // Debounce realtime-triggered reloads so a burst of upserts (e.g. 25 contacts
    // from a background sync) batches into a single DB query instead of 25.
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    function debouncedLoad() {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        if (!cancelledRef.current) load()
      }, 400)
    }

    const channel = supabase
      .channel('live-conversations')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_conversations' },
        () => { if (!cancelledRef.current) debouncedLoad() }
      )
      .subscribe()

    return () => {
      cancelledRef.current = true
      if (debounceTimer) clearTimeout(debounceTimer)
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

  function patchConversation(id: string, patch: Record<string, unknown>) {
    if ('wati_status' in patch) localStatusPatch.current.set(id, patch.wati_status as string)
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  function clearStatusPatch(id: string) {
    localStatusPatch.current.delete(id)
  }

  return { conversations, loading, markRead, markOpened, patchConversation, clearStatusPatch, refetch: load }
}
