import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/logActivity'
import { queryKeys } from '@/lib/queryKeys'
import type { Database } from '@/types/database.types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SOStatus =
  | 'quotation'
  | 'pending_approval'
  | 'confirmed'
  | 'partial_delivery'
  | 'delivered'
  | 'invoiced'
  | 'closed'
  | 'cancelled'

export type SOLineItem = {
  id:                  string
  sale_order_id:       string
  item_name:           string
  sku:                 string | null
  qty:                 number
  unit:                string
  unit_price:          number
  total:               number
  delivered_qty:       number
  line_type:           string
  brand_variant_id:    string | null
  avg_cost:            number
  created_at:          string
  inventory_item_brand_variants?: {
    brand: string
    inventory_items?: {
      name_en: string
      inventory_categories?: {
        id: string
        name_en: string
        parent_id: string | null
        type: string
        ancestor_chain?: string[]
      } | null
    } | null
  } | null
}

export type SaleOrderLineSummary = {
  sale_order_line_id:  string
  sale_order_id:       string
  brand_variant_id:    string | null
  sku:                 string | null
  item_name:           string
  qty:                 number
  shipped_qty:         number
  returned_good_qty:   number
  replacement_qty:     number
  net_delivered_qty:   number
}

export type SaleDelivery = {
  id: string
  delivery_number: string
  sale_order_id: string
  warehouse_id: string
  warehouse_name: string | null
  date: string
  sale_delivery_lines: {
    id: string
    sale_delivery_id: string
    item_name: string
    sku: string | null
    qty_delivered: number
    brand_variant_id: string | null
    created_at: string
  }[]
  status: string
  created_by_name: string | null
  created_at: string
  type: 'standard' | 'replacement'
  return_id: string | null
}

export type SaleOrder = {
  id:                       string
  so_number:                string
  customer_id:              string
  status:                   SOStatus
  subtotal:                 number
  tax:                      number
  total:                    number
  discount_amount:          number
  discount_label:           string | null
  discount_type:            string | null
  discount_amount_resolved: number
  currency:                 string
  exchange_rate:            number
  expected_delivery:        string | null
  payment_terms:            string | null
  payment_terms_notes:      string | null
  payment_milestones:       { label: string; percent: number }[] | null
  delivery_terms:           string | null
  delivery_terms_notes:     string | null
  customer_notes:           string | null
  validity_days:            number
  notes:                    string | null
  created_by_name:          string | null
  created_at:               string
  updated_at:               string
  deleted_at:               string | null
  sale_order_lines?:        SOLineItem[]
  sale_order_lines_summary?: SaleOrderLineSummary[]
  sale_deliveries?:         SaleDelivery[]
  customer_name?:           string
  customer_phone?:          string
}

export type SalePayment = {
  id: string
  amount: number
  method: string
  date: string
  reference: string | null
  notes: string | null
  currency: string
  exchange_rate: number
  amount_qar: number | null
  created_at: string
}

export type CustomerPhone = {
  phone:      string
  is_primary: boolean
}

export type Customer = {
  id:                  string
  name:                string
  phone:               string | null
  phones:              CustomerPhone[]
  email:               string | null
  entity_type:         'individual' | 'business' | null
  is_blocked:          boolean
  is_active:           boolean
  credit_group_id:     string | null
  credit_group_name?:  string | null
  credit_group_limit?: number | null
  credit_group_default_terms?: string | null
  cr_url?:                  string | null
  establishment_id_url?:    string | null
  signed_credit_form_url?:  string | null
}

export type SOLineItemDraft = {
  item_name:          string
  sku:                string
  qty:                number
  unit:               string
  unit_price:         number
  total:              number
  line_type:          string
  brand_variant_id:   string | null
  avg_cost:           number
}

export type CreateSOPayload = {
  customer_id:          string
  intent:               'quotation' | 'confirm'
  currency:             string
  exchange_rate:        number
  expected_delivery:    string | null
  payment_terms:        string | null
  payment_terms_notes:  string | null
  payment_milestones:   { label: string; percent: number }[] | null
  delivery_terms:       string | null
  delivery_terms_notes: string | null
  customer_notes:       string | null
  validity_days:        number
  discount_amount:      number
  discount_label:       string | null
  discount_type:        'fixed' | 'percentage'
  line_items:           SOLineItemDraft[]
  division_id:          string | null
}

