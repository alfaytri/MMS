import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { findApplicableTiers, validateRoles, buildApprovalSteps, getNotificationRecipients } from '@/lib/approvalChainResolution'
import type { ApprovalChainTier, ApprovalRoleAssignmentRow } from '@/lib/approvalChainResolution'
import { logPOActivity, resolveMyName } from '@/lib/poActivityLogger'
import { savePoSnapshot, stageOf, resolveLineItemNames } from '@/lib/poVersionHelper'
import { queryKeys } from '@/lib/queryKeys'

// ─── Types ────────────────────────────────────────────────────────────────────

export type InventoryLookupResult = {
  brand_variant_id: string
  item_name:        string
  item_name_ar:     string | null
  sku:              string | null
  unit:             string
  cost_price:       number
  selling_price:    number
  // Populated on fresh cascade selection; null when rebuilt from a saved PO row.
  category_name:    string | null
  category_name_ar: string | null
  brand:            string | null
}

export type POStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'partially_received'
  | 'received'
  | 'cancelled'
  | 'completed'

export type POType = 'rfq' | 'draft' | 'confirmed'

export type POLineItem = {
  id: string
  po_id: string
  item_name: string
  sku: string | null
  qty: number
  received_qty: number
  free_qty: number
  unit: string
  unit_price: number
  total_price: number
  fifo_layers: unknown
  brand_variant_id: string | null
  brand_id: string | null
  created_at: string
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

export type POApprovalStep = {
  id: string
  po_id: string
  role: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  approved_by: string | null
  date: string | null
  comment: string | null
  tier_rank: number
  is_active: boolean
  iteration: number
  force_approved: boolean
  force_comment: string | null
}

export type PurchaseOrder = {
  id: string
  po_number: string
  supplier_id: string
  supplier_name: string
  status: POStatus
  currency: string
  exchange_rate: number
  subtotal: number
  total_qar: number
  created_date: string
  expected_delivery: string | null
  quote_deadline: string | null
  approval_level: number
  payment_terms: string | null
  payment_terms_notes: string | null
  delivery_terms: string | null
  delivery_terms_notes: string | null
  vendor_notes: string | null
  discount_amount: number
  discount_label: string | null
  payment_milestones: { label: string; percent: number }[] | null
  division_id: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  version_number: number
  po_type: POType
  rfq_supplier_ids: string[] | null
  // joined
  po_line_items?: POLineItem[]
  po_approvals?: POApprovalStep[]
}

export type POPayment = {
  id: string
  amount: number
  method: string
  date: string
  reference: string | null
  notes: string | null
  source_type: string
  source_id: string
  supplier_id: string | null
  currency: string
  exchange_rate: number
  amount_qar: number | null
  created_at: string
}

export type POReceival = {
  id: string
  receival_number: string
  po_id: string
  warehouse_id: string
  received_by_name: string | null
  date: string
  status: string
  notes: string | null
  created_at: string
  // joined
  warehouse_name?: string | null
  receival_items?: {
    id: string
    item_name: string
    sku: string | null
    qty_received: number
    unit_cost: number
    is_free: boolean
    po_line_item_id: string | null
  }[]
}

export type POLineItemDraft = {
  item_name: string
  sku: string
  qty: number
  unit: string
  unit_price: number
  total_price: number
  brand_variant_id: string | null
  free_qty: number
  received_qty?: number
  brand_id?: string | null
}

export type CreatePOPayload = {
  supplier_id: string
  supplier_name: string
  currency: string
  exchange_rate: number
  expected_delivery: string | null
  quote_deadline?: string | null
  payment_terms: string | null
  payment_terms_notes: string | null
  payment_milestones: { label: string; percent: number }[] | null
  delivery_terms: string | null
  delivery_terms_notes: string | null
  vendor_notes: string | null
  discount_amount: number
  discount_label: string | null
  line_items: POLineItemDraft[]
  division_id: string | null
  po_type?: POType
  rfq_supplier_ids?: string[]
}

export type UpdatePOPayload = Partial<CreatePOPayload> & { id: string }

export type PoVersion = {
  id: string
  po_id: string
  version_number: number
  stage: 'rfq' | 'draft' | 'po'
  submitted_at: string
  submitted_by: string | null
  supplier_id: string
  supplier_name: string
  currency: string
  exchange_rate: number
  subtotal: number
  discount_amount: number
  discount_label: string | null
  payment_terms: string | null
  payment_terms_notes: string | null
  payment_milestones: { label: string; percent: number }[] | null
  delivery_terms: string | null
  delivery_terms_notes: string | null
  expected_delivery: string | null
  vendor_notes: string | null
  po_version_lines: POLineItemDraft[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Legacy helpers used by useCreatePO, useUpdatePO, useSubmitPoVersion, useSavePoAsDraft.
// Not exported — useSubmitPOForApproval now uses the chain-based resolution instead.
function calcApprovalLevel(totalQar: number): number {
  if (totalQar < 5000) return 1
  if (totalQar < 50000) return 2
  return 3
}

export type PaymentMethod = string

async function generatePONumber(supabase: ReturnType<typeof createClient>): Promise<string> {
  const { data, error } = await supabase.rpc('next_po_number')
  if (error || !data) throw new Error('Failed to generate PO number')
  return data as string
}

// ─── Filters type ─────────────────────────────────────────────────────────────

export interface POFilters {
  search?: string
  status?: POStatus | ''
  poType?: POType | ''
  dateFrom?: string
  dateTo?: string
  divisionId?: string | null
  divisionIds?: string[]
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function usePurchaseOrders(filters: POFilters = {}) {
  return useQuery({
    queryKey: queryKeys.purchaseOrders.list(filters),
    queryFn: async () => {
      const supabase = createClient()
      let query = supabase
        .from('purchase_orders')
        .select('*, po_approvals(*), po_line_items(*)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (filters.poType) query = query.eq('po_type', filters.poType)
      if (filters.status) query = query.eq('status', filters.status)
      if (filters.dateFrom) query = query.gte('created_date', filters.dateFrom)
      if (filters.dateTo) query = query.lte('created_date', filters.dateTo)
      if (filters.search) {
        const safe = filters.search.replace(/%/g, '\\%')
        query = query.or(`po_number.ilike.%${safe}%,supplier_name.ilike.%${safe}%`)
      }
      if (filters.divisionId) {
        query = query.eq('division_id', filters.divisionId)
      } else if (filters.divisionIds && filters.divisionIds.length > 0) {
        query = query.in('division_id', filters.divisionIds)
      }

      const { data, error } = await query.limit(50)
      if (error) throw error
      return data as PurchaseOrder[]
    },
    staleTime: 30 * 1000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })
}

export function usePurchaseOrder(id: string | null) {
  return useQuery({
    queryKey: queryKeys.purchaseOrders.detail(id),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          po_line_items(
            *,
            inventory_brand_variants(
              brand,
              inventory_items(
                name_en,
                inventory_categories(id, name_en, parent_id, type)
              )
            )
          ),
          po_approvals(*)
        `)
        .eq('id', id!)
        .single()
      if (error) throw error

      const catIds = new Set<string>()
      for (const li of data.po_line_items ?? []) {
        const cat = li.inventory_brand_variants?.inventory_items?.inventory_categories
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

      const po = data as PurchaseOrder
      for (const li of po.po_line_items ?? []) {
        const cat = li.inventory_brand_variants?.inventory_items?.inventory_categories
        if (cat?.id) {
          ;(cat as typeof cat & { ancestor_chain: string[] }).ancestor_chain = getAncestorChain(cat.id)
        }
      }
      return po
    },
    enabled: !!id,
  })
}

export function usePOPayments(poId: string | null) {
  return useQuery({
    queryKey: queryKeys.purchaseOrders.payments(poId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('payments')
        .select('id, date, amount, amount_qar, method, reference, status, currency, exchange_rate, source_type, source_id, supplier_id, direction, notes, deleted_at, created_at')
        .eq('source_type', 'purchase_order')
        .eq('source_id', poId!)
        .is('deleted_at', null)
        .order('date', { ascending: false })
        .limit(200)
      if (error) return [] as POPayment[] // columns may not exist until migration 20260422000002 is applied
      return data as POPayment[]
    },
    enabled: !!poId,
    staleTime: 30 * 1000,
  })
}

export function usePOReceivalsByPO(poId: string | null) {
  return useQuery({
    queryKey: queryKeys.purchaseOrders.receivals(poId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('receivals')
        .select('*, receival_items(*), warehouses(name)')
        .eq('po_id', poId!)
        .order('date', { ascending: false })
      if (error) throw error
      return (data ?? []).map((r) => {
        const rExt = r as typeof r & { warehouses?: { name?: string } | null }
        return {
          ...r,
          warehouse_name: rExt.warehouses?.name ?? null,
        }
      }) as POReceival[]
    },
    enabled: !!poId,
    staleTime: 30 * 1000,
  })
}

export function useCreatePO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreatePOPayload) => {
      const supabase = createClient()
      const po_number = await generatePONumber(supabase)

      const { data: { user } } = await supabase.auth.getUser()

      // purchase_orders.created_by has a FK to profiles(id), which is a different UUID
      // namespace than auth.users(id). Resolve the profile row before inserting.
      let creatorProfileId: string | null = null
      if (user) {
        const { data: profile } = await supabase
          .from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
        creatorProfileId = profile?.id ?? null
      }

      const subtotal = payload.line_items.reduce((s, li) => s + li.total_price, 0)
      const total_qar = (subtotal - payload.discount_amount) * payload.exchange_rate
      const approval_level = calcApprovalLevel(total_qar)

      const { data: po, error: poErr } = await supabase
        .from('purchase_orders')
        .insert({
          po_number,
          supplier_id: payload.supplier_id,
          supplier_name: payload.supplier_name,
          status: 'draft',
          currency: payload.currency,
          exchange_rate: payload.exchange_rate,
          subtotal,
          total_qar,
          approval_level,
          created_date: new Date().toISOString().split('T')[0],
          expected_delivery: payload.expected_delivery,
          quote_deadline: payload.quote_deadline ?? null,
          payment_terms: payload.payment_terms,
          payment_terms_notes: payload.payment_terms_notes,
          payment_milestones: payload.payment_milestones ?? null,
          delivery_terms: payload.delivery_terms,
          delivery_terms_notes: payload.delivery_terms_notes,
          vendor_notes: payload.vendor_notes,
          discount_amount: payload.discount_amount,
          discount_label: payload.discount_label,
          created_by: creatorProfileId,
          division_id: payload.division_id ?? null,
          po_type: payload.po_type ?? 'draft',
          rfq_supplier_ids: payload.rfq_supplier_ids ?? [],
        })
        .select()
        .single()
      if (poErr) throw poErr

      if (payload.line_items.length > 0) {
        const resolved = await resolveLineItemNames(supabase, payload.line_items)
        const { error: liErr } = await supabase
          .from('po_line_items')
          .insert(resolved.map((li) => ({ ...li, po_id: po.id })))
        if (liErr) throw liErr
      }

      if (payload.po_type === 'rfq' && payload.rfq_supplier_ids?.length) {
        const quoteRows = payload.rfq_supplier_ids.map((sid) => ({
          po_id: po.id,
          supplier_id: sid,
          currency: payload.currency,
          status: 'pending',
        }))
        const { error: quoteErr } = await supabase
          .from('po_rfq_quotes')
          .insert(quoteRows)
        if (quoteErr) throw quoteErr
      }

      const performerName = await resolveMyName()
      await logPOActivity({
        poId: po.id,
        action: 'PO Created',
        details: `Supplier: ${payload.supplier_name} · ${payload.line_items.length} line item(s) · Total: ${total_qar.toLocaleString()} QAR`,
        performerName,
      })

      // Snapshot the just-created PO.
      // stageOf maps: rfq→'rfq', draft→'draft', confirmed→'po'.
      await savePoSnapshot(supabase, po.id, stageOf(payload.po_type ?? 'draft'))

      return po as PurchaseOrder
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all })
    },
  })
}

export function useSoftDeletePO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('purchase_orders')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all })
    },
  })
}

export function useUpdatePO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, line_items, ...fields }: UpdatePOPayload & { line_items?: POLineItemDraft[] }) => {
      const supabase = createClient()

      // Recalculate totals if line items provided
      let extraFields: Record<string, unknown> = {}
      if (line_items) {
        const subtotal = line_items.reduce((s, li) => s + li.total_price, 0)
        const fieldMap = fields as Record<string, unknown>
        const discount = (fieldMap.discount_amount as number) ?? 0
        const rate = (fieldMap.exchange_rate as number) ?? 1
        const total_qar = (subtotal - discount) * rate
        extraFields = { subtotal, total_qar, approval_level: calcApprovalLevel(total_qar) }
      }

      const { error: poErr } = await supabase
        .from('purchase_orders')
        .update({ ...fields, ...extraFields })
        .eq('id', id)
      if (poErr) throw poErr

      if (line_items) {
        await supabase.from('po_line_items').delete().eq('po_id', id)
        if (line_items.length > 0) {
          const resolved = await resolveLineItemNames(supabase, line_items)
          const { error: liErr } = await supabase
            .from('po_line_items')
            .insert(resolved.map((li) => ({ ...li, po_id: id })))
          if (liErr) throw liErr
        }
      }

      // Snapshot this revision. Each save creates a new version of the current
      // stage (rfq → rfq-v(n+1), draft → draft-v(n+1)). Lookup is cheap (PK).
      const { data: poForStage } = await supabase
        .from('purchase_orders')
        .select('po_type')
        .eq('id', id)
        .single()
      if (poForStage?.po_type) {
        await savePoSnapshot(supabase, id, stageOf(poForStage.po_type as POType))
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(variables.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.versions(variables.id) })
    },
  })
}

export function useSubmitPOForApproval() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Get current user's profile
      const { data: myProfile } = await supabase
        .from('profiles').select('id').eq('auth_user_id', user.id).single()
      if (!myProfile) throw new Error('Profile not found')

      // Get PO details
      const { data: po } = await supabase
        .from('purchase_orders').select('id, total_qar, po_number, division_id').eq('id', id).single()
      if (!po) throw new Error('PO not found')

      // Find chain (PO's division → company default)
      let chain: { id: string; approval_chain_tiers: Record<string, unknown>[] } | null = null
      if (po.division_id) {
        const { data } = await supabase
          .from('po_approval_chains')
          .select('id, approval_chain_tiers:po_approval_chain_tiers(*)')
          .eq('division_id', po.division_id)
          .eq('is_active', true)
          .maybeSingle()
        chain = data
      }
      if (!chain) {
        const { data } = await supabase
          .from('po_approval_chains')
          .select('id, approval_chain_tiers:po_approval_chain_tiers(*)')
          .is('division_id', null)
          .eq('is_active', true)
          .maybeSingle()
        chain = data
      }
      if (!chain) throw new Error('No approval chain configured. Contact your administrator.')

      // Find applicable tiers
      const tiers = findApplicableTiers(po.total_qar ?? 0, (chain.approval_chain_tiers ?? []) as unknown as ApprovalChainTier[])
      if (tiers.length === 0) throw new Error('No approval tiers match this PO amount. Check approval chain configuration.')

      // Fetch role assignments for this division (including company-wide).
      // Source: user_custom_roles + custom_roles (filtered to approval-slot roles).
      // We re-shape the rows into ApprovalRoleAssignmentRow so validateRoles / getNotificationRecipients
      // (which only read role + profile_id + division_id + deleted_at) keep working unchanged.
      // NOTE: user_custom_roles has no division_id today — division scoping for approval
      // slots is not modeled in the new schema, so we treat every approval-slot assignment
      // as company-wide (division_id = null). This matches the .or() clause below which
      // also accepts company-wide rows.
      const { data: rawAssignments } = await supabase
        .from('user_custom_roles')
        .select('id, profile_id, created_at, custom_roles!inner(name, is_approval_slot, deleted_at)')
        .eq('custom_roles.is_approval_slot', true)
        .is('custom_roles.deleted_at', null)
      const roleAssignments = (rawAssignments ?? [])
        .map((r: { id: string; profile_id: string; created_at: string; custom_roles: { name: string; deleted_at: string | null } | null }) => ({
          id: r.id,
          profile_id: r.profile_id,
          role: r.custom_roles?.name ?? '',
          division_id: null as string | null,
          created_at: r.created_at,
          deleted_at: r.custom_roles?.deleted_at ?? null,
        }))
        .filter((a) => !!a.role) as ApprovalRoleAssignmentRow[]

      const validationError = validateRoles(tiers, roleAssignments)
      if (validationError) throw new Error(validationError)

      // Determine iteration
      const { data: existingSteps, error: iterErr } = await supabase
        .from('po_approvals').select('iteration').eq('po_id', id).order('iteration', { ascending: false }).limit(1)
      if (iterErr) throw iterErr
      const iteration = existingSteps?.[0]?.iteration ? existingSteps[0].iteration + 1 : 1

      // Create approval steps
      const steps = buildApprovalSteps(id, tiers, iteration)
      const { error: stepsErr } = await supabase.from('po_approvals').insert(steps)
      if (stepsErr) throw stepsErr

      // Update PO status and promote to confirmed type
      const { error: poErr } = await supabase
        .from('purchase_orders').update({ status: 'pending_approval', po_type: 'confirmed' }).eq('id', id)
      if (poErr) throw poErr

      // Submission is the moment a PO is "born" — this becomes po-v1
      // (or po-v(n+1) on resubmit after a rejection).
      await savePoSnapshot(supabase, id, 'po')

      const submitPerformer = await resolveMyName()
      await logPOActivity({
        poId: id,
        action: 'Submitted for Approval',
        details: `${tiers.length} approval tier(s)`,
        performerName: submitPerformer,
      })

      // Fire notifications to all approvers (parallel approval)
      const recipientIds = getNotificationRecipients(tiers, roleAssignments)
      if (recipientIds.length > 0) {
        const notifs = recipientIds.map((profileId: string) => ({
          profile_id: profileId,
          type: 'po_approval_requested',
          title: `PO ${po.po_number ?? id} requires your approval`,
          body: `Total: ${po.total_qar} QAR`,
          related_id: id,
          related_type: 'purchase_order',
        }))
        await supabase.from('notifications').insert(notifs)
      }
    },
    onSuccess: (_data: unknown, variables: { id: string }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(variables.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.poApprovals })
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all })
    },
  })
}

export function useCreatePOPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payment: {
      po_id: string
      supplier_id: string
      amount: number
      method: PaymentMethod
      date: string
      reference: string | null
      notes: string | null
      currency: string
      exchange_rate: number
    }) => {
      const supabase = createClient()

      const { data: spayMax } = await supabase
        .from('payments')
        .select('payment_id')
        .ilike('payment_id', 'SPAY-%')
        .order('payment_id', { ascending: false })
        .limit(1)
        .maybeSingle()
      const spayLast = spayMax?.payment_id ? parseInt(spayMax.payment_id.replace('SPAY-', ''), 10) : 0
      const payment_id = `SPAY-${String(spayLast + 1).padStart(5, '0')}`

      // Overpayment guard
      const { data: poData } = await supabase
        .from('purchase_orders')
        .select('total_qar')
        .eq('id', payment.po_id)
        .single()

      const { data: existingPayments } = await supabase
        .from('payments')
        .select('amount_qar, amount')
        .eq('source_type', 'purchase_order')
        .eq('source_id', payment.po_id)
        .is('deleted_at', null)

      const totalPaidQar = (existingPayments ?? []).reduce(
        (s, p) => s + (p.amount_qar ?? p.amount ?? 0), 0 as number
      )
      const outstandingQar = (poData?.total_qar ?? 0) - totalPaidQar
      const paymentAmountQar = payment.amount * (payment.exchange_rate ?? 1)

      if (paymentAmountQar > outstandingQar + 0.01) {
        throw new Error(`Payment exceeds outstanding balance (QAR ${outstandingQar.toFixed(2)})`)
      }

      const { error } = await supabase.from('payments').insert({
        payment_id,
        source_type: 'purchase_order',
        source_id: payment.po_id,
        supplier_id: payment.supplier_id,
        amount: payment.amount,
        method: payment.method, // DB enum — stale generated types may flag this
        date: payment.date,
        reference: payment.reference,
        notes: payment.notes,
        currency: payment.currency,
        exchange_rate: payment.exchange_rate,
        amount_qar: payment.amount * payment.exchange_rate,
        direction: 'outgoing',
        status: 'pending',
      } as unknown as import('@/types/database.types').DBInsert<'payments'>)
      if (error) throw error

      await supabase.rpc('refresh_po_status', { p_po_id: payment.po_id })

      const payPerformer = await resolveMyName()
      await logPOActivity({
        poId: payment.po_id,
        action: 'Payment Recorded',
        details: `${payment.amount.toLocaleString()} ${payment.currency} via ${payment.method}${payment.reference ? ` · Ref: ${payment.reference}` : ''}`,
        performerName: payPerformer,
      })
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.payments(variables.po_id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all })
    },
  })
}

export function useSubmitPO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('purchase_orders')
        .update({ status: 'pending_approval' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(id) })
    },
  })
}

export function useCancelPO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('purchase_orders')
        .update({ status: 'cancelled' })
        .eq('id', id)
      if (error) throw error

      const cancelPerformer = await resolveMyName()
      await logPOActivity({ poId: id, action: 'PO Cancelled', performerName: cancelPerformer, severity: 'warning' })
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(id) })
    },
  })
}

// Owner-initiated rollback of a pending_approval PO back to draft. Cleans up
// the in-flight approval chain so it's no longer waiting on approvers, and
// also dismisses any unread po_approval_requested notifications so the
// approvers' bell doesn't keep nagging them about a PO that's been recalled.
export function useRecallPOToDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()

      // 1. Update status + po_type back to draft
      const { error: poErr } = await supabase
        .from('purchase_orders')
        .update({ status: 'draft', po_type: 'draft' })
        .eq('id', id)
      if (poErr) throw poErr

      // 2. Clear pending approval steps for this PO. Past iterations (already
      //    approved or rejected) stay for audit; only the active pending row(s)
      //    in the current iteration are deleted so a clean iteration starts on
      //    next submission.
      const { error: stepsErr } = await supabase
        .from('po_approvals')
        .delete()
        .eq('po_id', id)
        .eq('status', 'pending')
      if (stepsErr) throw stepsErr

      // 3. Mark any unread po_approval_requested notifications for this PO as read
      await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('related_id', id)
        .eq('type', 'po_approval_requested')
        .is('read_at', null)

      const recallPerformer = await resolveMyName()
      await logPOActivity({
        poId: id,
        action: 'PO Recalled to Draft',
        details: 'Pending approval cancelled by Owner',
        performerName: recallPerformer,
        severity: 'warning',
      })
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.poApprovals })
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all })
    },
  })
}

export function useDeletePoVersion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ versionId, poId: _poId }: { versionId: string; poId: string }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('po_versions')
        .delete()
        .eq('id', versionId)
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.versions(variables.poId) })
    },
  })
}

export function usePoVersions(poId: string | null) {
  return useQuery({
    queryKey: queryKeys.purchaseOrders.versions(poId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('po_versions')
        .select('*, po_version_lines(*)')
        .eq('po_id', poId!)
        .order('version_number', { ascending: true })
        .limit(100)
      if (error) throw error
      return (data ?? []) as unknown as PoVersion[]
    },
    enabled: !!poId,
    staleTime: 30 * 1000,
  })
}

export function useSubmitPoVersion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      currentVersionNumber,
      currentSnapshot: _currentSnapshot,
      payload,
    }: {
      id: string
      currentVersionNumber: number
      currentSnapshot: Omit<PoVersion, 'id' | 'po_id' | 'submitted_at' | 'submitted_by'>
      payload: CreatePOPayload
    }) => {
      const supabase = createClient()

      // 1. Snapshot current (pre-amend) PO state. This is the amend flow used
      //    by useSubmitPoVersion for post-approval edits — the live PO is
      //    po_type='confirmed', so we snapshot it as the next 'po' version.
      //    savePoSnapshot computes the per-stage version_number automatically.
      await savePoSnapshot(supabase, id, 'po')

      // 2. Recalculate totals
      const subtotal = payload.line_items.reduce((s, li) => s + li.total_price, 0)
      const total_qar = (subtotal - payload.discount_amount) * payload.exchange_rate
      const approval_level = calcApprovalLevel(total_qar)
      const newVersion = currentVersionNumber + 1

      // 3. Update main PO record + increment version
      const { error: poErr } = await supabase
        .from('purchase_orders')
        .update({
          supplier_id: payload.supplier_id,
          supplier_name: payload.supplier_name,
          currency: payload.currency,
          exchange_rate: payload.exchange_rate,
          subtotal,
          total_qar,
          approval_level,
          version_number: newVersion,
          status: 'pending_approval',
          expected_delivery: payload.expected_delivery,
          quote_deadline: payload.quote_deadline ?? null,
          payment_terms: payload.payment_terms,
          payment_terms_notes: payload.payment_terms_notes,
          payment_milestones: payload.payment_milestones ?? null,
          delivery_terms: payload.delivery_terms,
          delivery_terms_notes: payload.delivery_terms_notes,
          vendor_notes: payload.vendor_notes,
          discount_amount: payload.discount_amount,
          discount_label: payload.discount_label,
        })
        .eq('id', id)
      if (poErr) throw poErr

      // 4. Replace line items
      await supabase.from('po_line_items').delete().eq('po_id', id)
      if (payload.line_items.length > 0) {
        const { error: liErr } = await supabase
          .from('po_line_items')
          .insert(payload.line_items.map((li) => ({ ...li, po_id: id })))
        if (liErr) throw liErr
      }

      // 5. Reset approvals — delete old, insert chain-based fresh steps
      await supabase.from('po_approvals').delete().eq('po_id', id)

      // Resolve chain for the PO's division
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: myProfile } = await supabase
        .from('profiles').select('id').eq('auth_user_id', user.id).single()
      if (!myProfile) throw new Error('Profile not found')

      const divisionId: string | null = payload.division_id ?? null

      let chain: { id: string; approval_chain_tiers: Record<string, unknown>[] } | null = null
      if (divisionId) {
        const { data } = await supabase
          .from('po_approval_chains')
          .select('id, approval_chain_tiers:po_approval_chain_tiers(*)')
          .eq('division_id', divisionId)
          .eq('is_active', true)
          .maybeSingle()
        chain = data
      }
      if (!chain) {
        const { data } = await supabase
          .from('po_approval_chains')
          .select('id, approval_chain_tiers:po_approval_chain_tiers(*)')
          .is('division_id', null)
          .eq('is_active', true)
          .maybeSingle()
        chain = data
      }
      if (!chain) throw new Error('No approval chain configured. Contact your administrator.')

      const tiers = findApplicableTiers(total_qar, (chain.approval_chain_tiers ?? []) as unknown as ApprovalChainTier[])
      if (tiers.length === 0) throw new Error('No approval tiers match this PO amount. Check approval chain configuration.')

      // See useSubmitPOForApproval above for the schema/shape rationale.
      const { data: rawAssignments } = await supabase
        .from('user_custom_roles')
        .select('id, profile_id, created_at, custom_roles!inner(name, is_approval_slot, deleted_at)')
        .eq('custom_roles.is_approval_slot', true)
        .is('custom_roles.deleted_at', null)
      const roleAssignments = (rawAssignments ?? [])
        .map((r: { id: string; profile_id: string; created_at: string; custom_roles: { name: string; deleted_at: string | null } | null }) => ({
          id: r.id,
          profile_id: r.profile_id,
          role: r.custom_roles?.name ?? '',
          division_id: null as string | null,
          created_at: r.created_at,
          deleted_at: r.custom_roles?.deleted_at ?? null,
        }))
        .filter((a) => !!a.role) as ApprovalRoleAssignmentRow[]

      const validationError = validateRoles(tiers, roleAssignments)
      if (validationError) throw new Error(validationError)

      // Determine iteration number
      const { data: existingSteps, error: iterErr } = await supabase
        .from('po_approvals').select('iteration').eq('po_id', id).order('iteration', { ascending: false }).limit(1)
      if (iterErr) throw iterErr
      const iteration = existingSteps?.[0]?.iteration ? existingSteps[0].iteration + 1 : 1

      const steps = buildApprovalSteps(id, tiers, iteration)
      const { error: approvalErr } = await supabase.from('po_approvals').insert(steps)
      if (approvalErr) throw approvalErr

      // Fire notifications to all approvers (parallel approval)
      const recipientIds = getNotificationRecipients(tiers, roleAssignments)
      if (recipientIds.length > 0) {
        const { data: poData } = await supabase
          .from('purchase_orders').select('po_number').eq('id', id).single()
        const notifs = recipientIds.map((profileId: string) => ({
          profile_id: profileId,
          type: 'po_approval_requested',
          title: `PO ${poData?.po_number ?? id} requires your approval`,
          body: `Total: ${total_qar} QAR`,
          related_id: id,
          related_type: 'purchase_order',
        }))
        await supabase.from('notifications').insert(notifs)
      }

      const versionPerformer = myProfile
        ? ((await supabase.from('profiles').select('full_name').eq('id', myProfile.id).maybeSingle())?.data?.full_name ?? null)
        : null
      await logPOActivity({
        poId: id,
        action: `PO Amended — Version ${newVersion}`,
        details: `${payload.line_items.length} line item(s) · New total: ${total_qar.toLocaleString()} QAR`,
        performerName: versionPerformer,
      })

      // Phase D: consume any approved-unused edit-request for this PO.
      // Best-effort; the amend itself has already succeeded so we swallow
      // any failure (e.g. RLS rejection if the caller isn't an approver).
      try {
        await supabase
          .from('po_edit_requests')
          .update({ status: 'used', used_at: new Date().toISOString() })
          .eq('po_id', id)
          .eq('status', 'approved')
      } catch {
        // non-blocking
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(variables.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.versions(variables.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.poEditRequests.byPo(variables.id) })
    },
  })
}

export function useSavePoAsDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: CreatePOPayload }) => {
      const supabase = createClient()

      const subtotal = payload.line_items.reduce((s, li) => s + li.total_price, 0)
      const total_qar = (subtotal - payload.discount_amount) * payload.exchange_rate
      const approval_level = calcApprovalLevel(total_qar)

      const { error: poErr } = await supabase
        .from('purchase_orders')
        .update({
          supplier_id: payload.supplier_id,
          supplier_name: payload.supplier_name,
          currency: payload.currency,
          exchange_rate: payload.exchange_rate,
          subtotal,
          total_qar,
          approval_level,
          expected_delivery: payload.expected_delivery,
          quote_deadline: payload.quote_deadline ?? null,
          payment_terms: payload.payment_terms,
          payment_terms_notes: payload.payment_terms_notes,
          payment_milestones: payload.payment_milestones ?? null,
          delivery_terms: payload.delivery_terms,
          delivery_terms_notes: payload.delivery_terms_notes,
          vendor_notes: payload.vendor_notes,
          discount_amount: payload.discount_amount,
          discount_label: payload.discount_label,
        })
        .eq('id', id)
      if (poErr) throw poErr

      await supabase.from('po_line_items').delete().eq('po_id', id)
      if (payload.line_items.length > 0) {
        const resolved = await resolveLineItemNames(supabase, payload.line_items)
        const { error: liErr } = await supabase
          .from('po_line_items')
          .insert(resolved.map((li) => ({ ...li, po_id: id })))
        if (liErr) throw liErr
      }

      const draftPerformer = await resolveMyName()
      await logPOActivity({
        poId: id,
        action: 'Draft Saved',
        details: `${payload.line_items.length} line item(s) · Supplier: ${payload.supplier_name}`,
        performerName: draftPerformer,
      })

      // Snapshot this revision under the current stage. For Save-as-Draft this
      // is almost always 'draft' (or 'rfq' for an RFQ being saved as a draft
      // before submission). Per-stage version_number is computed inside the
      // helper.
      const { data: poForStage } = await supabase
        .from('purchase_orders')
        .select('po_type')
        .eq('id', id)
        .single()
      if (poForStage?.po_type) {
        await savePoSnapshot(supabase, id, stageOf(poForStage.po_type as POType))
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(variables.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.versions(variables.id) })
    },
  })
}
