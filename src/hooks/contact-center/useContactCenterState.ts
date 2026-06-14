// src/hooks/contact-center/useContactCenterState.ts
'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { tryNormalisePhone } from '@/lib/contact-center/normalise-phone'
import { useLiveConversations }  from './useLiveConversations'
import { useLiveThread }         from './useLiveThread'
import { useWhatsAppWindow }     from './useWhatsAppWindow'
import { useCustomerData }       from './useCustomerData'
import { useChatMessages }       from './useChatMessages'
import { useAddressState }       from './useAddressState'
import { useProviderSetting }    from '@/hooks/useProviderSetting'
import { playNotificationSound } from '@/lib/contact-center/notification-sound'
import { ensureTeamConversation } from '@/lib/contact-center/ensure-team-conversation'
import { markResolved }           from '@/lib/contact-center/mark-resolved'
import { useTeamPhones }          from './local/useTeamPhones'
import { getDb }                  from '@/lib/contact-center/local/db'
import type { SidebarView }      from '@/types/contact-center'
import type { DivisionSlim }     from '@/components/contact-center/v2/TeamGroupedList'

export interface SyncProgress {
  stage: 'idle' | 'fetching' | 'resolving' | 'upserting' | 'done' | 'error'
  fetched?: number
  synced?: number
  total?: number
  error?: string
}