export type CreateSOResult = {
  so_id:        string
  so_number:    string
  status:       SOStatus
  credit_limit: number
  group_name:   string
  open_total:   number
  available:    number
}

export type UpdateSOPayload = Partial<CreateSOPayload> & { id: string }

export interface SOFilters {
  search?: string
  status?: SOStatus | ''
  statuses?: SOStatus[]
  dateFrom?: string
  dateTo?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function calcSOSubtotal(lineItems: { total: number }[]): number {
  return lineItems.reduce((sum, li) => sum + li.total, 0)
}

export function calcSOTotal(subtotal: number, discountAmount: number, discountType: 'fixed' | 'percentage'): number {
  const discount = discountType === 'percentage' ? (subtotal * discountAmount) / 100 : discountAmount
  return subtotal - discount
}

export function hasNegativeMargin(lineItems: { unit_price: number; avg_cost: number }[]): boolean {
  return lineItems.some((li) => li.avg_cost > 0 && li.unit_price < li.avg_cost)
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useCustomers(search?: string) {
  return useQuery({
    queryKey: queryKeys.customers.search(search),
    queryFn: async () => {
      const supabase = createClient()
      const { data: payload, error } = await supabase.rpc('search_customers', {
        p_query:       search ?? undefined,
        p_only_active: true,
        p_limit:       50,
        p_offset:      0,
      })
      if (error) throw error
      const data = (payload as { rows?: unknown[] } | null)?.rows ?? []
      return (data as Record<string, unknown>[]).map((row) => {
        const r = row as typeof row & {
          credit_groups?: { name?: string; credit_limit?: number; default_payment_terms?: string | null } | null
          customer_phones?: { phone: string; is_primary: boolean }[]
        }
        const phones = (r.customer_phones ?? []).map((p) => ({ phone: p.phone, is_primary: p.is_primary }))
        const primary = phones.find((p) => p.is_primary) ?? phones[0] ?? null
        return {
          ...row,
          phone:                       primary?.phone ?? null,
          phones,
          credit_group_name:           r.credit_groups?.name                  ?? null,
          credit_group_limit:          r.credit_groups?.credit_limit          ?? null,
          credit_group_default_terms:  r.credit_groups?.default_payment_terms ?? null,
        }
      }) as unknown as Customer[]
    },
    staleTime: 30 * 1000,
    enabled: true,
  })
}

const CUSTOMERS_PAGE_SIZE = 50

export function useAllCustomers(search: string, page: number) {
  return useQuery({
    queryKey: queryKeys.customers.allCustomersSearch(search, page),
    queryFn:  async () => {
      const supabase = createClient()
      const { data: payload, error } = await supabase.rpc('search_customers', {
        p_query:       search ?? undefined,
        p_only_active: false,
        p_limit:       CUSTOMERS_PAGE_SIZE,
        p_offset:      page * CUSTOMERS_PAGE_SIZE,
      })
      if (error) throw error
      const parsed = (payload as { rows?: unknown[]; total_count?: number } | null) ?? {}
      const data   = parsed.rows ?? []
      const count  = parsed.total_count ?? 0
      return {
        customers: (data as Record<string, unknown>[]).map((row) => {
          const r = row as typeof row & {
            credit_groups?: { name?: string; credit_limit?: number } | null
            customer_phones?: { phone: string; is_primary: boolean }[]
          }
          const phones = (r.customer_phones ?? []).map((p) => ({ phone: p.phone, is_primary: p.is_primary }))
          const primary = phones.find((p) => p.is_primary) ?? phones[0] ?? null
          return {
            ...row,
            phone:              primary?.phone ?? null,
            phones,
            credit_group_name:  r.credit_groups?.name         ?? null,
            credit_group_limit: r.credit_groups?.credit_limit ?? null,
          }
        }) as Customer[],
        total: count,
      }
    },
    staleTime: 30 * 1000,
    placeholderData: (prev) => prev,
  })
}

export function useCreateCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      name: string
      phones: { phone: string; is_primary: boolean }[]
      email: string | null
      credit_group_id?: string | null
      entity_type?: 'individual' | 'business'
      cr_url?: string | null
      establishment_id_url?: string | null
      signed_credit_form_url?: string | null
    }) => {
      const supabase = createClient()
      const now = new Date().toISOString()
      const { phones, ...customerFields } = payload
      const row = {
        ...customerFields,
        cr_uploaded_at:                 payload.cr_url                 ? now : null,
        establishment_id_uploaded_at:   payload.establishment_id_url   ? now : null,
        signed_credit_form_uploaded_at: payload.signed_credit_form_url ? now : null,
      }
      const { data, error } = await supabase
        .from('customers')
        .insert(row)
        .select()
        .single()
      if (error) throw error

      const { error: phoneErr } = await supabase.rpc('save_customer_phones', {
        p_customer_id: data.id,
        p_phones: phones,
      })
      if (phoneErr) {
        // Roll back the customer so the admin can retry with a different number.
        await supabase.from('customers').delete().eq('id', data.id)
        throw new Error(phoneErr.message.includes('already assigned') || phoneErr.message.includes('23505')
          ? phoneErr.message.replace(/^ERROR:\s*/i, '')
          : phoneErr.message)
      }

      const primary = phones.find((p) => p.is_primary) ?? phones[0]
      void logActivity({
        action: 'Customer Created',
        module: 'customers',
        entity_id: data.id,
        entity_type: 'customer',
        new_data: { ...data, phone: primary?.phone ?? null, phones } as unknown as Record<string, unknown>,
      })
      return { ...data, phone: primary?.phone ?? null, phones }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.allCustomers })
    },
  })
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      id:    string
      patch: {
        name?:                   string
        phones?:                 { phone: string; is_primary: boolean }[]
        email?:                  string | null
        entity_type?:            'individual' | 'business'
        credit_group_id?:        string | null
        cr_url?:                 string | null
        establishment_id_url?:   string | null
        signed_credit_form_url?: string | null
      }
      // Old values for audit diff; only fields present here are checked
      previous: {
        name?:                   string
        phones?:                 { phone: string; is_primary: boolean }[]
        email?:                  string | null
        entity_type?:            string | null
        credit_group_id?:        string | null
        credit_group_name?:      string | null
        cr_url?:                 string | null
        establishment_id_url?:   string | null
        signed_credit_form_url?: string | null
      }
      new_credit_group_name?: string | null
    }) => {
      const supabase = createClient()
      const now = new Date().toISOString()

      // Phones live on customer_phones; strip out of the customers update.
      const { phones: newPhones, ...customerPatch } = args.patch
      const update: Database['public']['Tables']['customers']['Update'] = { ...customerPatch }
      if (args.patch.cr_url && args.patch.cr_url !== args.previous.cr_url) {
        update.cr_uploaded_at = now
      }
      if (args.patch.establishment_id_url && args.patch.establishment_id_url !== args.previous.establishment_id_url) {
        update.establishment_id_uploaded_at = now
      }
      if (args.patch.signed_credit_form_url && args.patch.signed_credit_form_url !== args.previous.signed_credit_form_url) {
        update.signed_credit_form_uploaded_at = now
      }

      const { data, error } = await supabase
        .from('customers')
        .update(update)
        .eq('id', args.id)
        .select('id, name')
      if (error) throw error
      if (!data || data.length === 0) throw new Error('Customer not found or update blocked')

      // Sync phones via RPC when the list changed.
      if (newPhones !== undefined) {
        const prev = args.previous.phones ?? []
        const same =
          prev.length === newPhones.length &&
          prev.every((p) => newPhones.some((np) => np.phone === p.phone && np.is_primary === p.is_primary))
        if (!same) {
          const { error: phoneErr } = await supabase.rpc('save_customer_phones', {
            p_customer_id: args.id,
            p_phones: newPhones,
          })
          if (phoneErr) {
            throw new Error(phoneErr.message.includes('already assigned') || phoneErr.message.includes('23505')
              ? phoneErr.message.replace(/^ERROR:\s*/i, '')
              : phoneErr.message)
          }
        }
      }

      // Build a diff for the audit log — only include fields that actually changed.
      const diff: Array<{ field: string; from: unknown; to: unknown }> = []
      const cmp = <K extends keyof typeof args.patch>(
        key: K,
        prev: unknown,
        label?: string,
      ) => {
        if (args.patch[key] === undefined) return
        if (args.patch[key] !== prev) {
          diff.push({ field: label ?? (key as string), from: prev ?? null, to: args.patch[key] ?? null })
        }
      }
      cmp('name',                   args.previous.name)
      cmp('email',                  args.previous.email)
      // Phones are diffed separately (structural), not through cmp().
      if (args.patch.phones !== undefined) {
        const prevKey = (args.previous.phones ?? []).map((p) => `${p.phone}${p.is_primary ? '*' : ''}`).sort().join(',')
        const nextKey = args.patch.phones.map((p) => `${p.phone}${p.is_primary ? '*' : ''}`).sort().join(',')
        if (prevKey !== nextKey) {
          diff.push({ field: 'phones', from: prevKey || null, to: nextKey || null })
        }
      }
      cmp('entity_type',            args.previous.entity_type)
      cmp('cr_url',                 args.previous.cr_url,                'cr_doc')
      cmp('establishment_id_url',   args.previous.establishment_id_url,  'establishment_id_doc')
      cmp('signed_credit_form_url', args.previous.signed_credit_form_url,'signed_credit_form_doc')
      // Special-case credit group so we can log human names rather than UUIDs
      if (
        args.patch.credit_group_id !== undefined &&
        args.patch.credit_group_id !== args.previous.credit_group_id
      ) {
        diff.push({
          field: 'credit_group',
          from: args.previous.credit_group_name ?? args.previous.credit_group_id ?? null,
          to:   args.new_credit_group_name      ?? args.patch.credit_group_id    ?? null,
        })
      }

      if (diff.length > 0) {
        void logActivity({
          action:      'Customer Updated',
          module:      'customers',
          entity_id:   args.id,
          entity_type: 'customer',
          details:     JSON.stringify({ customer_name: data[0]?.name ?? null, changes: diff }),
        })
      }

      return { id: args.id }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.allCustomers })
    },
  })
}

