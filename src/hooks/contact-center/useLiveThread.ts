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
  const supabase      = createClient()
  const cancelledRef  = useRef(false)
  const convIdRef     = useRef<string | null>(null)   // stable ref so event listeners can read it

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
      reactions:  row.reactions ?? [],
      agent_name: row.profiles?.full_name ?? row.agent_name ?? null,
    })) as ChatMessage[]
  }, [])

  // Fetch only the last 24 h — always captures the newest messages regardless of volume
  const pollFromDb = useCallback(async (convId: string) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
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
      .gte('created_at', since)
      .order('created_at', { ascending: true })

    if (cancelledRef.current) return []
    if (error) {
      console.error('[useLiveThread] poll error', error)
      return []
    }
    return (data as any[]).map((row) => ({
      ...row,
      reactions:  row.reactions ?? [],
      agent_name: row.profiles?.full_name ?? row.agent_name ?? null,
    })) as ChatMessage[]
  }, [])

  // Shared merge: adds missed messages AND syncs reactions/delivery_status on existing ones
  function applyPoll(prev: ChatMessage[], recent: ChatMessage[]): ChatMessage[] {
    let changed = false
    const merged = prev.map((m) => {
      const updated = recent.find((r) => r.id === m.id)
      if (!updated) return m
      const reactionsChanged   = JSON.stringify(updated.reactions)      !== JSON.stringify(m.reactions)
      const statusChanged      = updated.delivery_status                !== m.delivery_status
      const externalIdChanged  = updated.external_id                    !== m.external_id
      if (reactionsChanged || statusChanged || externalIdChanged) {
        changed = true
        return { ...m, reactions: updated.reactions, delivery_status: updated.delivery_status, external_id: updated.external_id }
      }
      return m
    })
    const existingIds = new Set(prev.map((m) => m.id))
    const missed      = recent.filter((r) => !existingIds.has(r.id))
    if (missed.length === 0 && !changed) return prev
    return [...merged, ...missed].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
  }

  // Trigger an immediate poll (used by visibility/online/realtime-error handlers)
  const triggerPoll = useCallback(async () => {
    const convId = convIdRef.current
    if (!convId || cancelledRef.current) return
    const recent = await pollFromDb(convId)
    if (cancelledRef.current) return
    setMessages((prev) => applyPoll(prev, recent))
  }, [pollFromDb])

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
    convIdRef.current = conversationId

    if (!conversationId) {
      setMessages([])
      setLoading(false)
      return
    }

    cancelledRef.current = false
    setLoading(true)
    setLoadedDays(10)

    async function init() {
      // 1. Show whatever is in the DB immediately
      const existing = await loadFromDb(conversationId!)
      if (cancelledRef.current) return
      setMessages(existing)
      setCanLoadMore(existing.length > 0)
      setLoading(false)

      // 2. Always sync the last day from Wati so any messages that arrived
      //    without the webhook (local dev, preview URLs) are pulled in now.
      if (phone) {
        await fetchFromWati(conversationId!, phone, 1)
        if (cancelledRef.current) return
        const fresh = await loadFromDb(conversationId!)
        if (!cancelledRef.current) {
          setMessages((prev) => applyPoll(prev, fresh))
          setCanLoadMore(fresh.length > 0)
        }
      }
    }

    init()

    // ── Realtime subscription ────────────────────────────────────────────────
    // REPLICA IDENTITY FULL is required on chat_messages for the
    // conversation_id filter to match in WAL events. See migration
    // 20260512210000_chat_messages_replica_identity.sql.
    const channel = supabase
      .channel(`thread-${conversationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          if (cancelledRef.current) return
          const incoming = {
            ...(payload.new as ChatMessage),
            reactions: (payload.new as any).reactions ?? [],
          } as ChatMessage

          if (payload.eventType === 'INSERT') {
            setMessages((prev) => {
              if (prev.some((m) => m.id === incoming.id)) return prev
              return [...prev, incoming].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              )
            })
          } else if (payload.eventType === 'UPDATE') {
            setMessages((prev) => {
              const idx = prev.findIndex((m) => m.id === incoming.id)
              if (idx === -1) return [...prev, incoming].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              )
              return prev.map((m) => (m.id === incoming.id ? { ...m, ...incoming } : m))
            })
          }
        }
      )
      .subscribe((status, err) => {
        if (err) console.error('[useLiveThread] channel error', err)
        // On any disconnect/error: poll immediately so we catch anything missed
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('[useLiveThread] Realtime', status, '— polling immediately')
          triggerPoll()
        }
      })

    // ── Periodic DB poll: every 2 s ──────────────────────────────────────────
    // Catches anything the Realtime WebSocket misses.
    const poll = setInterval(triggerPoll, 2_000)

    // ── Periodic Wati API sync ────────────────────────────────────────────────
    // Polls Wati's getMessages API on a schedule so incoming customer messages
    // appear without needing the webhook to reach this machine.
    // Local dev: 5 s interval — fast enough to feel responsive without a tunnel.
    // Production: 15 s interval — webhook handles instant delivery; polling is
    //   just a safety net for missed events.
    const WATI_SYNC_MS = process.env.NODE_ENV === 'development' ? 5_000 : 15_000

    let watiSyncing = false
    async function syncFromWati() {
      const convId = convIdRef.current
      const ph     = phone
      if (!convId || !ph || watiSyncing || cancelledRef.current) return
      watiSyncing = true
      try {
        const res = await fetch(
          `/api/wati/fetch-messages?conversationId=${encodeURIComponent(convId)}&phone=${encodeURIComponent(ph)}&days=1`,
          { method: 'GET' }
        )
        if (!cancelledRef.current && res.ok) {
          const recent = await pollFromDb(convId)
          if (!cancelledRef.current) setMessages((prev) => applyPoll(prev, recent))
        }
      } catch (e) {
        console.warn('[useLiveThread] wati sync error', e)
      } finally {
        watiSyncing = false
      }
    }
    const watiSync = setInterval(syncFromWati, WATI_SYNC_MS)

    // ── Immediate poll + Wati sync when tab becomes visible again ────────────
    function handleVisibility() {
      if (!document.hidden) { triggerPoll(); syncFromWati() }
    }

    // ── Immediate poll + Wati sync when network comes back online ─────────────
    function handleOnline() {
      triggerPoll(); syncFromWati()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('online', handleOnline)

    return () => {
      cancelledRef.current = true
      clearInterval(poll)
      clearInterval(watiSync)
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('online', handleOnline)
    }
  }, [conversationId, phone])

  async function loadMore() {
    if (!conversationId || !phone || fetchingWati) return
    const previousDays = loadedDays
    const moreDays     = loadedDays + 20
    setLoadedDays(moreDays)

    await fetchFromWati(conversationId, phone, moreDays)
    if (cancelledRef.current) return

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
      .lt('created_at',  newerCutoff)
      .order('created_at', { ascending: true })
      .limit(500)

    if (cancelledRef.current || !data) return
    const older = (data as any[]).map((row) => ({
      ...row,
      reactions:  row.reactions ?? [],
      agent_name: row.profiles?.full_name ?? row.agent_name ?? null,
    })) as ChatMessage[]

    setMessages((prev) => {
      const existingIds = new Set(prev.map((m) => m.id))
      const newOlder    = older.filter((m) => !existingIds.has(m.id))
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

  return { messages, loading, fetchingWati, canLoadMore, loadMore, patchMessage, addMessage, triggerPoll }
}
