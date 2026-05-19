'use client'

import { createContext, useContext, useMemo, useState, useCallback, type ReactNode } from 'react'
import type { SelectedCustomer } from '@/types/contact-center'

// 'none'      — user has no CC permission, sidebar is hidden
// 'collapsed' — sidebar shows as a 40 px strip
// 'expanded'  — sidebar shows at full 320 px width
export type CCSidebarState = 'none' | 'collapsed' | 'expanded'

// Wraps the phone in an object so the useEffect in ContactCenterSidebar always
// fires — even when the same phone is looked up twice in a row (e.g. Change → same number).
export interface PendingPhoneTrigger { phone: string; nonce: number }

interface ContactCenterContextValue {
  selectedCustomer: SelectedCustomer | null
  openCustomerById: (customerId: string, customerName: string, primaryPhone: string, conversationId?: string | null) => void
  openCustomerByPhone: (phone: string) => void
  clearSelectedCustomer: () => void
  pendingPhone: PendingPhoneTrigger | null
  ccSidebar: CCSidebarState
  setCcSidebar: (state: CCSidebarState) => void
}

const ContactCenterContext = createContext<ContactCenterContextValue | null>(null)

export function ContactCenterProvider({ children }: { children: ReactNode }) {
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(null)
  const [pendingPhone, setPendingPhone] = useState<PendingPhoneTrigger | null>(null)
  const [ccSidebar, setCcSidebar] = useState<CCSidebarState>('none')

  const openCustomerById = useCallback(
    (customerId: string, customerName: string, primaryPhone: string, conversationId: string | null = null) => {
      setPendingPhone(null)
      setSelectedCustomer({ customerId, customerName, primaryPhone, conversationId })
    },
    []
  )

  const openCustomerByPhone = useCallback((phone: string) => {
    setSelectedCustomer(null)
    setPendingPhone({ phone, nonce: Date.now() })
  }, [])

  const clearSelectedCustomer = useCallback(() => {
    setSelectedCustomer(null)
    setPendingPhone(null)
  }, [])

  const value = useMemo(
    () => ({ selectedCustomer, openCustomerById, openCustomerByPhone, clearSelectedCustomer, pendingPhone, ccSidebar, setCcSidebar }),
    [selectedCustomer, openCustomerById, openCustomerByPhone, clearSelectedCustomer, pendingPhone, ccSidebar]
  )

  return <ContactCenterContext.Provider value={value}>{children}</ContactCenterContext.Provider>
}

export function useContactCenterContext() {
  const ctx = useContext(ContactCenterContext)
  if (!ctx) throw new Error('useContactCenterContext must be used inside ContactCenterProvider')
  return ctx
}