export function useToggleCustomerActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('customers')
        .update({ is_active })
        .eq('id', id)
      if (error) throw error
      void logActivity({
        action:      is_active ? 'Customer Enabled' : 'Customer Disabled',
        module:      'customers',
        entity_id:   id,
        entity_type: 'customer',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.allCustomers })
    },
  })
}

export function useSaleOrders(filters: SOFilters = {}) {
  return useQuery({
    queryKey: queryKeys.saleOrders.list(filters),
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('sale_orders')
        .select('*, sale_order_lines(*), sale_deliveries(*, sale_delivery_lines(*)), customers!inner(name), created_by_user:user_data!sale_orders_created_by_fkey(full_name)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (filters.statuses && filters.statuses.length > 0) {
        q = q.in('status', filters.statuses)
      } else if (filters.status) {
        q = q.eq('status', filters.status)
      }
      if (filters.dateFrom) q = q.gte('created_at', filters.dateFrom)
      if (filters.dateTo) q = q.lte('created_at', filters.dateTo)
      if (filters.search) {
        const safe = filters.search.replace(/%/g, '\\%')
        q = q.or(`so_number.ilike.%${safe}%,customers.name.ilike.%${safe}%`)
      }
      const { data, error } = await q
      if (error) throw error

      const orderIds = (data ?? []).map((r) => r.id)
      const summaryByOrder = new Map<string, SaleOrderLineSummary[]>()
      if (orderIds.length > 0) {
        const { data: sums, error: sumErr } = await supabase
          .from('sale_order_lines_summary')
          .select('*')
          .in('sale_order_id', orderIds)
        if (sumErr) throw sumErr
        for (const row of (sums ?? []) as unknown as SaleOrderLineSummary[]) {
          const arr = summaryByOrder.get(row.sale_order_id) ?? []
          arr.push(row)
          summaryByOrder.set(row.sale_order_id, arr)
        }
      }

      return (data ?? []).map((row) => {
        const r = row as typeof row & {
          customers?: { name?: string } | null
          created_by_user?: { full_name?: string } | null
        }
        return {
          ...row,
          customer_name:    r.customers?.name ?? null,
          created_by_name:  r.created_by_user?.full_name ?? (row as { created_by_name?: string | null }).created_by_name ?? null,
          sale_order_lines_summary: summaryByOrder.get(row.id) ?? [],
        }
      }) as unknown as SaleOrder[]
    },
    staleTime: 30 * 1000,
  })
}

