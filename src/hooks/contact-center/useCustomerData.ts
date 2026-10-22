'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { normalisePhone, tryNormalisePhone } from '@/lib/contact-center/normalise-phone'
import type { CrmMode, UnknownCallerStep, CustomerBlock } from '@/types/contact-center'
import type { InstalledProduct } from '@/types/orders'
import { queryKeys } from '@/lib/queryKeys'
export type { InstalledProduct }

// Stage 5 (customer consolidation): the Contact Centre CRM panel now reads the unified
// `customers` table + its satellites (`customer_phones`, `customer_addresses`). `customerId`
// is a `customers.id`. `customer_type` maps from `customers.entity_type`; the pending amount
// is computed live from tl_invoices via get_customer_pending_summary (customers has no stored
// field). Field names below keep their original shape so CrmSection/CustomerCardV2 are unchanged.

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

// customer_addresses stores *_no columns; map back to the building/street/zone/unit shape
// the CRM panel expects (same mapping useCustomerAddresses uses for order-create).
function mapAddr(row: Record<string, unknown>): ServiceCustomerAddress {
  return {
    id:           row.id as string,
    customer_id:  row.customer_id as string,
    phone_id:     (row.phone_id as string | null) ?? null,
    address_type: (row.address_type as ServiceCustomerAddress['address_type']) ?? 'blue-plate',
    label:        (row.label as string | null) ?? null,
    unit:         (row.unit_no as string | null) ?? null,
    building:     (row.building_no as string | null) ?? null,
    street:       (row.street_no as string | null) ?? null,
    zone:         (row.zone_no as string | null) ?? null,
    lat:          (row.lat as number | null) ?? null,
    lng:          (row.lng as number | null) ?? null,
    is_primary:   (row.is_primary as boolean) ?? false,
    is_geocoded:  (row.is_geocoded as boolean) ?? false,
    waze_link:    (row.waze_link as string | null) ?? null,
    tags:         (row.tags as string[]) ?? [],
  }
}

export function useCustomerData(customerId: string | null) {
  const supabase = createClient()
  const qc = useQueryClient()
  const [crmMode, setCrmMode] = useState<CrmMode>('view')
  const [unknownStep, setUnknownStep] = useState<UnknownCallerStep>('prompt')

  const { data: customer, isLoading: customerLoading } = useQuery<ServiceCustomer | null>({
    queryKey: queryKeys.contactCenter.serviceCustomer(customerId),
    queryFn: async () => {
      if (!customerId) return null
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, name_ar, entity_type, is_blocked, created_at')
        .eq('id', customerId)
        .single()
      if (error) throw error
      // Real pending: customers has no stored amount — compute from tl_invoices.
      const { data: pend } = await supabase.rpc(
        'get_customer_pending_summary' as never,
        { p_customer_id: customerId } as never,
      )
      const pRow = (Array.isArray(pend) ? pend[0] : pend) as { total_pending?: number } | null
      const row = data as unknown as {
        id: string; name: string; name_ar: string | null
        entity_type: 'individual' | 'business' | null; is_blocked: boolean; created_at: string
      }
      return {
        id:                     row.id,
        name:                   row.name,
        name_ar:                row.name_ar,
        customer_type:          row.entity_type ?? 'individual',
        is_blocked:             row.is_blocked,
        pending_payment_amount: Number(pRow?.total_pending ?? 0),
        created_at:             row.created_at,
      } as ServiceCustomer
    },
    enabled: !!customerId,
  })

  const { data: phones = [] } = useQuery<CustomerPhone[]>({
    queryKey: queryKeys.contactCenter.serviceCustomerPhones(customerId),
    queryFn: async () => {
      if (!customerId) return []
      const { data, error } = await supabase
        .from('customer_phones')
        .select('id, customer_id, phone, label, is_primary')
        .eq('customer_id', customerId)
        .order('is_primary', { ascending: false })
      if (error) throw error
      return (data ?? []) as CustomerPhone[]
    },
    enabled: !!customerId,
  })

  const { data: addresses = [] } = useQuery<ServiceCustomerAddress[]>({
    queryKey: queryKeys.contactCenter.serviceCustomerAddresses(customerId),
    queryFn: async () => {
      if (!customerId) return []
      const { data, error } = await supabase
        .from('customer_addresses')
        .select('*')
        .eq('customer_id', customerId)
        .order('is_primary', { ascending: false })
      if (error) throw error
      return (data ?? []).map((r) => mapAddr(r as unknown as Record<string, unknown>))
    },
    enabled: !!customerId,
  })

  const { data: products = [] } = useQuery<InstalledProduct[]>({
    queryKey: queryKeys.contactCenter.serviceCustomerProducts(customerId),
    queryFn: async () => {
      if (!customerId) return []
      const { data, error } = await supabase
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
    queryKey: queryKeys.contactCenter.customerBlocks(customerId),
    queryFn: async () => {
      if (!customerId) return []
      const { data, error } = await supabase
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
      const dbPatch: Record<string, unknown> = {}
      if (patch.name !== undefined)          dbPatch.name = patch.name
      if (patch.name_ar !== undefined)       dbPatch.name_ar = patch.name_ar
      if (patch.customer_type !== undefined) dbPatch.entity_type = patch.customer_type
      const { error } = await supabase
        .from('customers')
        // is_blocked / entity_type writes: cast past the (stale) generated types.
        .update(dbPatch as never)
        .eq('id', customerId!)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.contactCenter.serviceCustomer(customerId) }),
  })

  const addPhone = useMutation({
    mutationFn: async ({ phone, label, isPrimary }: { phone: string; label?: string; isPrimary?: boolean }) => {
      const canonical = normalisePhone(phone)
      const { error } = await supabase
        .from('customer_phones')
        .insert({ customer_id: customerId!, phone: canonical, label: label ?? null, is_primary: isPrimary ?? false })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.contactCenter.serviceCustomerPhones(customerId) }),
  })

  const removePhone = useMutation({
    mutationFn: async (phoneId: string) => {
      const { error } = await supabase
        .from('customer_phones')
        .delete()
        .eq('id', phoneId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.contactCenter.serviceCustomerPhones(customerId) }),
  })

  const blockCustomer = useMutation({
    mutationFn: async ({ reason, notes, imageUrl }: { reason: string; notes?: string; imageUrl?: string }) => {
      const { data: { user } } = await supabase.auth.getUser()
      await Promise.all([
        supabase.from('customer_blocks').insert({
          customer_id: customerId!,
          reason,
          notes: notes ?? null,
          image_url: imageUrl ?? null,
          blocked_by: user?.id ?? null,
        }),
        supabase.from('customers').update({ is_blocked: true } as never).eq('id', customerId!),
      ])
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.contactCenter.serviceCustomer(customerId) })
      qc.invalidateQueries({ queryKey: queryKeys.contactCenter.customerBlocks(customerId) })
      setCrmMode('view')
    },
  })

  const unblockCustomer = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('customers')
        .update({ is_blocked: false } as never)
        .eq('id', customerId!)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.contactCenter.serviceCustomer(customerId) }),
  })

  const searchByPhone = useCallback(async (rawPhone: string) => {
    const phone = tryNormalisePhone(rawPhone) ?? rawPhone
    const { data } = await supabase
      .from('customer_phones')
      .select('customer_id, customers(id, name)')
      .eq('phone', phone)
      .maybeSingle()
    return data
  }, [supabase])

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
