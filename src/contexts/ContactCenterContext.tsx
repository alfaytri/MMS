'use client'

import { createContext, useContext, useMemo, useState, useCallback, type ReactNode } from 'react'
import type { SelectedCustomer } from '@/types/contact-center'

interface ContactCenterContextValue {
  selectedCustomer: SelectedCustomer | null
  openCustomerById: (customerId: string, customerName: string, primaryPhone: string, conversationId?: string | null) => void
  openCustomerByPhone: (phone: string) => void
  clearSelectedCustomer: () => void
  pendingPhone: string | null
}

const ContactCenterContext = createContext<ContactCenterContextValue | null>(null)

export function ContactCenterProvider({ children }: { children: ReactNode }) {
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(null)
  const [pendingPhone, setPendingPhone] = useState<string | null>(null)

  const openCustomerById = useCallback(
    (customerId: string, customerName: string, primaryPhone: string, conversationId: string | null = null) => {
      setPendingPhone(null)
      setSelectedCustomer({ customerId, customerName, primaryPhone, conversationId })
    },
    []
  )

  const openCustomerByPhone = useCallback((phone: string) => {
    setSelectedCustomer(null)
    setPendingPhone(phone)
  }, [])

  const clearSelectedCustomer = useCallback(() => {
    setSelectedCustomer(null)
    setPendingPhone(null)
  }, [])

  const value = useMemo(
    () => ({ selectedCustomer, openCustomerById, openCustomerByPhone, clearSelectedCustomer, pendingPhone }),
    [selectedCustomer, openCustomerById, openCustomerByPhone, clearSelectedCustomer, pendingPhone]
  )

  return <ContactCenterContext.Provider value={value}>{children}</ContactCenterContext.Provider>
}

export function useContactCenterContext() {
  const ctx = useContext(ContactCenterContext)
  if (!ctx) throw new Error('useContactCenterContext must be used inside ContactCenterProvider')
  return ctx
}