export function useSaleOrder(id: string | null) {
  return useQuery({
    queryKey: queryKeys.saleOrders.detail(id),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('sale_orders')
        .select(`
          *,
          sale_order_lines(
            *,
            inventory_item_brand_variants(
              brand,
              inventory_items(
                name_en,
                inventory_categories(id, name_en, parent_id, type)
              )
            )
          ),
          sale_deliveries(*, sale_delivery_lines(*)),
          customers(name, email, customer_phones(phone, is_primary))
        `)
        .eq('id', id!)
        .single()
      if (error) throw error

      const catIds = new Set<string>()
      for (const li of data.sale_order_lines ?? []) {
        const cat = li.inventory_item_brand_variants?.inventory_items?.inventory_categories
        if (cat?.id) catIds.add(cat.id)
        if (cat?.parent_id) catIds.add(cat.parent_id)
      }

      let catMap: Record<string, { name_en: string; parent_id: string | null }> = {}
      if (catIds.size > 0) {
        const { data: cats } = await supabase
          .from('inventory_categories')
          .select('id, name_en, parent_id')
          .in('id', [...catIds])
        if (cats) {
          const grandparentIds = cats
            .filter((c) => c.parent_id && !catIds.has(c.parent_id))
            .map((c) => c.parent_id as string)
          if (grandparentIds.length > 0) {
            const { data: gps } = await supabase
              .from('inventory_categories')
              .select('id, name_en, parent_id')
              .in('id', grandparentIds)
            if (gps) cats.push(...gps)
          }
          catMap = Object.fromEntries(cats.map((c) => [c.id, { name_en: c.name_en, parent_id: c.parent_id }]))
        }
      }

      function getAncestorChain(catId: string): string[] {
        const chain: string[] = []
        let cur = catMap[catId]
        while (cur) {
          chain.unshift(cur.name_en)
          cur = cur.parent_id ? catMap[cur.parent_id] : undefined!
        }
        return chain
      }

      const custPhones = (data.customers as unknown as { customer_phones?: { phone: string; is_primary: boolean }[] } | null)?.customer_phones ?? []
      const primaryPhone = custPhones.find((p) => p.is_primary)?.phone ?? custPhones[0]?.phone ?? null
      const so = {
        ...data,
        customer_name:  data.customers?.name  ?? null,
        customer_phone: primaryPhone,
      } as unknown as SaleOrder

      for (const li of so.sale_order_lines ?? []) {
        const cat = li.inventory_item_brand_variants?.inventory_items?.inventory_categories
        if (cat?.id) {
          cat.ancestor_chain = getAncestorChain(cat.id)
        }
      }

      const { data: sums } = await supabase
        .from('sale_order_lines_summary')
        .select('*')
        .eq('sale_order_id', id!)
      so.sale_order_lines_summary = (sums ?? []) as unknown as SaleOrderLineSummary[]

      return so
    },
    enabled: !!id,
  })
}

