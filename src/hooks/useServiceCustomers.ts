// src/hooks/useServiceCustomers.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { normalisePhone } from '@/lib/contact-center/normalise-phone'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ServiceCustomerPhone {
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
  created_at: string
}

export interface ServiceCustomerRow {
  id: string
  name: string
  name_ar: string | null
  customer_type: 'individual' | 'business' | null
  is_blocked: boolean
  referral_source: string | null
  created_at: string
  updated_at: string
  primaryPhone: ServiceCustomerPhone | null
  primaryAddress: ServiceCustomerAddress | null
  allPhones: ServiceCustomerPhone[]
  allAddresses: ServiceCustomerAddress[]
}

// ── Payload types for mutations ────────────────────────────────────────────────

export interface PhoneInput {
  id?: string           // undefined = new entry
  phone: string
  label: string | null
  is_primary: boolean
}

export interface AddressInput {
  id?: string
  address_type: 'blue-plate' | 'google-coords'
  label: string | null
  phoneIndex: number | null  // index into PhoneInput[], resolved to phone_id on save
  unit: string | null
  building: string | null
  street: string | null
  zone: string | null
  lat: string            // string in form, parsed to number on save; '' = null
  lng: string
  is_primary: boolean
}

export interface CreateServiceCustomerPayload {
  name: string
  referral_source: string | null
  phones: PhoneInput[]
  primaryPhoneIdx: number
  addresses: AddressInput[]
  primaryAddressIdx: number
}

export interface UpdateServiceCustomerPayload extends CreateServiceCustomerPayload {
  id: string
  is_blocked?: boolean
  block_reason?: string | null
}

// ── Query: list all service customers ─────────────────────────────────────────

export function useServiceCustomers() {
  return useQuery<ServiceCustomerRow[]>({
    queryKey: ['service-customers'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('service_customers')
        .select(`
          id, name, name_ar, customer_type, is_blocked, referral_source, created_at, updated_at,
          service_customer_phones(id, customer_id, phone, label, is_primary),
          service_customer_addresses(id, customer_id, phone_id, address_type, label, unit, building, street, zone, lat, lng, is_primary, is_geocoded, waze_link, tags, created_at)
        `)
        .order('name')
      if (error) throw error

      return (data as any[]).map((row) => {
        const phones: ServiceCustomerPhone[] = row.service_customer_phones ?? []
        const addresses: ServiceCustomerAddress[] = row.service_customer_addresses ?? []
        return {
          id: row.id,
          name: row.name,
          name_ar: row.name_ar,
          customer_type: row.customer_type,
          is_blocked: row.is_blocked ?? false,
          referral_source: row.referral_source,
          created_at: row.created_at,
          updated_at: row.updated_at,
          primaryPhone: phones.find((p) => p.is_primary) ?? phones[0] ?? null,
          primaryAddress: addresses.find((a) => a.is_primary) ?? addresses[0] ?? null,
          allPhones: phones,
          allAddresses: addresses,
        }
      })
    },
    staleTime: 30 * 1000,
  })
}

// ── Mutation: create ───────────────────────────────────────────────────────────

export function useCreateServiceCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateServiceCustomerPayload): Promise<string> => {
      const supabase = createClient()

      // 1. Insert customer
      const { data: customer, error: custErr } = await (supabase as any)
        .from('service_customers')
        .insert({ name: payload.name.trim(), referral_source: payload.referral_source || null })
        .select('id')
        .single()
      if (custErr) throw new Error(custErr.message)
      const customerId: string = customer.id

      // 2. Insert phones, capture inserted IDs in order
      const phoneRows = payload.phones.map((p, i) => ({
        customer_id: customerId,
        phone: normalisePhone(p.phone),
        label: p.label || null,
        is_primary: i === payload.primaryPhoneIdx,
      }))
      const { data: insertedPhones, error: phoneErr } = await (supabase as any)
        .from('service_customer_phones')
        .insert(phoneRows)
        .select('id')
      if (phoneErr) throw new Error(phoneErr.message)
      const phoneIds: string[] = (insertedPhones as any[]).map((p) => p.id)

      // 3. Insert addresses, resolving phoneIndex → phone_id
      if (payload.addresses.length > 0) {
        const addressRows = payload.addresses.map((a, i) => {
          const lat = a.lat !== '' ? parseFloat(a.lat) : null
          const lng = a.lng !== '' ? parseFloat(a.lng) : null
          const isValidGeocode = lat != null && !isNaN(lat) && lng != null && !isNaN(lng)
          return {
            customer_id: customerId,
            phone_id: a.phoneIndex != null ? (phoneIds[a.phoneIndex] ?? null) : null,
            address_type: a.address_type,
            label: a.label || null,
            unit: a.unit || null,
            building: a.building || null,
            street: a.street || null,
            zone: a.zone || null,
            lat: isValidGeocode ? lat : null,
            lng: isValidGeocode ? lng : null,
            is_primary: i === payload.primaryAddressIdx,
            is_geocoded: isValidGeocode,
            waze_link: isValidGeocode
              ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
              : null,
          }
        })
        const { error: addrErr } = await (supabase as any)
          .from('service_customer_addresses')
          .insert(addressRows)
        if (addrErr) throw new Error(addrErr.message)
      }

      return customerId
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-customers'] }),
  })
}

