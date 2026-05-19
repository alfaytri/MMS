'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { normalisePhone, tryNormalisePhone } from '@/lib/contact-center/normalise-phone'
import type { CrmMode, UnknownCallerStep, CustomerBlock } from '@/types/contact-center'
import type { InstalledProduct } from '@/types/orders'
export type { InstalledProduct }

export interface ServiceCustomer {
  id: string
  name: string
  name_ar: string | null
  customer_type: 'individual' | 'business'
  is_blocked: boolean
  pending_payment_amount: number
  created_at: string
}

export interface CustomerPhone {
  id: string
  customer_id: string
  phone: string
  label: string | null
  is_primary: boolean
}

export interface ServiceCustomerAddress {
  id: string
  customer_id: string
  phone_id: string | null
  address_type: 'blue-plate' | 'google-coords'
  label: string | null
  unit: string | null
  building: string | null
  street: string | null
  zone: string | null
  lat: number | null
  lng: number | null
  is_primary: boolean
  is_geocoded: boolean
  waze_link: string | null
  tags: string[]
}

export function useCustomerData(customerId: string | null) {
  const supabase = createClient()
  const qc = useQueryClient()
  const [crmMode, setCrmMode] = useState<CrmMode>('view')
  const [unknownStep, setUnknownStep] = useState<UnknownCallerStep>('prompt')

  const { data: customer, isLoading: customerLoading } = useQuery<ServiceCustomer | null>({
    queryKey: ['service-customer', customerId],
    queryFn: async () => {
      if (!customerId) return null
      const { data, error } = await (supabase as any)
        .from('service_customers')
        .select('id, name, name_ar, customer_type, is_blocked, pending_payment_amount, created_at')
        .eq('id', customerId)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!customerId,
  })

  const { data: phones = [] } = useQuery<CustomerPhone[]>({
    queryKey: ['service-customer-phones', customerId],
    queryFn: async () => {
      if (!customerId) return []
      const { data, error } = await (supabase as any)
        .from('service_customer_phones')
        .select('*')
        .eq('customer_id', customerId)
        .order('is_primary', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!customerId,
  })

  const { data: addresses = [] } = useQuery<ServiceCustomerAddress[]>({
    queryKey: ['service-customer-addresses', customerId],
    queryFn: async () => {
      if (!customerId) return []
      const { data, error } = await (supabase as any)
        .from('service_customer_addresses')
        .select('*')
        .eq('customer_id', customerId)
        .order('is_primary', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!customerId,
  })

  const { data: products = [] } = useQuery<InstalledProduct[]>({
    queryKey: ['service-customer-products', customerId],
    queryFn: async () => {
      if (!customerId) return []
      const { data, error } = await (supabase as any)
        .from('installed_products')
        .select('*')
        .eq('customer_id', customerId)
        .order('installed_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!customerId,
  })

  const { data: blocks = [] } = useQuery<CustomerBlock[]>({
    queryKey: ['customer-blocks', customerId],
    queryFn: async () => {
      if (!customerId) return []
      const { data, error } = await (supabase as any)
        .from('customer_blocks')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!customerId,
  })

  const updateCustomer = useMutation({
    mutationFn: async (patch: Partial<Pick<ServiceCustomer, 'name' | 'name_ar' | 'customer_type'>>) => {
      const { error } = await (supabase as any)
        .from('service_customers')
        .update(patch)
        .eq('id', customerId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-customer', customerId] }),
  })

  const addPhone = useMutation({
    mutationFn: async ({ phone, label, isPrimary }: { phone: string; label?: string; isPrimary?: boolean }) => {
      const canonical = normalisePhone(phone)
      const { error } = await (supabase as any)
        .from('service_customer_phones')
        .insert({ customer_id: customerId, phone: canonical, label: label ?? null, is_primary: isPrimary ?? false })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-customer-phones', customerId] }),
  })

  const removePhone = useMutation({
    mutationFn: async (phoneId: string) => {
      const { error } = await (supabase as any)
        .from('service_customer_phones')
        .delete()
        .eq('id', phoneId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-customer-phones', customerId] }),
  })

  const blockCustomer = useMutation({
    mutationFn: async ({ reason, notes, imageUrl }: { reason: string; notes?: string; imageUrl?: string }) => {
      const { data: { user } } = await supabase.auth.getUser()
      await Promise.all([
        (supabase as any).from('customer_blocks').insert({
          customer_id: customerId,
          reason,
          notes: notes ?? null,
          image_url: imageUrl ?? null,
          blocked_by: user?.id ?? null,
        }),
        (supabase as any).from('service_customers').update({ is_blocked: true }).eq('id', customerId),
      ])
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service-customer', customerId] })
      qc.invalidateQueries({ queryKey: ['customer-blocks', customerId] })
      setCrmMode('view')
    },
  })

  const unblockCustomer = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from('service_customers')
        .update({ is_blocked: false })
        .eq('id', customerId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-customer', customerId] }),
  })

  const searchByPhone = useCallback(async (rawPhone: string) => {
    const phone = tryNormalisePhone(rawPhone) ?? rawPhone
    const { data } = await (supabase as any)
      .from('service_customer_phones')
      .select('customer_id, service_customers(id, name)')
      .eq('phone', phone)
      .maybeSingle()
    return data
  }, [])

  return {
    customer,
    customerLoading,
    phones,
    addresses,
    products,
    blocks,
    crmMode,
    setCrmMode,
    unknownStep,
    setUnknownStep,
    updateCustomer,
    addPhone,
    removePhone,
    blockCustomer,
    unblockCustomer,
    searchByPhone,
  }
}