export function useSOPayments(soId: string | null) {
  return useQuery({
    queryKey: queryKeys.saleOrders.payments(soId),
    queryFn: async () => {
      const supabase = createClient()
      // After invoice generation, the `20260627105100` + `20260627106000`
      // migrations rehome every SO payment onto the AR invoice
      // (source_type='invoice', source_id=<invoice.id>) and a BEFORE-INSERT
      // trigger redirects new ones the same way. So payments live in one of
      // three shapes — query all of them so the SO Payments tab and the
      // Invoice tab agree:
      //   • source_type='sale_order', source_id=<so.id>           (pre-invoice)
      //   • source_type='invoice',    source_id=<invoice.id>      (post-invoice)
      //   • invoice_id=<invoice.id>                               (legacy invoice-tab path)
      const { data: invRow } = await supabase
        .from('so_invoices')
        .select('id')
        .eq('sale_order_id', soId!)
        .maybeSingle()
      const invoiceId = invRow?.id ?? null

      const orClause = invoiceId
        ? `and(source_type.eq.sale_order,source_id.eq.${soId}),and(source_type.eq.invoice,source_id.eq.${invoiceId}),invoice_id.eq.${invoiceId}`
        : `and(source_type.eq.sale_order,source_id.eq.${soId})`

      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .or(orClause)
        .is('deleted_at', null)
        .order('date', { ascending: false })
      if (error) return [] as SalePayment[]
      return data as SalePayment[]
    },
    enabled: !!soId,
    staleTime: 30 * 1000,
  })
}

