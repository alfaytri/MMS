import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { humanizeDbError } from '@/lib/dbErrors'

/**
 * `warranty_claims` was added by a Stage 3 migration after the last
 * `supabase gen types` run, so it is intentionally absent from
 * `database.types.ts` (do not regenerate — see project rule). Every
 * `.from('warranty_claims')` access below is cast through `as never` /
 * `as unknown as …`, mirroring the established pattern for not-yet-typed
 * tables elsewhere in the codebase (e.g. useWarehouseOperations.ts's
 * `stock_adjustments` cast, useCreditBalances.ts's balance-view casts). The
 * five RPCs are new for the same reason and use the sibling
 * `supabase.rpc('name' as never, args as never)` cast.
 */

export type WarrantyClaimStatus =
  | 'open'
  | 'covered'
  | 'rejected'
  | 'in_progress'
  | 'resolved'
  | 'void'

export type WarrantyClaimDecision = 'covered' | 'rejected' | null
export type WarrantyClaimResolutionType = 'replacement' | 'credit' | 'refund' | 'repair' | null

type PgError = { code?: string; message?: string; details?: string; hint?: string }

// Raw `warranty_claims` row — explicit columns only, never select('*').
type WarrantyClaimBaseRow = {
  id: string
  claim_number: string
  warranty_record_id: string
  warranty_type: string
  status: WarrantyClaimStatus
  issue_description: string
  reported_by: string | null
  reported_at: string
  decision: WarrantyClaimDecision
  decided_by: string | null
  decided_at: string | null
  decision_reason: string | null
  resolution_type: WarrantyClaimResolutionType
  resolved_at: string | null
  linked_return_id: string | null
  linked_credit_note_id: string | null
  void_reason: string | null
  voided_by: string | null
  voided_at: string | null
  division_id: string
  created_at: string
  updated_at: string
}

/**
 * Enriched row returned to every caller — display strings are always
 * resolved here, never a raw UUID (project rule — Dropdown UUID Guard
 * applies just as much to table cells as to selects).
 */
export type WarrantyClaimRow = WarrantyClaimBaseRow & {
  warranty_number: string
  item_name: string
  sku: string | null
  customer_name: string
  division_name: string
}

const CLAIM_COLUMNS =
  'id, claim_number, warranty_record_id, warranty_type, status, issue_description, reported_by, reported_at, decision, decided_by, decided_at, decision_reason, resolution_type, resolved_at, linked_return_id, linked_credit_note_id, void_reason, voided_by, voided_at, division_id, created_at, updated_at'

/**
 * Batch-resolves the warranty-record + customer + division display fields
 * for a page of claim rows. Mirrors the id→name lookup-map approach used by
 * the Stage 2 records page (src/app/(dashboard)/sales/warranties/page.tsx):
 * fetch the referenced rows separately and build id→value maps, rather than
 * a PostgREST embed (warranty_claims → warranty_records has no FK wired up
 * for embedding). Unlike that page, the enrichment happens here so every
 * caller gets ready-to-render strings straight off the hook.
 */
async function enrichClaims(
  supabase: ReturnType<typeof createClient>,
  claims: WarrantyClaimBaseRow[]
): Promise<WarrantyClaimRow[]> {
  if (claims.length === 0) return []

  const recordIds = Array.from(new Set(claims.map((c) => c.warranty_record_id)))
  const { data: records, error: recErr } = await supabase
    .from('warranty_records')
    .select('id, warranty_number, item_name, sku, customer_id')
    .in('id', recordIds)
    .limit(200)
  if (recErr) throw new Error(humanizeDbError(recErr, 'load warranty records for claims'))

  type RecordRow = {
    id: string
    warranty_number: string
    item_name: string
    sku: string | null
    customer_id: string | null
  }
  const recordById = new Map<string, RecordRow>((records ?? []).map((r) => [r.id, r as RecordRow]))

  const customerIds = Array.from(
    new Set(
      Array.from(recordById.values())
        .map((r) => r.customer_id)
        .filter((id): id is string => !!id)
    )
  )
  const customerNameById = new Map<string, string>()
  if (customerIds.length > 0) {
    const { data: customers, error: custErr } = await supabase
      .from('customers')
      .select('id, name')
      .in('id', customerIds)
      .limit(200)
    if (custErr) throw new Error(humanizeDbError(custErr, 'load customers for claims'))
    for (const c of customers ?? []) customerNameById.set(c.id, c.name)
  }

  const divisionIds = Array.from(new Set(claims.map((c) => c.division_id).filter((id): id is string => !!id)))
  const divisionNameById = new Map<string, string>()
  if (divisionIds.length > 0) {
    const { data: divisions, error: divErr } = await supabase
      .from('company_divisions')
      .select('id, name')
      .in('id', divisionIds)
      .limit(200)
    if (divErr) throw new Error(humanizeDbError(divErr, 'load divisions for claims'))
    for (const d of divisions ?? []) divisionNameById.set(d.id, d.name)
  }

  return claims.map((claim) => {
    const record = recordById.get(claim.warranty_record_id)
    const customerName = record?.customer_id
      ? customerNameById.get(record.customer_id) ?? 'Unknown customer'
      : '—'
    return {
      ...claim,
      warranty_number: record?.warranty_number ?? '—',
      item_name: record?.item_name ?? '—',
      sku: record?.sku ?? null,
      customer_name: customerName,
      division_name: divisionNameById.get(claim.division_id) ?? 'Unknown division',
    }
  })
}

