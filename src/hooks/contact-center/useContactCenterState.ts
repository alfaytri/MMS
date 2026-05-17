// src/hooks/contact-center/useContactCenterState.ts
'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLiveConversations }  from './useLiveConversations'
import { useLiveThread }         from './useLiveThread'
import { useWhatsAppWindow }     from './useWhatsAppWindow'
import { useCustomerData }       from './useCustomerData'
import { useChatMessages }       from './useChatMessages'
import { useAddressState }       from './useAddressState'
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
  const chatMessages   = useChatMessages(patchMessage, addMessage)
  const addressState   = useAddressState(activeCustomerId)

  // Silent background sync every 5 minutes — keeps the conversation list
  // up to date without user interaction. No banner or spinner; the debounced
  // realtime subscription in useLiveConversations handles the UI update.
  useEffect(() => {
    async function runBgSync() {
      if (bgSyncRunning.current) return
      bgSyncRunning.current = true
      try {
        const res = await fetch('/api/wati/sync-contacts', { method: 'GET' })
        if (!res.ok || !res.body) return
        const reader = res.body.getReader()
        // Drain the SSE stream to completion so the server-side upserts finish.
        // We don't parse events — the realtime subscription handles UI updates.
        while (true) {
          const { done } = await reader.read()
          if (done) break
        }
      } catch {
        // Background sync failures are non-fatal — silently ignore.
      } finally {
        bgSyncRunning.current = false
      }
    }

    const interval = setInterval(runBgSync, 5 * 60 * 1000) // every 5 minutes
    return () => clearInterval(interval)
  }, [])

  function openConversation(conversationId: string, customerId: string | null, phone: string | null) {
    setActiveConversationId(conversationId)
    setActiveCustomerId(customerId)
    setActivePhone(phone)
    setSidebarView('detail')
    markRead(conversationId)
    markOpened(conversationId)
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

  const syncFromWati = useCallback(async (full = false) => {
    setSyncProgress({ stage: 'fetching', fetched: 0 })

    const url = full ? '/api/wati/sync-contacts?mode=full' : '/api/wati/sync-contacts'
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
