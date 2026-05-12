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
          const incoming = {
            ...(payload.new as ChatMessage),
            reactions: (payload.new as any).reactions ?? [],
          } as ChatMessage

          if (payload.eventType === 'INSERT') {
            setMessages((prev) => {
              if (prev.some((m) => m.id === incoming.id)) return prev
              return [...prev, incoming]
            })
          } else if (payload.eventType === 'UPDATE') {
            setMessages((prev) => {
              const idx = prev.findIndex((m) => m.id === incoming.id)
              if (idx === -1) {
                // Missed the INSERT (e.g. network blip) — append the row
                return [...prev, incoming]
              }
              return prev.map((m) => (m.id === incoming.id ? { ...m, ...incoming } : m))
            })
          }
        }
      )
      .subscribe()

    // Periodic fallback: re-sync from DB every 15 s in case Realtime dropped an event
    const poll = setInterval(async () => {
      if (cancelledRef.current) return
      const fresh = await loadFromDb(conversationId!)
      if (cancelledRef.current) return
      setMessages((prev) => {
        const prevIds = new Set(prev.map((m) => m.id))
        const missed = fresh.filter((m) => !prevIds.has(m.id))
        if (missed.length === 0) return prev
        return [...prev, ...missed].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
      })
    }, 15_000)

    return () => {
      cancelledRef.current = true
      clearInterval(poll)
      supabase.removeChannel(channel)
    }
  }, [conversationId, phone])

  async function loadMore() {
    if (!conversationId || !phone || fetchingWati) return
    const previousDays = loadedDays
    const moreDays = loadedDays + 20
    setLoadedDays(moreDays)

    await fetchFromWati(conversationId, phone, moreDays)
    if (cancelledRef.current) return

    // Only load messages in the newly-added date window and prepend them
    const olderCutoff = new Date(Date.now() - moreDays     * 24 * 60 * 60 * 1000).toISOString()
    const newerCutoff = new Date(Date.now() - previousDays * 24 * 60 * 60 * 1000).toISOString()

    const { data } = await (supabase as any)
      .from('chat_messages')
      .select(`
        id, conversation_id, from_type, source, message_kind,
        text, agent_name, attachments, reactions,
        delivery_status, external_id, reply_to_external_id,
        sent_by_profile_id, created_at,
        profiles!sent_by_profile_id(full_name)
      `)
      .eq('conversation_id', conversationId)
      .gte('created_at', olderCutoff)
      .lt('created_at', newerCutoff)
      .order('created_at', { ascending: true })
      .limit(500)

    if (cancelledRef.current || !data) return
    const older = (data as any[]).map((row) => ({
      ...row,
      agent_name: row.profiles?.full_name ?? row.agent_name ?? null,
    })) as ChatMessage[]

    setMessages((prev) => {
      const existingIds = new Set(prev.map((m) => m.id))
      const newOlder = older.filter((m) => !existingIds.has(m.id))
      return [...newOlder, ...prev]
    })
    setCanLoadMore(older.length > 0)
  }

  function patchMessage(id: string, patch: Partial<ChatMessage>) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }

  function addMessage(msg: ChatMessage) {
    setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg])
  }

  return { messages, loading, fetchingWati, canLoadMore, loadMore, patchMessage, addMessage }
}
