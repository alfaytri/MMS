// src/hooks/useServiceCustomers.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { normalisePhone, tryNormalisePhone } from '@/lib/contact-center/normalise-phone'

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

// ── Query: list service customers (server-side search + pagination) ───────────
//
// Three parallel fetches avoid the PostgREST row-count ceiling that occurs when
// a nested join on 20k customers × N phones/addresses is fetched in one query.
//
// Search logic:
//   - Always: name ilike '%search%'
//   - When search contains a digit: pre-fetch matching customer_ids from
//     service_customer_phones and add id.in.(...) via PostgREST OR filter.
//     The id.in clause is only added when at least one phone match is found.
//
// Filters:
//   - multiplePhones: fetches customer_ids from the customers_with_multi_phones
//     view (GROUP BY HAVING count > 1 runs server-side) and appends an .in()
//     filter to the main query.

export interface ServiceCustomersPage {
  data: ServiceCustomerRow[]
  total: number
}

export interface ServiceCustomerFilters {
  multiplePhones?: boolean
}

export function useServiceCustomers(
  search   = '',
  page     = 0,
  pageSize = 20,
  filters: ServiceCustomerFilters = {},
) {
  const trimmed  = search.trim()
  const hasSearch = trimmed.length >= 2
  const hasDigit  = hasSearch && /\d/.test(trimmed)

  return useQuery<ServiceCustomersPage>({
    queryKey: ['service-customers', trimmed, page, pageSize, filters.multiplePhones ?? false],
    queryFn: async () => {
      const supabase = createClient()
      const from = page * pageSize
      const to   = from + pageSize - 1

      // 1. Pre-queries run in parallel (only when needed)
      const [phoneRes, multiRes] = await Promise.all([
        hasDigit
          ? (supabase as any)
              .from('service_customer_phones')
              .select('customer_id')
              .ilike('phone', `%${trimmed}%`)
          : Promise.resolve({ data: null, error: null }),
        filters.multiplePhones
          ? (supabase as any)
              .from('customers_with_multi_phones')
              .select('customer_id')
          : Promise.resolve({ data: null, error: null }),
      ])
      if (phoneRes.error) throw phoneRes.error
      if (multiRes.error)  throw multiRes.error

      // Phone customer_ids (only populated when search has a digit)
      const phoneIds: string[] = phoneRes.data
        ? (phoneRes.data as any[]).map((r: any) => r.customer_id)
        : []

      // Multi-phone customer_ids (null = filter not active)
      const multiIds: string[] | null = multiRes.data
        ? (multiRes.data as any[]).map((r: any) => r.customer_id)
        : null

      // 2. Main customer query with exact count for pagination
      let custQuery = (supabase as any)
        .from('service_customers')
        .select(
          'id, name, name_ar, customer_type, is_blocked, referral_source, created_at, updated_at',
          { count: 'exact' },
        )
        .order('name')
        .range(from, to)

      // Search filter — OR(name, phone) when phone IDs exist; plain ilike otherwise
      if (hasSearch) {
        if (phoneIds.length > 0) {
          custQuery = custQuery.or(
            `name.ilike.%${trimmed}%,id.in.(${phoneIds.join(',')})`,
          )
        } else {
          custQuery = custQuery.ilike('name', `%${trimmed}%`)
        }
      }

      // Multiple-phones filter (ANDed with the search above)
      if (multiIds !== null) {
        // If the view returned nothing, use an impossible UUID so the query
        // correctly returns 0 results instead of ignoring the filter.
        const safeIds = multiIds.length > 0
          ? multiIds
          : ['00000000-0000-0000-0000-000000000000']
        custQuery = custQuery.in('id', safeIds)
      }

      const { data: custData, error: custErr, count } = await custQuery
      if (custErr) throw custErr
      const customers = custData as any[]
      if (customers.length === 0) return { data: [], total: count ?? 0 }

      const ids: string[] = customers.map((c: any) => c.id)

      // 2. Fetch all phones for these customers in parallel with addresses
      const [phonesRes, addrsRes] = await Promise.all([
        (supabase as any)
          .from('service_customer_phones')
          .select('id, customer_id, phone, label, is_primary')
          .in('customer_id', ids),
        (supabase as any)
          .from('service_customer_addresses')
          .select('id, customer_id, phone_id, address_type, label, unit, building, street, zone, lat, lng, is_primary, is_geocoded, waze_link, tags, created_at')
          .in('customer_id', ids),
      ])
      if (phonesRes.error) throw phonesRes.error
      if (addrsRes.error)  throw addrsRes.error

      const phonesByCustomer = new Map<string, ServiceCustomerPhone[]>()
      for (const p of (phonesRes.data as ServiceCustomerPhone[])) {
        const arr = phonesByCustomer.get(p.customer_id) ?? []
        arr.push(p)
        phonesByCustomer.set(p.customer_id, arr)
      }
      const addrsByCustomer = new Map<string, ServiceCustomerAddress[]>()
      for (const a of (addrsRes.data as ServiceCustomerAddress[])) {
        const arr = addrsByCustomer.get(a.customer_id) ?? []
        arr.push(a)
        addrsByCustomer.set(a.customer_id, arr)
      }

      return {
        total: count ?? 0,
        data: customers.map((row: any) => {
          const phones    = phonesByCustomer.get(row.id) ?? []
          const addresses = addrsByCustomer.get(row.id) ?? []
          return {
            id:               row.id,
            name:             row.name,
            name_ar:          row.name_ar,
            customer_type:    row.customer_type,
            is_blocked:       row.is_blocked ?? false,
            referral_source:  row.referral_source,
            created_at:       row.created_at,
            updated_at:       row.updated_at,
            primaryPhone:     phones.find((p) => p.is_primary) ?? phones[0] ?? null,
            primaryAddress:   addresses.find((a) => a.is_primary) ?? addresses[0] ?? null,
            allPhones:        phones,
            allAddresses:     addresses,
          }
        }),
      }
    },
    staleTime: 60 * 1000,
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

      // 1. Update customer core fields (and blocked status if provided)
      const coreUpdate: Record<string, unknown> = {
        name: payload.name.trim(),
        referral_source: payload.referral_source || null,
      }
      if (payload.is_blocked !== undefined) {
        coreUpdate.is_blocked = payload.is_blocked
      }
      const { error: custErr } = await (supabase as any)
        .from('service_customers')
        .update(coreUpdate)
        .eq('id', id)
      if (custErr) throw new Error(custErr.message)

      // 2. Insert block record if blacklisting
      if (payload.is_blocked === true) {
        const { data: { user } } = await supabase.auth.getUser()
        await (supabase as any).from('customer_blocks').insert({
          customer_id: id,
          reason: payload.block_reason?.trim() ?? 'Blacklisted via customer page',
          blocked_by: user?.id ?? null,
        })
      }

      // 3. Upsert phones — update existing, insert new, delete removed
      //    First clear all is_primary flags to avoid the unique-index conflict during updates.
      await (supabase as any).from('service_customer_phones').update({ is_primary: false }).eq('customer_id', id)

      const resultPhoneIds: string[] = []
      for (let i = 0; i < payload.phones.length; i++) {
        const p = payload.phones[i]
        const normalised = tryNormalisePhone(p.phone)
        if (!normalised) throw new Error(`Invalid phone number: ${p.phone}`)
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

      // Delete phones removed from the form (note: FK violations will propagate as errors)
      const keepPhoneIds = payload.phones.map((p) => p.id).filter(Boolean) as string[]
      if (keepPhoneIds.length > 0) {
        await (supabase as any)
          .from('service_customer_phones')
          .delete()
          .eq('customer_id', id)
          .not('id', 'in', `(${keepPhoneIds.join(',')})`)
      } else {
        // All phones replaced with new entries — delete old rows
        await (supabase as any).from('service_customer_phones').delete().eq('customer_id', id)
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
