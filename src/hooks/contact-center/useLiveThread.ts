'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ChatMessage } from '@/types/contact-center'

export function useLiveThread(conversationId: string | null, phone: string | null) {
  const [messages, setMessages]         = useState<ChatMessage[]>([])
  const [loading, setLoading]           = useState(false)
  const [fetchingWati, setFetchingWati] = useState(false)
  const [canLoadMore, setCanLoadMore]   = useState(false)
  const [loadedDays, setLoadedDays]     = useState(10)
  const supabase   = createClient()
  const cancelledRef = useRef(false)

  const loadFromDb = useCallback(async (convId: string) => {
    const { data, error } = await (supabase as any)
      .from('chat_messages')
      .select(`
        id, conversation_id, from_type, source, message_kind,
        text, agent_name, attachments, reactions,
        delivery_status, external_id, reply_to_external_id,
        sent_by_profile_id, created_at,
        profiles!sent_by_profile_id(full_name)
      `)
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(500)

    if (cancelledRef.current) return []
    if (error) {
      console.error('[useLiveThread] query error', error)
      return []
    }
    return (data as any[]).map((row) => ({
      ...row,
      agent_name: row.profiles?.full_name ?? row.agent_name ?? null,
    })) as ChatMessage[]
  }, [])

  const fetchFromWati = useCallback(async (convId: string, ph: string, days: number) => {
    if (!ph) return
    setFetchingWati(true)
    try {
      await fetch(
        `/api/wati/fetch-messages?conversationId=${encodeURIComponent(convId)}&phone=${encodeURIComponent(ph)}&days=${days}`,
        { method: 'GET' }
      )
    } catch (e) {
      console.error('[useLiveThread] wati fetch error', e)
    } finally {
      setFetchingWati(false)
    }
  }, [])

  useEffect(() => {
    if (!conversationId) {
      setMessages([])
      setLoading(false)
      return
    }

    cancelledRef.current = false
    setLoading(true)
    setLoadedDays(10)

    async function init() {
      const existing = await loadFromDb(conversationId!)
      if (cancelledRef.current) return

      if (existing.length > 0) {
        setMessages(existing)
        setCanLoadMore(true)
        setLoading(false)
      } else if (phone) {
        // No local messages — fetch 10 days from WATI then reload
        await fetchFromWati(conversationId!, phone, 10)
        if (cancelledRef.current) return
        const fresh = await loadFromDb(conversationId!)
        if (!cancelledRef.current) {
          setMessages(fresh)
          setCanLoadMore(fresh.length > 0)
          setLoading(false)
        }
      } else {
        setMessages([])
        setLoading(false)
      }
    }

    init()

    const channel = supabase
      .channel(`thread-${conversationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conversationId}` },
        async (payload) => {
          if (cancelledRef.current) return
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
      cancelledRef.current = true
      supabase.removeChannel(channel)
    }
  }, [conversationId, phone])

  async function loadMore() {
    if (!conversationId || !phone || fetchingWati) return
    const moreDays = loadedDays + 20
    setLoadedDays(moreDays)
    await fetchFromWati(conversationId, phone, moreDays)
    const fresh = await loadFromDb(conversationId)
    if (!cancelledRef.current) {
      setMessages(fresh)
      setCanLoadMore(true)
    }
  }

  function patchMessage(id: string, patch: Partial<ChatMessage>) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }

  return { messages, loading, fetchingWati, canLoadMore, loadMore, patchMessage }
}
