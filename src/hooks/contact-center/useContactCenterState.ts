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

export function useContactCenterState() {
  const [sidebarView, setSidebarView]           = useState<SidebarView>('collapsed')
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [activeCustomerId, setActiveCustomerId] = useState<string | null>(null)
  const [activePhone, setActivePhone]           = useState<string | null>(null)

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

  const syncFromWati = useCallback(async () => {
    const res = await fetch('/api/wati/sync-contacts', { method: 'POST' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error ?? 'Sync failed')
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
    openConversation,
    goToList,
    expandSidebar,
    collapseSidebar,
    patchMessage,
    syncFromWati,
  }
}
