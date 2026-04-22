import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { findApplicableTiers, validateRoles, buildApprovalSteps, getNotificationRecipients } from '@/lib/approvalChainResolution'

// ─── Types ────────────────────────────────────────────────────────────────────

export type POStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'partially_received'
  | 'received'
  | 'cancelled'

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
  tool_asset_item_id: string | null
  brand_id: string | null
  created_at: string
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
  approval_level: number
  payment_terms: string | null
  payment_terms_notes: string | null
  delivery_terms: string | null
  delivery_terms_notes: string | null
  vendor_notes: string | null
  discount_amount: number
  discount_label: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  version_number: number
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
  receival_items?: {
    id: string
    item_name: string
    sku: string | null
    qty_received: number
    unit_cost: number
    is_free: boolean
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
  tool_asset_item_id: string | null
  free_qty: number
}

export type CreatePOPayload = {
  supplier_id: string
  supplier_name: string
  currency: string
  exchange_rate: number
  expected_delivery: string | null
  payment_terms: string | null
  payment_terms_notes: string | null
  payment_milestones: { label: string; percent: number }[] | null
  delivery_terms: string | null
  delivery_terms_notes: string | null
  vendor_notes: string | null
  discount_amount: number
  discount_label: string | null
  line_items: POLineItemDraft[]
}

export type UpdatePOPayload = Partial<CreatePOPayload> & { id: string }