/** List/search query — explicit columns, division + status + search filters, capped at 200. */
export function useWarrantyClaims(
  filters: { search?: string; divisionId?: string; status?: string } = {}
) {
  return useQuery({
    queryKey: queryKeys.warranty.claims(filters),
    queryFn: async (): Promise<WarrantyClaimRow[]> => {
      const supabase = createClient()
      let q = supabase
        .from('warranty_claims' as never)
        .select(CLAIM_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(200)
      if (filters.divisionId) q = q.eq('division_id', filters.divisionId)
      if (filters.status) q = q.eq('status', filters.status)
      if (filters.search) {
        const s = `%${filters.search}%`
        // Local-column search only, mirroring useWarrantyRecords — item /
        // warranty-number live on the joined record, not this table, and
        // cross-table filtering isn't worth the complexity here.
        q = q.or(`claim_number.ilike.${s},issue_description.ilike.${s}`)
      }
      const { data, error } = (await q) as unknown as {
        data: WarrantyClaimBaseRow[] | null
        error: PgError | null
      }
      if (error) throw new Error(humanizeDbError(error, 'load warranty claims'))
      return enrichClaims(supabase, data ?? [])
    },
    staleTime: 60_000,
  })
}

/** Single-claim detail query, enriched the same way as the list. */
export function useWarrantyClaim(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.warranty.claim(id),
    enabled: !!id,
    queryFn: async (): Promise<WarrantyClaimRow | null> => {
      const supabase = createClient()
      const { data, error } = (await supabase
        .from('warranty_claims' as never)
        .select(CLAIM_COLUMNS)
        .eq('id', id!)
        .maybeSingle()) as unknown as { data: WarrantyClaimBaseRow | null; error: PgError | null }
      if (error) throw new Error(humanizeDbError(error, 'load warranty claim'))
      if (!data) return null
      const [enriched] = await enrichClaims(supabase, [data])
      return enriched ?? null
    },
    staleTime: 60_000,
  })
}

/** Files a new claim against a warranty record. Returns the new claim id. */
export function useFileWarrantyClaim() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { warranty_record_id: string; issue: string }): Promise<string> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_file_warranty_claim' as never, {
        p_warranty_record_id: payload.warranty_record_id,
        p_issue: payload.issue,
      } as never)
      if (error) throw new Error(humanizeDbError(error, 'file a warranty claim'))
      return data as unknown as string
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.warranty.claims() })
      queryClient.invalidateQueries({ queryKey: queryKeys.warranty.records() })
    },
  })
}

/** Assesses an open claim as covered or rejected (reason required on reject). */
export function useAssessWarrantyClaim() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      claim_id: string
      decision: 'covered' | 'rejected'
      reason: string | null
    }): Promise<void> => {
      const supabase = createClient()
      const { error } = await supabase.rpc('rpc_assess_warranty_claim' as never, {
        p_claim_id: payload.claim_id,
        p_decision: payload.decision,
        p_reason: payload.reason,
      } as never)
      if (error) throw new Error(humanizeDbError(error, 'assess the warranty claim'))
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.warranty.claims() })
      queryClient.invalidateQueries({ queryKey: queryKeys.warranty.claim(variables.claim_id) })
    },
  })
}

/** Voids any non-terminal claim (reason required). */
export function useVoidWarrantyClaim() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { claim_id: string; reason: string }): Promise<void> => {
      const supabase = createClient()
      const { error } = await supabase.rpc('rpc_void_warranty_claim' as never, {
        p_claim_id: payload.claim_id,
        p_reason: payload.reason,
      } as never)
      if (error) throw new Error(humanizeDbError(error, 'void the warranty claim'))
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.warranty.claims() })
      queryClient.invalidateQueries({ queryKey: queryKeys.warranty.claim(variables.claim_id) })
    },
  })
}

/**
 * Starts resolution on a covered sale claim — creates the linked
 * `so_po_returns` row (and its lines) and flips the claim to `in_progress`.
 * Returns the new return id so the caller can navigate straight to it in
 * the Returns UI, where the existing inspection/restock/replacement/
 * credit/refund/repair flow takes over.
 */
export function useStartWarrantyClaimResolution() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { claim_id: string }): Promise<string> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_start_warranty_claim_resolution' as never, {
        p_claim_id: payload.claim_id,
      } as never)
      if (error) throw new Error(humanizeDbError(error, 'start the warranty claim resolution'))
      return data as unknown as string
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.warranty.claims() })
      queryClient.invalidateQueries({ queryKey: queryKeys.warranty.records() })
      queryClient.invalidateQueries({ queryKey: queryKeys.saleReturns.all })
    },
  })
}
