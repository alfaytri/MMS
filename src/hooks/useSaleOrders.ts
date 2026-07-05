import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/logActivity'
import { queryKeys } from '@/lib/queryKeys'

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
  tool_asset_item_id:  string | null
  avg_cost:            number
  created_at:          string
  inventory_brand_variants?: {
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

export type SaleDelivery = {
  id: string
  delivery_number: string
  sale_order_id: string
  warehouse_id: string
  warehouse_name: string | null
  date: string
  items: {
    item_name: string
    sku: string | null
    qty_delivered: number
    brand_variant_id: string | null
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

export type Customer = {
  id:                  string
  name:                string
  phone:               string | null
  email:               string | null
  customer_type:       string | null
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
  tool_asset_item_id: string | null
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
  divisionId?:  string | null
  divisionIds?: string[]
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
      let q = supabase
        .from('customers')
        .select('id, name, phone, email, customer_type, is_blocked, is_active, credit_group_id, credit_groups(name, credit_limit, default_payment_terms)')
        .eq('is_active', true)
        .order('name')
        .limit(50)
      if (search) {
        const safe = search.replace(/%/g, '\\%')
        q = q.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`)
      }
      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((row) => {
        const r = row as typeof row & { credit_groups?: { name?: string; credit_limit?: number; default_payment_terms?: string | null } | null }
        return {
          ...row,
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
      const from = page * CUSTOMERS_PAGE_SIZE
      const to   = from + CUSTOMERS_PAGE_SIZE - 1
      let q = supabase
        .from('customers')
        .select('id, name, phone, email, customer_type, entity_type, is_blocked, is_active, credit_group_id, cr_url, establishment_id_url, signed_credit_form_url, credit_groups(name, credit_limit)', { count: 'exact' })
        .order('name')
        .range(from, to)
      if (search) {
        const safe = search.replace(/%/g, '\\%')
        q = q.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`)
      }
      const { data, count, error } = await q
      if (error) throw error
      return {
        customers: (data ?? []).map((row) => {
          const r = row as typeof row & { credit_groups?: { name?: string; credit_limit?: number } | null }
          return {
            ...row,
            credit_group_name:  r.credit_groups?.name         ?? null,
            credit_group_limit: r.credit_groups?.credit_limit ?? null,
          }
        }) as Customer[],
        total: count ?? 0,
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
      phone: string
      email: string | null
      credit_group_id?: string | null
      customer_type?: 'cash' | 'credit'
      entity_type?: 'individual' | 'business'
      cr_url?: string | null
      establishment_id_url?: string | null
      signed_credit_form_url?: string | null
    }) => {
      const supabase = createClient()
      const now = new Date().toISOString()
      const row = {
        ...payload,
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
      return data
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
        phone?:                  string
        email?:                  string | null
        customer_type?:          'cash' | 'credit'
        entity_type?:            'individual' | 'business'
        credit_group_id?:        string | null
        cr_url?:                 string | null
        establishment_id_url?:   string | null
        signed_credit_form_url?: string | null
      }
      // Old values for audit diff; only fields present here are checked
      previous: {
        name?:                   string
        phone?:                  string | null
        email?:                  string | null
        customer_type?:          string | null
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

      // Stamp uploaded_at for any newly-uploaded doc (path changed AND non-null)
      const update: Record<string, any> = { ...args.patch }
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
        .update(update as any)
        .eq('id', args.id)
        .select('id, name')
      if (error) throw error
      if (!data || data.length === 0) throw new Error('Customer not found or update blocked')

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
      cmp('phone',                  args.previous.phone)
      cmp('email',                  args.previous.email)
      cmp('customer_type',          args.previous.customer_type)
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
        .select('*, sale_order_lines(*), sale_deliveries(*), customers!inner(name)')
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
      if (filters.divisionId) {
        q = q.eq('division_id', filters.divisionId)
      } else if (filters.divisionIds && filters.divisionIds.length > 0) {
        q = q.in('division_id', filters.divisionIds)
      }

      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((row) => {
        const r = row as typeof row & { customers?: { name?: string } | null }
        return {
          ...row,
          customer_name: r.customers?.name ?? null,
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
            inventory_brand_variants(
              brand,
              inventory_items(
                name_en,
                inventory_categories(id, name_en, parent_id, type)
              )
            )
          ),
          sale_deliveries(*),
          customers(name, phone, email)
        `)
        .eq('id', id!)
        .single()
      if (error) throw error

      const catIds = new Set<string>()
      for (const li of data.sale_order_lines ?? []) {
        const cat = (li as any).inventory_brand_variants?.inventory_items?.inventory_categories
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
            .filter((c: any) => c.parent_id && !catIds.has(c.parent_id))
            .map((c: any) => c.parent_id as string)
          if (grandparentIds.length > 0) {
            const { data: gps } = await supabase
              .from('inventory_categories')
              .select('id, name_en, parent_id')
              .in('id', grandparentIds)
            if (gps) cats.push(...gps)
          }
          catMap = Object.fromEntries(cats.map((c: any) => [c.id, { name_en: c.name_en, parent_id: c.parent_id }]))
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

      const so = {
        ...data,
        customer_name:  data.customers?.name  ?? null,
        customer_phone: data.customers?.phone ?? null,
      } as unknown as SaleOrder

      for (const li of so.sale_order_lines ?? []) {
        const cat = li.inventory_brand_variants?.inventory_items?.inventory_categories
        if (cat?.id) {
          (cat as any).ancestor_chain = getAncestorChain(cat.id)
        }
      }
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
        .from('invoices')
        .select('id')
        .eq('sale_order_id', soId!)
        .eq('direction', 'ar')
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
        // the stale generated types declare them as non-nullable strings.
        p_expected_delivery:    payload.expected_delivery ?? '',
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

      let extraFields: Record<string, unknown> = {}
      if (line_items) {
        const subtotal = calcSOSubtotal(line_items)
        const fieldMap = fields as Record<string, unknown>
        const discountType = (fieldMap.discount_type as string) ?? 'fixed'
        const discountAmount = (fieldMap.discount_amount as number) ?? 0
        const discountResolved = discountType === 'percentage'
          ? (subtotal * discountAmount) / 100
          : discountAmount
        extraFields = { subtotal, total: subtotal - discountResolved, discount_amount_resolved: discountResolved }
      }

      // fields is Partial<CreateSOPayload> which may contain intent/customer_id not in the
      // DB schema columns; the DB silently ignores unknown keys so this is safe.
      const updatePayload = { ...fields, ...extraFields }
      const { error: soErr } = await supabase
        .from('sale_orders')
        .update(updatePayload as unknown as import('@/types/database.types').DBUpdate<'sale_orders'>)
        .eq('id', id)
      if (soErr) throw soErr

      if (line_items) {
        await supabase.from('sale_order_lines').delete().eq('sale_order_id', id)
        if (line_items.length > 0) {
          const { error: liErr } = await supabase
            .from('sale_order_lines')
            .insert(line_items.map(({ avg_cost: _unused, ...li }) => ({ ...li, sale_order_id: id })))
          if (liErr) throw liErr
        }
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.saleOrders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.saleOrders.detail(variables.id) })
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
      const { error: delErr } = await supabase.from('sale_deliveries').insert({
        delivery_number,
        sale_order_id: id,
        warehouse_id: null,
        date: new Date().toISOString().split('T')[0],
        items: lineItems.map((l) => ({
          item_name: l.item_name,
          sku: l.sku,
          qty_delivered: l.qty,
          brand_variant_id: l.brand_variant_id,
        })),
        status: 'pending',
      })
      if (delErr) throw delErr

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
        (s: number, p: any) => s + (p.amount_qar ?? p.amount ?? 0), 0
      )
      const outstanding = (soData?.total ?? 0) - totalPaid
      const paymentAmountQar = payment.amount * (payment.exchange_rate ?? 1)

      if (paymentAmountQar > outstanding + 0.01) {
        throw new Error(`Payment exceeds outstanding balance (QAR ${outstanding.toFixed(2)})`)
      }

      // Cast needed: stale generated DB types for payments columns
      // don't match the current schema; the values are valid at runtime.
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
        .filter((l: any) => l.brand_variant_id && l.qty > 0)
        .map((l: any) => ({ bv_id: l.brand_variant_id, delta: -l.qty }))

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