export function useCreateSO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateSOPayload): Promise<CreateSOResult> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('create_sale_order', {
        p_customer_id:          payload.customer_id,
        p_intent:               payload.intent,
        p_currency:             payload.currency,
        p_exchange_rate:        payload.exchange_rate,
        // The nullable fields below are accepted by the DB function even though
        // the generated types declare them as non-nullable strings.
        p_expected_delivery:    (payload.expected_delivery ?? '') || null as unknown as string,
        p_payment_terms:        payload.payment_terms ?? '',
        p_payment_terms_notes:  payload.payment_terms_notes ?? '',
        p_payment_milestones:   payload.payment_milestones as unknown as string,
        p_delivery_terms:       payload.delivery_terms ?? '',
        p_delivery_terms_notes: payload.delivery_terms_notes ?? '',
        p_customer_notes:       payload.customer_notes ?? '',
        p_validity_days:        payload.validity_days,
        p_discount_amount:      payload.discount_amount,
        p_discount_label:       payload.discount_label ?? '',
        p_discount_type:        payload.discount_type,
        p_line_items:           payload.line_items as unknown as string,
        p_division_id:          payload.division_id ?? undefined,
      })
      if (error) throw error
      return data as CreateSOResult
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.saleOrders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsV2 })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.reservedOrderLines })
      logActivity({
        action:    `Sale Order ${data.status === 'pending_approval' ? 'Submitted for Approval' : data.status === 'confirmed' ? 'Confirmed' : 'Created'}`,
        module:    'sale_orders',
        entity_id: data.so_id,
        details:   `${data.so_number} · Total QAR ${data.open_total + 0}`,
        severity:  'info',
      })
    },
  })
}

export function useUpdateSO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, line_items, ...fields }: UpdateSOPayload & { line_items?: SOLineItemDraft[] }) => {
      const supabase = createClient()

      // If line_items are being edited, route through apply_sale_order_edit
      // RPC — it recomputes totals, rebalances stock reservations, re-runs the
      // credit + margin checks, and flips status to pending_approval + builds
      // a fresh approval chain when a threshold is crossed. Any existing
      // pending chain rows are marked superseded first (idempotent).
      let editResult: { status?: string; exceeds_credit?: boolean; has_below_cost?: boolean } | null = null
      if (line_items) {
        const fieldMap = fields as Record<string, unknown>
        const discountType   = (fieldMap.discount_type as string)   ?? 'fixed'
        const discountAmount = (fieldMap.discount_amount as number) ?? 0
        const discountLabel  = (fieldMap.discount_label as string | null | undefined) ?? null
        const { data, error: rpcErr } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)(
          'apply_sale_order_edit',
          {
            p_so_id:           id,
            p_line_items:      line_items.map(({ avg_cost: _, ...li }) => li) as unknown as string,
            p_discount_amount: discountAmount,
            p_discount_label:  discountLabel,
            p_discount_type:   discountType,
          }
        )
        if (rpcErr) throw rpcErr as Error
        editResult = (data ?? null) as typeof editResult
      }

      // Metadata-only fields (customer notes, validity_days, terms, expected
      // delivery) are safe as a direct UPDATE — none of them change credit
      // exposure or below-cost status.
      //
      // exchange_rate is intentionally stripped: rate is now only mutable via
      // rpc_update_document_initial_rate (see useChangeDocumentBookedRate).
      // total_qar is recomputed here because the SO's line-item subtotal may
      // have been updated by apply_sale_order_edit above.
      const {
        line_items: _lineItems,
        discount_amount: _da, discount_label: _dl, discount_type: _dt,
        subtotal: _sub, total: _tot,
        intent: _intent, customer_id: _cust,
        exchange_rate: _er,
        ...safeFields
      } = fields as Record<string, unknown>
      void _lineItems; void _da; void _dl; void _dt; void _sub; void _tot; void _intent; void _cust; void _er

      // If line-items were edited, recompute total_qar using the SO's stored
      // initial_exchange_rate (source of truth) × the new total.
      if (line_items) {
        const { data: soRow, error: soFetchErr } = await supabase
          .from('sale_orders')
          .select('initial_exchange_rate, total')
          .eq('id', id)
          .single()
        if (soFetchErr) throw soFetchErr
        const row = soRow as unknown as { initial_exchange_rate: number | null; total: number | null } | null
        const rate  = Number(row?.initial_exchange_rate ?? 1)
        const total = Number(row?.total ?? 0)
        ;(safeFields as Record<string, unknown>).total_qar = total * rate
      }

      if (Object.keys(safeFields).length > 0) {
        const { error: soErr } = await supabase
          .from('sale_orders')
          .update(safeFields as unknown as import('@/types/database.types').DBUpdate<'sale_orders'>)
          .eq('id', id)
        if (soErr) throw soErr
      }

      return editResult
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.saleOrders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.saleOrders.detail(variables.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsV2 })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.reservedOrderLines })
    },
  })
}