// ── Mutation: update ───────────────────────────────────────────────────────────

export function useUpdateServiceCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: UpdateServiceCustomerPayload): Promise<void> => {
      const supabase = createClient()
      const { id } = payload

      // 1. Update customer core fields
      const { error: custErr } = await (supabase as any)
        .from('service_customers')
        .update({
          name: payload.name.trim(),
          referral_source: payload.referral_source || null,
        })
        .eq('id', id)
      if (custErr) throw new Error(custErr.message)

      // 2. Handle blacklist changes
      if (payload.is_blocked === true) {
        const { data: { user } } = await supabase.auth.getUser()
        await Promise.all([
          (supabase as any).from('service_customers').update({ is_blocked: true }).eq('id', id),
          (supabase as any).from('customer_blocks').insert({
            customer_id: id,
            reason: payload.block_reason?.trim() ?? 'Blacklisted via customer page',
            blocked_by: user?.id ?? null,
          }),
        ])
      } else if (payload.is_blocked === false) {
        await (supabase as any).from('service_customers').update({ is_blocked: false }).eq('id', id)
      }

      // 3. Upsert phones — update existing, insert new, delete removed
      //    First clear all is_primary flags to avoid the unique-index conflict during updates.
      await (supabase as any).from('service_customer_phones').update({ is_primary: false }).eq('customer_id', id)

      const resultPhoneIds: string[] = []
      for (let i = 0; i < payload.phones.length; i++) {
        const p = payload.phones[i]
        const normalised = normalisePhone(p.phone)
        if (p.id) {
          // Update existing
          await (supabase as any)
            .from('service_customer_phones')
            .update({ phone: normalised, label: p.label || null, is_primary: false })
            .eq('id', p.id)
          resultPhoneIds.push(p.id)
        } else {
          // Insert new
          const { data: newPhone, error: pErr } = await (supabase as any)
            .from('service_customer_phones')
            .insert({ customer_id: id, phone: normalised, label: p.label || null, is_primary: false })
            .select('id')
            .single()
          if (pErr) throw new Error(pErr.message)
          resultPhoneIds.push(newPhone.id)
        }
      }

      // Delete phones removed from the form (try/catch: FK violation = order references it, skip silently)
      const keepPhoneIds = payload.phones.map((p) => p.id).filter(Boolean) as string[]
      if (keepPhoneIds.length > 0) {
        await (supabase as any)
          .from('service_customer_phones')
          .delete()
          .eq('customer_id', id)
          .not('id', 'in', `(${keepPhoneIds.join(',')})`)
      }

      // Set the single primary
      const primaryId = resultPhoneIds[payload.primaryPhoneIdx]
      if (primaryId) {
        await (supabase as any).from('service_customer_phones').update({ is_primary: true }).eq('id', primaryId)
      }

      // 4. Diff addresses — delete removed, upsert kept (preserves created_at, avoids ID churn)
      const keepAddressIds = payload.addresses.map((a) => a.id).filter(Boolean) as string[]
      if (keepAddressIds.length > 0) {
        await (supabase as any)
          .from('service_customer_addresses')
          .delete()
          .eq('customer_id', id)
          .not('id', 'in', `(${keepAddressIds.join(',')})`)
      } else {
        // All addresses were removed
        await (supabase as any).from('service_customer_addresses').delete().eq('customer_id', id)
      }

      if (payload.addresses.length > 0) {
        const addressRows = payload.addresses.map((a, i) => {
          const lat = a.lat !== '' ? parseFloat(a.lat) : null
          const lng = a.lng !== '' ? parseFloat(a.lng) : null
          const isValidGeocode = lat != null && !isNaN(lat) && lng != null && !isNaN(lng)
          return {
            ...(a.id ? { id: a.id } : {}),
            customer_id: id,
            phone_id: a.phoneIndex != null ? (resultPhoneIds[a.phoneIndex] ?? null) : null,
            address_type: a.address_type,
            label: a.label || null,
            unit: a.unit || null,
            building: a.building || null,
            street: a.street || null,
            zone: a.zone || null,
            lat: isValidGeocode ? lat : null,
            lng: isValidGeocode ? lng : null,
            is_primary: i === payload.primaryAddressIdx,
            is_geocoded: isValidGeocode,
            waze_link: isValidGeocode
              ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
              : null,
          }
        })
        // upsert: existing rows (with id) are updated; new rows (no id) are inserted
        const { error: addrErr } = await (supabase as any)
          .from('service_customer_addresses')
          .upsert(addressRows, { onConflict: 'id' })
        if (addrErr) throw new Error(addrErr.message)
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['service-customers'] })
      qc.invalidateQueries({ queryKey: ['service-customer', vars.id] })
      qc.invalidateQueries({ queryKey: ['service-customer-addresses', vars.id] })
    },
  })
}
