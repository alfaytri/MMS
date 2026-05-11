// src/hooks/contact-center/useContactCenterState.ts
'use client'

import { useState, useCallback } from 'react'
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

  const { conversations, loading: convsLoading, markRead } = useLiveConversations()
  const { messages, loading: threadLoading, patchMessage } = useLiveThread(activeConversationId)
  const windowStatus = useWhatsAppWindow(messages)

  const customerData   = useCustomerData(activeCustomerId)
  const chatMessages   = useChatMessages(patchMessage)
  const addressState   = useAddressState(activeCustomerId)

  function openConversation(conversationId: string, customerId: string | null, phone: string | null) {
    setActiveConversationId(conversationId)
    setActiveCustomerId(customerId)
    setActivePhone(phone)
    setSidebarView('detail')
    markRead(conversationId)
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
    windowStatus,
    customerData,
    chatMessages,
    addressState,
    syncProgress,
    openConversation,
    goToList,
    expandSidebar,
    collapseSidebar,
    patchMessage,
    syncFromWati,
  }
}