export function useConfirmSO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, lineItems }: { id: string; lineItems: SOLineItem[] }) => {
      const supabase = createClient()

      // 1. Update SO status
      const { error: soErr } = await supabase
        .from('sale_orders')
        .update({ status: 'confirmed' })
        .eq('id', id)
      if (soErr) throw soErr

      // 2. Reserve stock via RPC
      const reservations = lineItems
        .filter((l) => l.brand_variant_id && l.qty > 0)
        .map((l) => ({ bv_id: l.brand_variant_id, delta: l.qty }))
      if (reservations.length > 0) {
        const { error: resErr } = await supabase
          .rpc('batch_update_reserved_qty', { p_updates: reservations })
        if (resErr) throw resErr
      }

      // 3. Create stub delivery (warehouse_id nullable after migration)
      const { data: seqRow } = await supabase.rpc('next_delivery_number')
      const delivery_number = (seqRow as unknown as string) ?? `DEL-${Date.now()}`
      const { data: newDel, error: delErr } = await supabase.from('sale_deliveries').insert({
        delivery_number,
        sale_order_id: id,
        warehouse_id: null,
        date: new Date().toISOString().split('T')[0],
        status: 'pending',
      }).select('id').single()
      if (delErr) throw delErr
      if (newDel && lineItems.length > 0) {
        const { error: linesErr } = await supabase.from('sale_delivery_lines').insert(
          lineItems.map((l) => ({
            sale_delivery_id: newDel.id,
            brand_variant_id: l.brand_variant_id,
            item_name: l.item_name,
            sku: l.sku,
            qty_delivered: l.qty,
          }))
        )
        if (linesErr) throw linesErr
      }

      // 4. Create draft AR invoice via syncInvoiceToSalesOrder
      const { syncInvoiceToSalesOrder } = await import('@/lib/invoiceSync')
      await syncInvoiceToSalesOrder(id)
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.saleOrders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.saleOrders.detail(variables.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.saleDeliveries.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.customerInvoices.all })
    },
  })
}