export type PoVersion = {
  id: string
  po_id: string
  version_number: number
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
  line_items: POLineItemDraft[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Legacy helpers used by useCreatePO, useUpdatePO, useSubmitPoVersion, useSavePoAsDraft.
// Not exported — useSubmitPOForApproval now uses the chain-based resolution instead.
function calcApprovalLevel(totalQar: number): number {
  if (totalQar < 5000) return 1
  if (totalQar < 50000) return 2
  return 3
}

function getApprovalRoles(level: number): string[] {
  if (level === 1) return ['purchase_manager']
  if (level === 2) return ['purchase_manager', 'accountant']
  return ['purchase_manager', 'accountant', 'owner']
}

export const PAYMENT_METHODS = [
  'cash', 'bank_transfer', 'cheque', 'credit_card', 'debit_card', 'online', 'other',
] as const
export type PaymentMethod = typeof PAYMENT_METHODS[number]

// NOTE: count+1 approach is race-prone under concurrent creates.
// The DB has a UNIQUE constraint on po_number, so concurrent collisions
// will produce a DB error rather than a silent duplicate.
// TODO: replace with a server-side DB sequence when types are regenerated.
async function generatePONumber(supabase: ReturnType<typeof createClient>): Promise<string> {
  const { count } = await (supabase as any)
    .from('purchase_orders')
    .select('*', { count: 'exact', head: true })
  const seq = String((count ?? 0) + 1).padStart(5, '0')
  return `PO-${seq}`
}

// ─── Filters type ─────────────────────────────────────────────────────────────

export interface POFilters {
  search?: string
  status?: POStatus | ''
  dateFrom?: string
  dateTo?: string
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function usePurchaseOrders(filters: POFilters = {}) {
  return useQuery({
    queryKey: ['purchase-orders', filters],
    queryFn: async () => {
      const supabase = createClient()
      let query = (supabase as any)
        .from('purchase_orders')
        .select('*, po_approvals(*)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (filters.status) query = query.eq('status', filters.status)
      if (filters.dateFrom) query = query.gte('created_date', filters.dateFrom)
      if (filters.dateTo) query = query.lte('created_date', filters.dateTo)
      if (filters.search) {
        const safe = filters.search.replace(/%/g, '\\%')
        query = query.or(`po_number.ilike.%${safe}%,supplier_name.ilike.%${safe}%`)
      }

      const { data, error } = await query
      if (error) throw error
      return data as PurchaseOrder[]
    },
    staleTime: 30 * 1000,
  })
}

export function usePurchaseOrder(id: string | null) {
  return useQuery({
    queryKey: ['purchase-order', id],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('purchase_orders')
        .select('*, po_line_items(*), po_approvals(*)')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as PurchaseOrder
    },
    enabled: !!id,
  })
}

export function usePOPayments(poId: string | null) {
  return useQuery({
    queryKey: ['po-payments', poId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('payments')
        .select('*')
        .eq('source_type', 'purchase_order')
        .eq('source_id', poId!)
        .is('deleted_at', null)
        .order('date', { ascending: false })
      if (error) throw error
      return data as POPayment[]
    },
    enabled: !!poId,
    staleTime: 30 * 1000,
  })
}

export function usePOReceivalsByPO(poId: string | null) {
  return useQuery({
    queryKey: ['po-receivals', poId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('receivals')
        .select('*, receival_items(*)')
        .eq('po_id', poId!)
        .order('date', { ascending: false })
      if (error) throw error
      return data as POReceival[]
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

      // Resolve creator's profile UUID (used for self-approval guard)
      const { data: { user } } = await supabase.auth.getUser()
      const { data: creatorProfile } = user
        ? await (supabase as any).from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
        : { data: null }

      const subtotal = payload.line_items.reduce((s, li) => s + li.total_price, 0)
      const total_qar = (subtotal - payload.discount_amount) * payload.exchange_rate
      const approval_level = calcApprovalLevel(total_qar)

      const { data: po, error: poErr } = await (supabase as any)
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
          payment_terms: payload.payment_terms,
          payment_terms_notes: payload.payment_terms_notes,
          payment_milestones: payload.payment_milestones ?? null,
          delivery_terms: payload.delivery_terms,
          delivery_terms_notes: payload.delivery_terms_notes,
          vendor_notes: payload.vendor_notes,
          discount_amount: payload.discount_amount,
          discount_label: payload.discount_label,
          created_by: creatorProfile?.id ?? null,
        })
        .select()
        .single()
      if (poErr) throw poErr

      if (payload.line_items.length > 0) {
        const { error: liErr } = await (supabase as any)
          .from('po_line_items')
          .insert(payload.line_items.map((li) => ({ ...li, po_id: po.id })))
        if (liErr) throw liErr
      }

      return po as PurchaseOrder
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
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
        const discount = (fields as any).discount_amount ?? 0
        const rate = (fields as any).exchange_rate ?? 1
        const total_qar = (subtotal - discount) * rate
        extraFields = { subtotal, total_qar, approval_level: calcApprovalLevel(total_qar) }
      }

      const { error: poErr } = await (supabase as any)
        .from('purchase_orders')
        .update({ ...fields, ...extraFields })
        .eq('id', id)
      if (poErr) throw poErr

      if (line_items) {
        // Delete existing line items and re-insert
        await (supabase as any).from('po_line_items').delete().eq('po_id', id)
        if (line_items.length > 0) {
          const { error: liErr } = await (supabase as any)
            .from('po_line_items')
            .insert(line_items.map((li) => ({ ...li, po_id: id })))
          if (liErr) throw liErr
        }
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.id] })
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
      const { data: myProfile } = await (supabase as any)
        .from('profiles').select('id, division_id').eq('auth_user_id', user.id).single()
      if (!myProfile) throw new Error('Profile not found')

      const divisionId: string | null = myProfile.division_id ?? null

      // Get PO details
      const { data: po } = await (supabase as any)
        .from('purchase_orders').select('id, total_qar, po_number').eq('id', id).single()
      if (!po) throw new Error('PO not found')

      // Find chain (division-specific → company default)
      let chain: { id: string; approval_chain_tiers: any[] } | null = null
      if (divisionId) {
        const { data } = await (supabase as any)
          .from('approval_chains')
          .select('id, approval_chain_tiers(*)')
          .eq('division_id', divisionId)
          .eq('is_active', true)
          .maybeSingle()
        chain = data
      }
      if (!chain) {
        const { data } = await (supabase as any)
          .from('approval_chains')
          .select('id, approval_chain_tiers(*)')
          .is('division_id', null)
          .eq('is_active', true)
          .maybeSingle()
        chain = data
      }
      if (!chain) throw new Error('No approval chain configured. Contact your administrator.')

      // Find applicable tiers
      const tiers = findApplicableTiers(po.total_qar, chain.approval_chain_tiers ?? [])
      if (tiers.length === 0) throw new Error('No approval tiers match this PO amount. Check approval chain configuration.')

      // Fetch role assignments for this division (including company-wide)
      const { data: assignments } = await (supabase as any)
        .from('approval_role_assignments')
        .select('*')
        .is('deleted_at', null)
        .or(divisionId ? `division_id.eq.${divisionId},division_id.is.null` : 'division_id.is.null')
      const roleAssignments = assignments ?? []

      // Validate roles (exclude creator)
      const validationError = validateRoles(tiers, roleAssignments, myProfile.id)
      if (validationError) throw new Error(validationError)

      // Determine iteration
      const { data: existingSteps, error: iterErr } = await (supabase as any)
        .from('po_approvals').select('iteration').eq('po_id', id).order('iteration', { ascending: false }).limit(1)
      if (iterErr) throw iterErr
      const iteration = existingSteps?.[0]?.iteration ? existingSteps[0].iteration + 1 : 1

      // Create approval steps
      const steps = buildApprovalSteps(id, tiers, iteration)
      const { error: stepsErr } = await (supabase as any).from('po_approvals').insert(steps)
      if (stepsErr) throw stepsErr

      // Update PO status
      const { error: poErr } = await (supabase as any)
        .from('purchase_orders').update({ status: 'pending_approval' }).eq('id', id)
      if (poErr) throw poErr

      // Fire notifications (distinct per user for lowest-rank tier)
      const lowestRank = tiers[0].rank
      const recipientIds = getNotificationRecipients(lowestRank, tiers, roleAssignments, myProfile.id)
      if (recipientIds.length > 0) {
        const notifs = recipientIds.map((profileId: string) => ({
          profile_id: profileId,
          type: 'po_approval_requested',
          title: `PO ${po.po_number ?? id} requires your approval`,
          body: `Total: ${po.total_qar} QAR`,
          related_id: id,
          related_type: 'purchase_order',
        }))
        await (supabase as any).from('notifications').insert(notifs)
      }
    },
    onSuccess: (_data: unknown, variables: { id: string }) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['po-approvals'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
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
      const { error } = await (supabase as any).from('payments').insert({
        source_type: 'purchase_order',
        source_id: payment.po_id,
        supplier_id: payment.supplier_id,
        amount: payment.amount,
        method: payment.method as any, // DB enum — cast needed due to stale generated types
        date: payment.date,
        reference: payment.reference,
        notes: payment.notes,
        currency: payment.currency,
        exchange_rate: payment.exchange_rate,
        amount_qar: payment.amount * payment.exchange_rate,
        status: 'pending' as any,
      })
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['po-payments', variables.po_id] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
    },
  })
}

