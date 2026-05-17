// src/hooks/contact-center/useContactCenterState.ts
'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { tryNormalisePhone } from '@/lib/contact-center/normalise-phone'
import { useLiveConversations }  from './useLiveConversations'
import { useLiveThread }         from './useLiveThread'
import { useWhatsAppWindow }     from './useWhatsAppWindow'
import { useCustomerData }       from './useCustomerData'
import { useChatMessages }       from './useChatMessages'
import { useAddressState }       from './useAddressState'
import { useProviderSetting }    from '@/hooks/useProviderSetting'
import type { SidebarView }      from '@/types/contact-center'

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

  const { conversations, loading: convsLoading, markRead, markOpened, patchConversation, clearStatusPatch, refetch: refetchConversations } = useLiveConversations()
  const { messages, loading: threadLoading, fetchingWati, canLoadMore, loadMore, patchMessage, addMessage, triggerPoll } = useLiveThread(activeConversationId, activePhone)

  const activeConversation = conversations.find((c) => c.id === activeConversationId) ?? null
  const windowStatus = useWhatsAppWindow(messages, activeConversation?.wati_status)

  const customerData   = useCustomerData(activeCustomerId)
  const chatMessages   = useChatMessages(patchMessage, addMessage, provider)
  const addressState   = useAddressState(activeCustomerId)
  const { provider, setProvider } = useProviderSetting()

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
          reader.cancel()
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

  async function openConversation(conversationId: string, customerId: string | null, phone: string | null) {
    let resolvedCustomerId = customerId

    // If the conversation has no linked customer but we have a phone, do a live
    // lookup against service_customer_phones. This catches the common case where
    // the customer was added to MMS after the last WATI sync ran.
    if (!customerId && phone) {
      const normalised = tryNormalisePhone(phone) ?? phone
      const supabase = createClient()
      const { data } = await (supabase as any)
        .from('service_customer_phones')
        .select('customer_id')
        .eq('phone', normalised)
        .maybeSingle()
      if (data?.customer_id) {
        resolvedCustomerId = data.customer_id
        // Only persist the link when we have a real conversation row to update
        if (conversationId) {
          ;(supabase as any)
            .from('chat_conversations')
            .update({ customer_id: data.customer_id })
            .eq('id', conversationId)
        }
      }
    }

    setActiveConversationId(conversationId || null)
    setActiveCustomerId(resolvedCustomerId)
    setActivePhone(phone)
    setSidebarView('detail')
    // Guard: markRead/markOpened require a valid conversation ID
    if (conversationId) {
      markRead(conversationId)
      markOpened(conversationId)
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

  function openPhoneDirect(phone: string) {
    setActivePhone(phone)
    setActiveConversationId(null)
    setActiveCustomerId(null)
    setSidebarView('detail')
  }

  const updateConversationStatus = useCallback(async (status: 'open' | 'pending' | 'resolved') => {
    if (!activeConversationId || !activePhone) return
    patchConversation(activeConversationId, { wati_status: status })
    const supabase = createClient()
    const { error } = await (supabase as any)
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

  const syncFromWati = useCallback(async () => {
    setSyncProgress({ stage: 'fetching', fetched: 0 })

    const url = '/api/wati/sync-contacts'
    const res = await fetch(url, { method: 'GET' })
    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({}))
      setSyncProgress({ stage: 'error', error: err.error ?? 'Sync failed' })
      throw new Error(err.error ?? 'Sync failed')
    }

    const reader = res.body.getReader()
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
            // auto-clear after 4 s
            setTimeout(() => setSyncProgress({ stage: 'idle' }), 4000)
          } else {
            setSyncProgress({
              stage: event.stage ?? 'fetching',
              fetched: event.total ?? event.fetched,
              synced:  event.synced,
              total:   event.total,
            })
          }
        } catch {
          // ignore parse errors on partial lines
        }
      }
    }
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
    openPhoneDirect,
    patchMessage,
    triggerPoll,
    syncFromWati,
    updateConversationStatus,
  }
}