export function useContactCenterState() {
  const [sidebarView, setSidebarView]           = useState<SidebarView>('collapsed')
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [activeCustomerId, setActiveCustomerId] = useState<string | null>(null)
  const [activePhone, setActivePhone]           = useState<string | null>(null)
  const [syncProgress, setSyncProgress]         = useState<SyncProgress>({ stage: 'idle' })
  const bgSyncRunning = useRef(false)

  const { provider, setProvider } = useProviderSetting()
  const { conversations, loading: convsLoading, markRead, markOpened, patchConversation, clearStatusPatch, refetch: refetchConversations } = useLiveConversations(provider)
  const { messages, loading: threadLoading, fetchingWati, canLoadMore, loadMore, patchMessage, addMessage, triggerPoll } = useLiveThread(activeConversationId, activePhone, provider)

  const activeConversation = conversations.find((c) => c.id === activeConversationId) ?? null
  const windowStatus = useWhatsAppWindow(messages, activeConversation?.wati_status)

  const customerData   = useCustomerData(activeCustomerId)
  const chatMessages   = useChatMessages(patchMessage, addMessage, provider)
  const addressState   = useAddressState(activeCustomerId)

  // Silent background sync every 5 minutes — keeps the conversation list
  // up to date without user interaction. No banner or spinner; the debounced
  // realtime subscription in useLiveConversations handles the UI update.
  useEffect(() => {
    const controller = new AbortController()

    async function runBgSync() {
      if (bgSyncRunning.current) return
      bgSyncRunning.current = true
      try {
        // Use ?mode=full so the background sync scans all pages and catches
        // contacts whose names fall beyond the fast 15-page manual window.
        const res = await fetch('/api/wati/sync-contacts?mode=full', {
          method: 'GET',
          signal: controller.signal,
        })
        if (!res.ok || !res.body) return
        const reader = res.body.getReader()
        try {
          while (true) {
            const { done } = await reader.read()
            if (done) break
          }
        } finally {
          reader.cancel().catch(() => {})
        }
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          (err.name === 'AbortError' ||
           err.name.includes('Abort') ||
           err.message.toLowerCase().includes('aborted') ||
           err.message.includes('BodyStreamBuffer'))
        ) return
        // All other background sync failures are non-fatal — silently ignore.
      } finally {
        bgSyncRunning.current = false
      }
    }

    // Run once immediately on mount so all contacts are caught quickly,
    // then repeat every 5 minutes.
    runBgSync()
    const interval = setInterval(runBgSync, 5 * 60 * 1000)
    return () => {
      clearInterval(interval)
      controller.abort()
    }
  }, [])

  // ── Sound notification for any inbound customer message ─────────────────────
  // Single global subscription covers all conversations, not just the active one.
  // The setTimeout(0) ensures React StrictMode's immediate cleanup can cancel the
  // subscription before the WebSocket is created, avoiding the dev-mode warning
  // "WebSocket is closed before the connection is established".
  useEffect(() => {
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false

    const timer = setTimeout(() => {
      if (cancelled) return
      // QUOTA REMEDIATION (2026-06-13): A3 of supabase-quota-remediation.
      // Was a wide UPDATE chat_messages subscription whose only job was to chime
      // when a customer added a reaction. Customer reactions live on AGENT rows
      // (see api/wati/webhook + api/whapi/webhook), so the obvious from_type
      // filter would have silently broken the feature, and an unfiltered UPDATE
      // woke every browser on every delivery-status flip (sending → sent →
      // delivered → read). Trade-off accepted: visual reactions still render in
      // the open thread via useLiveThread; the audible chime is gone.
      channel = supabase
        .channel('global-inbound-sound')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: 'from_type=eq.customer' },
          () => { playNotificationSound() }
        )
        .subscribe()
    }, 0)

    return () => {
      cancelled = true
      clearTimeout(timer)
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  async function openConversation(conversationId: string, customerId: string | null, phone: string | null) {
    let resolvedCustomerId   = customerId
    let resolvedConversationId: string | null = conversationId || null

    if (phone) {
      const normalised = tryNormalisePhone(phone) ?? phone
      const supabase   = createClient()

      // 1. Resolve the customer from the phone if we don't have one yet.
      // Catches the case where the WATI sync ran before the customer was added to MMS.
      if (!resolvedCustomerId) {
        const { data } = await supabase
          .from('service_customer_phones')
          .select('customer_id')
          .eq('phone', normalised)
          .maybeSingle()
        if (data?.customer_id) resolvedCustomerId = data.customer_id
      }

      // 2. Resolve (or create) a chat_conversations row for this phone+provider.
      // Without this, attaching a customer to a 3CX-originated unknown caller
      // leaves activeConversationId null — useLiveThread then short-circuits and
      // never shows the WhatsApp thread.
      if (!resolvedConversationId) {
        const { data: existing } = await supabase
          .from('chat_conversations')
          .select('id, customer_id')
          .eq('wati_phone', normalised)
          .eq('provider', provider)
          .maybeSingle()

        if (existing?.id) {
          resolvedConversationId = existing.id
          if (resolvedCustomerId && !existing.customer_id) {
            await supabase
              .from('chat_conversations')
              .update({ customer_id: resolvedCustomerId })
              .eq('id', existing.id)
          }
        } else {
          const { data: created, error: createErr } = await supabase
            .from('chat_conversations')
            .insert({
              wati_phone:        normalised,
              provider,
              conversation_type: 'customer',
              ...(resolvedCustomerId ? { customer_id: resolvedCustomerId } : {}),
            })
            .select('id')
            .single()
          if (createErr) {
            console.error('[openConversation] create chat_conversations failed', createErr)
          } else if (created?.id) {
            resolvedConversationId = created.id
          }
        }
      } else if (resolvedCustomerId) {
        // Existing conversation row, but it may still be missing customer_id.
        await supabase
          .from('chat_conversations')
          .update({ customer_id: resolvedCustomerId })
          .eq('id', resolvedConversationId)
      }
    }

    setActiveConversationId(resolvedConversationId)
    setActiveCustomerId(resolvedCustomerId)
    setActivePhone(phone)
    setSidebarView('detail')
    if (resolvedConversationId) {
      markRead(resolvedConversationId)
      markOpened(resolvedConversationId)
    }
  }

  function goToList() {
    setSidebarView('list')
    setActiveConversationId(null)
    setActiveCustomerId(null)
    setActivePhone(null)
  }

  function expandSidebar() {
    setSidebarView('list')
  }

  function collapseSidebar() {
    setSidebarView('collapsed')
  }

  const updateConversationStatus = useCallback(async (status: 'open' | 'pending' | 'resolved') => {
    if (!activeConversationId || !activePhone) return
    patchConversation(activeConversationId, { wati_status: status })
    const supabase = createClient()
    const { error } = await supabase
      .from('chat_conversations')
      .update({ wati_status: status })
      .eq('id', activeConversationId)
    if (error) {
      console.error('[updateConversationStatus] DB update failed', error)
      // Roll back optimistic patch so the UI shows the real status
      patchConversation(activeConversationId, { wati_status: activeConversation?.wati_status ?? 'open' })
    }
    clearStatusPatch(activeConversationId)
    await supabase.functions.invoke('api-wati', { body: { action: 'set_status', phone: activePhone, status } })
  }, [activeConversationId, activePhone, activeConversation, patchConversation, clearStatusPatch])

  async function streamSync(url: string) {
    const res = await fetch(url, { method: 'GET' })
    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({}))
      setSyncProgress({ stage: 'error', error: err.error ?? 'Sync failed' })
      setTimeout(() => setSyncProgress({ stage: 'idle' }), 4000)
      return
    }

    const reader  = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })

      const lines = buf.split('\n\n')
      buf = lines.pop() ?? ''

      for (const line of lines) {
        const jsonStr = line.replace(/^data:\s*/, '').trim()
        if (!jsonStr) continue
        try {
          const event = JSON.parse(jsonStr)
          if (event.error) {
            setSyncProgress({ stage: 'error', error: event.error })
          } else if (event.done) {
            setSyncProgress({ stage: 'done', synced: event.synced, total: event.synced })
            refetchConversations()
            setTimeout(() => setSyncProgress({ stage: 'idle' }), 4000)
          } else {
            setSyncProgress({
              stage:   event.stage ?? 'fetching',
              fetched: event.total ?? event.fetched,
              synced:  event.synced,
              total:   event.total,
            })
          }
        } catch { /* ignore partial lines */ }
      }
    }
  }

  // Not memoised on purpose: streamSync closes over the current-render
  // `refetchConversations`, which is rebuilt when `provider` flips from
  // 'wati' → 'whapi'. A `useCallback(…, [])` here would freeze the
  // first-render WATI version and cause the list to flip to WATI on sync.
  async function syncFromWati() {
    setSyncProgress({ stage: 'fetching', fetched: 0 })
    await streamSync('/api/wati/sync-contacts')
  }

  async function syncFromWhapi() {
    setSyncProgress({ stage: 'fetching', fetched: 0 })
    await streamSync('/api/whapi/sync-chats')
  }

  const syncFromProvider = provider === 'whapi' ? syncFromWhapi : syncFromWati

  const teamPhones = useTeamPhones()

  const { data: divisions = [] } = useQuery<DivisionSlim[]>({
    queryKey: ['cc', 'divisions-slim'],
    queryFn: async () => {
      const sb = createClient()
      const { data, error } = await sb
        .from('divisions')
        .select('id, name, short_name, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as DivisionSlim[]
    },
    staleTime: 5 * 60_000,
  })

  const ensureAndOpenTeamConversation = useCallback(
    async (team: { id: string; phone: string; name_en: string | null }) => {
      const sb = createClient()
      const id = await ensureTeamConversation(sb, {
        phone:    team.phone,
        teamName: team.name_en,
      })
      setActiveConversationId(id)
      setActivePhone(team.phone)
      setActiveCustomerId(null)
      return id
    },
    [],
  )

  const markConversationResolved = useCallback(async (conversationId: string, authUserId: string | null) => {
    const sb = createClient()
    const db = authUserId ? getDb(authUserId) : null
    if (!db) throw new Error('No authenticated user')
    await markResolved(sb, db, conversationId)
  }, [])

  return {
    sidebarView,
    activeConversationId,
    activeCustomerId,
    activePhone,
    conversations,
    convsLoading,
    messages,
    threadLoading,
    fetchingWati,
    canLoadMore,
    loadMore,
    windowStatus,
    customerData,
    chatMessages,
    addressState,
    syncProgress,
    provider,
    setProvider,
    openConversation,
    goToList,
    expandSidebar,
    collapseSidebar,
    patchMessage,
    triggerPoll,
    syncFromWati,
    syncFromProvider,
    updateConversationStatus,
    teamPhones,
    divisions,
    ensureAndOpenTeamConversation,
    markConversationResolved,
  }
}