export function useSubmitPO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('purchase_orders')
        .update({ status: 'pending_approval' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', id] })
    },
  })
}

export function useCancelPO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('purchase_orders')
        .update({ status: 'cancelled' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', id] })
    },
  })
}

export function useDeletePoVersion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ versionId, poId }: { versionId: string; poId: string }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('po_versions')
        .delete()
        .eq('id', versionId)
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['po-versions', variables.poId] })
    },
  })
}

export function usePoVersions(poId: string | null) {
  return useQuery({
    queryKey: ['po-versions', poId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('po_versions')
        .select('*')
        .eq('po_id', poId!)
        .order('version_number', { ascending: true })
      if (error) throw error
      return data as PoVersion[]
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
      currentSnapshot,
      payload,
    }: {
      id: string
      currentVersionNumber: number
      currentSnapshot: Omit<PoVersion, 'id' | 'po_id' | 'submitted_at' | 'submitted_by'>
      payload: CreatePOPayload
    }) => {
      const supabase = createClient()

      // 1. Snapshot current state into po_versions
      const { error: snapErr } = await (supabase as any)
        .from('po_versions')
        .insert({
          po_id: id,
          version_number: currentVersionNumber,
          supplier_id: currentSnapshot.supplier_id,
          supplier_name: currentSnapshot.supplier_name,
          currency: currentSnapshot.currency,
          exchange_rate: currentSnapshot.exchange_rate,
          subtotal: currentSnapshot.subtotal,
          discount_amount: currentSnapshot.discount_amount,
          discount_label: currentSnapshot.discount_label,
          payment_terms: currentSnapshot.payment_terms,
          payment_terms_notes: currentSnapshot.payment_terms_notes,
          payment_milestones: currentSnapshot.payment_milestones,
          delivery_terms: currentSnapshot.delivery_terms,
          delivery_terms_notes: currentSnapshot.delivery_terms_notes,
          expected_delivery: currentSnapshot.expected_delivery,
          vendor_notes: currentSnapshot.vendor_notes,
          line_items: currentSnapshot.line_items,
        })
      if (snapErr) throw snapErr

      // 2. Recalculate totals
      const subtotal = payload.line_items.reduce((s, li) => s + li.total_price, 0)
      const total_qar = (subtotal - payload.discount_amount) * payload.exchange_rate
      const approval_level = calcApprovalLevel(total_qar)
      const newVersion = currentVersionNumber + 1

      // 3. Update main PO record + increment version
      const { error: poErr } = await (supabase as any)
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
      await (supabase as any).from('po_line_items').delete().eq('po_id', id)
      if (payload.line_items.length > 0) {
        const { error: liErr } = await (supabase as any)
          .from('po_line_items')
          .insert(payload.line_items.map((li) => ({ ...li, po_id: id })))
        if (liErr) throw liErr
      }

      // 5. Reset approvals — delete old, insert chain-based fresh steps
      await (supabase as any).from('po_approvals').delete().eq('po_id', id)

      // Resolve chain for the submitter's division
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: myProfile } = await (supabase as any)
        .from('profiles').select('id, division_id').eq('auth_user_id', user.id).single()
      if (!myProfile) throw new Error('Profile not found')

      const divisionId: string | null = myProfile.division_id ?? null

      let chain: { id: string; approval_chain_tiers: any[] } | null = null
      if (divisionId) {
        const { data } = await (supabase as any)
          .from('approval_chains')
          .select('id, approval_chain_tiers(*)')
          .eq('division_id', divisionId)
          .eq('is_active', true)
          .maybeSingle()
        chain = data
      }
      if (!chain) {
        const { data } = await (supabase as any)
          .from('approval_chains')
          .select('id, approval_chain_tiers(*)')
          .is('division_id', null)
          .eq('is_active', true)
          .maybeSingle()
        chain = data
      }
      if (!chain) throw new Error('No approval chain configured. Contact your administrator.')

      const tiers = findApplicableTiers(total_qar, chain.approval_chain_tiers ?? [])
      if (tiers.length === 0) throw new Error('No approval tiers match this PO amount. Check approval chain configuration.')

      const { data: assignments } = await (supabase as any)
        .from('approval_role_assignments')
        .select('*')
        .is('deleted_at', null)
        .or(divisionId ? `division_id.eq.${divisionId},division_id.is.null` : 'division_id.is.null')
      const roleAssignments = assignments ?? []

      const validationError = validateRoles(tiers, roleAssignments, myProfile.id)
      if (validationError) throw new Error(validationError)

      // Determine iteration number
      const { data: existingSteps, error: iterErr } = await (supabase as any)
        .from('po_approvals').select('iteration').eq('po_id', id).order('iteration', { ascending: false }).limit(1)
      if (iterErr) throw iterErr
      const iteration = existingSteps?.[0]?.iteration ? existingSteps[0].iteration + 1 : 1

      const steps = buildApprovalSteps(id, tiers, iteration)
      const { error: approvalErr } = await (supabase as any).from('po_approvals').insert(steps)
      if (approvalErr) throw approvalErr

      // Fire notifications to first tier recipients
      const lowestRank = tiers[0].rank
      const recipientIds = getNotificationRecipients(lowestRank, tiers, roleAssignments, myProfile.id)
      if (recipientIds.length > 0) {
        const { data: poData } = await (supabase as any)
          .from('purchase_orders').select('po_number').eq('id', id).single()
        const notifs = recipientIds.map((profileId: string) => ({
          profile_id: profileId,
          type: 'po_approval_requested',
          title: `PO ${poData?.po_number ?? id} requires your approval`,
          body: `Total: ${total_qar} QAR`,
          related_id: id,
          related_type: 'purchase_order',
        }))
        await (supabase as any).from('notifications').insert(notifs)
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['po-versions', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
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

      const { error: poErr } = await (supabase as any)
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

      await (supabase as any).from('po_line_items').delete().eq('po_id', id)
      if (payload.line_items.length > 0) {
        const { error: liErr } = await (supabase as any)
          .from('po_line_items')
          .insert(payload.line_items.map((li) => ({ ...li, po_id: id })))
        if (liErr) throw liErr
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.id] })
    },
  })
}