export function useCreateSOPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payment: {
      so_id: string
      amount: number
      method: string
      date: string
      reference: string | null
      notes: string | null
      currency: string
      exchange_rate: number
    }) => {
      const supabase = createClient()
      const { data: cpayMax } = await supabase
        .from('payments')
        .select('payment_id')
        .ilike('payment_id', 'CPAY-%')
        .order('payment_id', { ascending: false })
        .limit(1)
        .maybeSingle()
      const cpayLast = cpayMax?.payment_id ? parseInt(cpayMax.payment_id.replace('CPAY-', ''), 10) : 0
      const payment_id = `CPAY-${String(cpayLast + 1).padStart(5, '0')}`

      // Overpayment guard
      const { data: soData } = await supabase
        .from('sale_orders')
        .select('total')
        .eq('id', payment.so_id)
        .single()

      const { data: existingPayments } = await supabase
        .from('payments')
        .select('amount_qar, amount')
        .or(`and(source_type.eq.sale_order,source_id.eq.${payment.so_id})`)
        .is('deleted_at', null)

      const totalPaid = (existingPayments ?? []).reduce(
        (s, p) => s + (p.amount_qar ?? p.amount ?? 0), 0
      )
      const outstanding = (soData?.total ?? 0) - totalPaid
      const paymentAmountQar = payment.amount * (payment.exchange_rate ?? 1)

      if (paymentAmountQar > outstanding + 0.01) {
        throw new Error(`Payment exceeds outstanding balance (QAR ${outstanding.toFixed(2)})`)
      }

      const { error } = await supabase.from('payments').insert({
        payment_id,
        source_type: 'sale_order',
        source_id: payment.so_id,
        supplier_id: null,
        direction: 'incoming',
        amount: payment.amount,
        method: payment.method,
        date: payment.date,
        reference: payment.reference,
        notes: payment.notes,
        currency: payment.currency,
        exchange_rate: payment.exchange_rate,
        amount_qar: payment.amount * payment.exchange_rate,
        status: 'pending',
      } as unknown as import('@/types/database.types').DBInsert<'payments'>)
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.saleOrders.payments(variables.so_id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.saleOrders.all })
      logActivity({
        action:    'Payment Recorded',
        module:    'sale_orders',
        entity_id: variables.so_id,
        details:   `QAR ${variables.amount.toLocaleString()} via ${variables.method}`,
        severity:  'info',
      })
    },
  })
}

export function useCreateDelivery() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      so_id: string
      warehouse_id: string
      warehouse_name: string
      date: string
      items: { item_name: string; sku: string | null; qty_delivered: number; brand_variant_id: string | null }[]
    }) => {
      const supabase = createClient()

      const { data, error } = await supabase
        .rpc('create_and_confirm_delivery', {
          p_so_id:          payload.so_id,
          p_warehouse_id:   payload.warehouse_id,
          p_warehouse_name: payload.warehouse_name,
          p_date:           payload.date,
          p_items:          payload.items,
        })
        .single()
      if (error) throw error

      if (!data) throw new Error('create_and_confirm_delivery returned no data')
      return data as { id: string; delivery_number: string }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.saleOrders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.saleOrders.detail(variables.so_id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.saleDeliveries.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsV2 })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.reservedOrderLines })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.fifoLayers })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.stockMovements })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.cogsEntries })
      queryClient.invalidateQueries({ queryKey: queryKeys.activityLog.all })
      logActivity({
        action:    'Delivery Created',
        module:    'sale_orders',
        entity_id: variables.so_id,
        details:   `${variables.items.length} item(s) · ${variables.warehouse_name} · auto-confirmed`,
        severity:  'info',
      })
    },
  })
}

export function useCancelSO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()

      // Fetch lines to release reserved stock before cancelling
      const { data: lines } = await supabase
        .from('sale_order_lines')
        .select('brand_variant_id, qty')
        .eq('sale_order_id', id)

      const releases = (lines ?? [])
        .filter((l) => l.brand_variant_id && l.qty > 0)
        .map((l) => ({ bv_id: l.brand_variant_id!, delta: -l.qty }))

      if (releases.length > 0) {
        const { error: relErr } = await supabase.rpc('batch_update_reserved_qty', { p_updates: releases })
        if (relErr) throw relErr
      }

      const { error } = await supabase
        .from('sale_orders')
        .update({ status: 'cancelled' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.saleOrders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.saleOrders.detail(id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsV2 })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.reservedOrderLines })
      logActivity({ action: 'Sale Order Cancelled', module: 'sale_orders', entity_id: id, severity: 'warning' })
    },
  })
}

export function useApproveSO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('sale_orders')
        .update({ status: 'confirmed' })
        .eq('id', id)
        .eq('status', 'pending_approval')
      if (error) throw error
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.saleOrders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.saleOrders.detail(id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsV2 })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.reservedOrderLines })
      logActivity({ action: 'Sale Order Approved', module: 'sale_orders', entity_id: id, severity: 'info' })
    },
  })
}

export function useResubmitSaleOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (soId: string) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('resubmit_sale_order', { p_so_id: soId })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.saleOrders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.sales })
    },
  })
}
