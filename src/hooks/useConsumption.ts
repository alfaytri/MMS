/**
 * Consumption module — hook family for /consumption.
 *
 * Wraps the two SECURITY DEFINER RPCs shipped in migration
 * 20260815000400_teams_places_rpc_consumption.sql:
 *
 *   rpc_post_consumption    → useCreateConsumption
 *   rpc_cancel_consumption  → useCancelConsumption
 *
 * Plus a list query, a detail query, and storage helpers for the
 * consumption-attachments bucket (20260815001400).
 *
 * `rpc_post_consumption` gained an optional `p_milestone_id` param in
 * 20260829000200_milestone_rpcs_and_post_consumption.sql (VWh Projects
 * Phase 2) — nullable, tags the consumer discipline's spend with a project
 * milestone. See `useProjectMilestones.ts` for the milestone CRUD hooks.
 *
 * Plan: docs/plans/2026-08-03-teams-places-consumption.md (Task 9).
 */

import { useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { compressImageBeforeUpload } from '@/lib/compressImage'
import { useCustodyLocations } from '@/hooks/useCustodyLocations'

// ─── Types ──────────────────────────────────────────────────────────────

export type ConsumerType = 'custody' | 'internal'

export type ConsumptionStatus = 'draft' | 'posted' | 'cancelled'

export type ConsumptionLine = {
  id:                string
  brand_variant_id:  string
  item_name:         string
  sku:               string | null
  qty:               number
  unit_cost:         number | null
  total_cost:        number | null
}

export type ConsumptionListRow = {
  id:                        string
  ce_number:                 string
  date:                      string
  status:                    ConsumptionStatus
  source_warehouse_id:       string
  source_warehouse_name:     string | null
  source_sub_container_id:   string
  source_sub_container_name: string | null
  consumer_type:             ConsumerType
  consumer_sub_container_id: string | null
  is_team_item:              boolean
  consumer_display:          string
  notes:                     string | null
  attachments:               string[]
  total_value:               number
  line_count:                number
  posted_at:                 string | null
  cancelled_at:              string | null
  posted_by_name:            string | null
  cancelled_by_name:         string | null
  division_name:             string | null
}

export type ConsumptionDetail = ConsumptionListRow & {
  lines: ConsumptionLine[]
}

export type ConsumptionListFilters = {
  status?:        ConsumptionStatus | 'all'
  consumerType?:  ConsumerType | 'all'
  fromDate?:      string | null   // yyyy-mm-dd inclusive
  toDate?:        string | null   // yyyy-mm-dd inclusive
  teamItems?:     boolean         // true = Team tab, false = Service tab, undefined = both
}

// Raw row shape from the embedded select — mapped to ConsumptionListRow by
// `mapRow` so the UI never touches the join alias soup.
type RawRow = {
  id:                        string
  ce_number:                 string
  date:                      string
  status:                    ConsumptionStatus
  source_warehouse_id:       string
  source_sub_container_id:   string
  consumer_type:             ConsumerType
  consumer_sub_container_id: string | null
  is_team_item:              boolean
  notes:                     string | null
  attachments:               string[] | null
  posted_at:                 string | null
  cancelled_at:              string | null
  source_warehouse:  { name: string | null }                | null
  source_sub:        { name: string | null }                | null
  consumer_sub:      { name: string | null }                | null
  posted_by_user:    { full_name: string | null }           | null
  cancelled_by_user: { full_name: string | null }           | null
  division:          { name: string | null }                | null
  consumption_lines: Array<{ qty: number | null; unit_cost: number | null }>
}

function mapRow(row: RawRow): ConsumptionListRow {
  const lines = row.consumption_lines ?? []
  const total_value = lines.reduce(
    (sum, l) => sum + (l.qty ?? 0) * (l.unit_cost ?? 0),
    0,
  )

  let consumer_display = 'Internal'
  if (row.consumer_type === 'custody') consumer_display = row.consumer_sub?.name ?? '(location removed)'

  return {
    id:                        row.id,
    ce_number:                 row.ce_number,
    date:                      row.date,
    status:                    row.status,
    source_warehouse_id:       row.source_warehouse_id,
    source_warehouse_name:     row.source_warehouse?.name ?? null,
    source_sub_container_id:   row.source_sub_container_id,
    source_sub_container_name: row.source_sub?.name ?? null,
    consumer_type:             row.consumer_type,
    consumer_sub_container_id: row.consumer_sub_container_id,
    is_team_item:              row.is_team_item ?? false,
    consumer_display,
    notes:                     row.notes,
    attachments:               row.attachments ?? [],
    total_value,
    line_count:                lines.length,
    posted_at:                 row.posted_at,
    cancelled_at:              row.cancelled_at,
    posted_by_name:            row.posted_by_user?.full_name ?? null,
    cancelled_by_name:         row.cancelled_by_user?.full_name ?? null,
    division_name:             row.division?.name ?? null,
  }
}

const LIST_SELECT = `
  id, ce_number, date, status,
  source_warehouse_id, source_sub_container_id,
  consumer_type, consumer_sub_container_id, is_team_item,
  notes, attachments, posted_at, cancelled_at,
  source_warehouse:source_warehouse_id(name),
  source_sub:source_sub_container_id(name),
  consumer_sub:consumer_sub_container_id(name),
  posted_by_user:posted_by(full_name),
  cancelled_by_user:cancelled_by(full_name),
  division:division_id(name),
  consumption_lines(qty, unit_cost)
`

// ─── 1. List query ──────────────────────────────────────────────────────

export function useConsumptionList(filters: ConsumptionListFilters = {}) {
  return useQuery({
    queryKey: [...queryKeys.consumption.all, filters],
    queryFn: async (): Promise<ConsumptionListRow[]> => {
      const supabase = createClient()
      let q = supabase
        .from('consumption_entries')
        .select(LIST_SELECT)
        .order('date',       { ascending: false })
        .order('ce_number',  { ascending: false })
        .limit(500)

      if (filters.status && filters.status !== 'all') {
        q = q.eq('status', filters.status)
      }
      if (filters.consumerType && filters.consumerType !== 'all') {
        q = q.eq('consumer_type', filters.consumerType)
      }
      if (filters.fromDate) q = q.gte('date', filters.fromDate)
      if (filters.toDate)   q = q.lte('date', filters.toDate)
      // Cast past the stale generated types — is_team_item is newer (20260918000000).
      if (typeof filters.teamItems === 'boolean') q = q.eq('is_team_item' as never, filters.teamItems as never)

      const { data, error } = await q
      if (error) throw error
      return (data as unknown as RawRow[]).map(mapRow)
    },
    staleTime: 30 * 1000,
  })
}

// ─── 2. Detail query ────────────────────────────────────────────────────

export function useConsumption(id: string | null) {
  return useQuery({
    queryKey: queryKeys.consumption.detail(id),
    enabled: !!id,
    queryFn: async (): Promise<ConsumptionDetail | null> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('consumption_entries')
        .select(LIST_SELECT)
        .eq('id', id!)
        .maybeSingle()
      if (error) throw error
      if (!data) return null

      const header = mapRow(data as unknown as RawRow)

      const { data: lineRows, error: lineErr } = await supabase
        .from('consumption_lines')
        .select('id, brand_variant_id, item_name, sku, qty, unit_cost, total_cost')
        .eq('consumption_id', id!)
        .order('created_at', { ascending: true })
      if (lineErr) throw lineErr

      return {
        ...header,
        lines: (lineRows ?? []).map((l): ConsumptionLine => ({
          id:                l.id as string,
          brand_variant_id:  l.brand_variant_id as string,
          item_name:         l.item_name as string,
          sku:               (l.sku as string | null) ?? null,
          qty:               l.qty as number,
          unit_cost:         (l.unit_cost as number | null) ?? null,
          total_cost:        (l.total_cost as number | null) ?? null,
        })),
      }
    },
    staleTime: 30 * 1000,
  })
}

// ─── 2b. Consumer-name resolver ───────────────────────────────────────────

type ConsumerNameRow = {
  consumer_type:             ConsumerType
  consumer_sub_container_id: string | null
  consumer_display:          string
}

/**
 * Resolve a consumption row's consumer name from the cross-division custody
 * master list instead of trusting the list/detail query's embedded join.
 *
 * The `consumer_sub` embed in LIST_SELECT reads `warehouse_sub_containers`
 * through its RESTRICTIVE RLS (active-division OR warehouse-RP scope). A viewer
 * whose active division differs from the consumer location's division gets a null
 * embed → the mapper falls back to "(location removed)" even though it is alive.
 * `get_custody_master_list` is SECURITY DEFINER and returns every division's rows,
 * so this always resolves a live location. Falls back to the row's own
 * `consumer_display` only if the id is genuinely unknown (truly deleted).
 */
export function useConsumerLabel() {
  const { data: locations = [] } = useCustodyLocations()
  const locationMap = useMemo(() => new Map(locations.map((l) => [l.id, l.name])), [locations])

  return useCallback((row: ConsumerNameRow): string => {
    if (row.consumer_type === 'custody') {
      return locationMap.get(row.consumer_sub_container_id ?? '') ?? row.consumer_display
    }
    return 'Internal'
  }, [locationMap])
}

// ─── 3. Post mutation ───────────────────────────────────────────────────

export type PostConsumptionLine = { brand_variant_id: string; qty: number }

export function useCreateConsumption() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      source_warehouse_id:         string
      source_sub_container_id:     string
      consumer_type:               ConsumerType
      consumer_sub_container_id?:  string | null
      milestone_id?:               string | null
      discipline_id?:              string | null
      code?:                       string | null
      notes?:                      string | null
      attachments?:                string[]
      lines:                       PostConsumptionLine[]
    }) => {
      const supabase = createClient()
      // The RPC accepts NULL for the consumer sub / milestone / discipline /
      // code / notes params (no NOT NULL constraint), but Supabase's generated
      // types mark them non-nullable, so cast the args object (same pattern used
      // across the custody RPC hooks). p_code is required server-side only for
      // project spend (a discipline is tagged); the dialog enforces that too.
      const rpcArgs = {
        p_source_warehouse_id:       payload.source_warehouse_id,
        p_source_sub_container_id:   payload.source_sub_container_id,
        p_consumer_type:             payload.consumer_type,
        p_consumer_sub_container_id: payload.consumer_sub_container_id ?? null,
        p_milestone_id:              payload.milestone_id ?? null,
        p_discipline_id:             payload.discipline_id ?? null,
        p_code:                      payload.code ?? null,
        p_notes:                     payload.notes ?? null,
        p_attachments:               payload.attachments ?? [],
        p_lines:                     payload.lines,
      } as unknown as Parameters<typeof supabase.rpc<'rpc_post_consumption'>>[1]
      const { data, error } = await supabase.rpc('rpc_post_consumption', rpcArgs)
      if (error) throw new Error(error.message)
      return data as unknown as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.consumption.all })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseStockAll })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.stockMovements })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.fifoLayers })
    },
  })
}

// ─── 4. Cancel mutation ─────────────────────────────────────────────────

export function useCancelConsumption() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (consumptionId: string) => {
      const supabase = createClient()
      const { error } = await supabase.rpc('rpc_cancel_consumption', {
        p_consumption_id: consumptionId,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, consumptionId) => {
      qc.invalidateQueries({ queryKey: queryKeys.consumption.all })
      qc.invalidateQueries({ queryKey: queryKeys.consumption.detail(consumptionId) })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseStockAll })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.stockMovements })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.fifoLayers })
    },
  })
}

// ─── 5. Storage — attachments ──────────────────────────────────────────

// ─── 6. Consumption edit requests (Request Cancellation approval flow) ─

export type ConsumptionEditRequestStatus = 'pending' | 'approved' | 'rejected'

export type ConsumptionEditRequest = {
  id:                string
  consumption_id:    string
  requested_by:      string
  requester_name:    string | null
  reason:            string
  status:            ConsumptionEditRequestStatus
  reviewed_by:       string | null
  reviewer_name:     string | null
  reviewed_at:       string | null
  review_comment:    string | null
  created_at:        string
}

type RawEditRequest = {
  id:              string
  consumption_id:  string
  requested_by:    string
  reason:          string
  status:          ConsumptionEditRequestStatus
  reviewed_by:     string | null
  reviewed_at:     string | null
  review_comment:  string | null
  created_at:      string
  requester:  { full_name: string | null } | null
  reviewer:   { full_name: string | null } | null
}

function mapEditRequest(row: RawEditRequest): ConsumptionEditRequest {
  return {
    id:              row.id,
    consumption_id:  row.consumption_id,
    requested_by:    row.requested_by,
    requester_name:  row.requester?.full_name ?? null,
    reason:          row.reason,
    status:          row.status,
    reviewed_by:     row.reviewed_by,
    reviewer_name:   row.reviewer?.full_name ?? null,
    reviewed_at:     row.reviewed_at,
    review_comment:  row.review_comment,
    created_at:      row.created_at,
  }
}

const EDIT_REQUEST_SELECT = `
  id, consumption_id, requested_by, reason, status,
  reviewed_by, reviewed_at, review_comment, created_at,
  requester:requested_by(full_name),
  reviewer:reviewed_by(full_name)
`

/** All requests (any status) for one consumption, newest-first. */
export function useConsumptionEditRequests(consumptionId: string | null) {
  return useQuery({
    queryKey: ['consumption-edit-requests', consumptionId],
    enabled: !!consumptionId,
    queryFn: async (): Promise<ConsumptionEditRequest[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('consumption_edit_requests')
        .select(EDIT_REQUEST_SELECT)
        .eq('consumption_id', consumptionId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data as unknown as RawEditRequest[]).map(mapEditRequest)
    },
    staleTime: 30 * 1000,
  })
}

/** Every pending consumption edit request across the app — for the approvals page. */
export function usePendingConsumptionEditRequests() {
  return useQuery({
    queryKey: ['consumption-edit-requests', 'pending'],
    queryFn: async (): Promise<ConsumptionEditRequest[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('consumption_edit_requests')
        .select(EDIT_REQUEST_SELECT)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data as unknown as RawEditRequest[]).map(mapEditRequest)
    },
    staleTime: 30 * 1000,
  })
}

export function useRequestConsumptionEdit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { consumption_id: string; reason: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_request_consumption_edit', {
        p_consumption_id: payload.consumption_id,
        p_reason:         payload.reason,
      })
      if (error) throw new Error(error.message)
      return data as unknown as string
    },
    onSuccess: (_data, payload) => {
      qc.invalidateQueries({ queryKey: ['consumption-edit-requests', payload.consumption_id] })
      qc.invalidateQueries({ queryKey: ['consumption-edit-requests', 'pending'] })
    },
  })
}

export function useDecideConsumptionEdit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      request_id:      string
      decision:        'approved' | 'rejected'
      comment?:        string | null
      consumption_id?: string   // for cache invalidation
    }) => {
      const supabase = createClient()
      const { error } = await supabase.rpc('rpc_decide_consumption_edit', {
        p_request_id: payload.request_id,
        p_decision:   payload.decision,
        p_comment:    payload.comment ?? undefined,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, payload) => {
      qc.invalidateQueries({ queryKey: ['consumption-edit-requests'] })
      if (payload.consumption_id) {
        qc.invalidateQueries({ queryKey: queryKeys.consumption.detail(payload.consumption_id) })
      }
      qc.invalidateQueries({ queryKey: queryKeys.consumption.all })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseStockAll })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.stockMovements })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.fifoLayers })
    },
  })
}

/**
 * Does the caller hold a role configured as an active step on the
 * `consumption_edit` workflow? Mirrors the RLS UPDATE policy so the UI
 * can decide whether to show Approve/Reject buttons.
 */
export function useCanApproveConsumptionEdit() {
  return useQuery({
    queryKey: ['consumption-edit-can-approve'],
    queryFn: async (): Promise<boolean> => {
      const supabase = createClient()
      const { data: userRes } = await supabase.auth.getUser()
      if (!userRes.user) return false
      const { data, error } = await supabase
        .from('user_data')
        .select(`
          user_custom_roles!user_custom_roles_profile_id_fkey(
            custom_roles!inner(
              approval_workflow_steps!inner(workflow, archived_at)
            )
          )
        `)
        .eq('auth_user_id', userRes.user.id)
        .maybeSingle()
      if (error) return false
      type Row = {
        user_custom_roles?: Array<{
          custom_roles?: {
            approval_workflow_steps?: Array<{ workflow: string; archived_at: string | null }>
          }
        }>
      }
      const roles = (data as Row | null)?.user_custom_roles ?? []
      return roles.some((r) =>
        (r.custom_roles?.approval_workflow_steps ?? []).some(
          (s) => s.workflow === 'consumption_edit' && s.archived_at === null,
        ),
      )
    },
    staleTime: 60 * 1000,
  })
}

// ─── 7. Storage — attachments ──────────────────────────────────────────

const BUCKET = 'consumption-attachments'

export async function uploadConsumptionAttachment(file: File): Promise<string> {
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('File too large — maximum 10 MB')
  }
  // Downscale images before upload — phone photos are typically 4-8 MB
  // and the attachment viewer doesn't need the full 12 MP frame.
  const toUpload = await compressImageBeforeUpload(file)
  const supabase = createClient()
  const now = new Date()
  const year  = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const sanitized = toUpload.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${year}/${month}/${now.getTime()}-${sanitized}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, toUpload)
  if (error) throw new Error(error.message)
  return path
}

export async function removeConsumptionAttachment(path: string): Promise<void> {
  const supabase = createClient()
  await supabase.storage.from(BUCKET).remove([path])
}

export function useConsumptionAttachmentUrls(paths: string[] | null | undefined) {
  const validPaths = (paths ?? []).filter(Boolean).slice().sort()
  return useQuery({
    queryKey: ['consumption-attachment-urls', validPaths],
    enabled: validPaths.length > 0,
    queryFn: async () => {
      const supabase = createClient()
      const result: Record<string, string> = {}
      await Promise.all(
        validPaths.map(async (path) => {
          const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
          if (data?.signedUrl) result[path] = data.signedUrl
        })
      )
      return result
    },
    staleTime: 50 * 60 * 1000,
  })
}

// ─── 8. Consumption sources (assigned warehouses/custody for the picker) ──

export type ConsumptionSource = {
  warehouse_id:       string
  warehouse_name:     string
  warehouse_kind:     string | null
  sub_container_id:   string
  sub_container_name: string
}

/**
 * The (warehouse, sub-container) sources the current user may post a
 * consumption from — assigned real warehouses, assigned custody subs, or all
 * (minus Repair) for a custody admin. Mirrors the rpc_post_consumption guard so
 * the picker only offers sources the DB will actually accept.
 */
export function useMyConsumptionSources() {
  return useQuery({
    queryKey: ['consumption-sources', 'mine'],
    queryFn: async (): Promise<ConsumptionSource[]> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_my_consumption_sources' as never)
      if (error) throw new Error(error.message)
      return (data as unknown as ConsumptionSource[]) ?? []
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ─── 9. Team-item variant ids (for the New Consumption picker) ────────────

/**
 * The set of brand_variant ids that are team-items (effective flag =
 * COALESCE(item, category, false)). The New Consumption dialog scopes its item
 * picker with this per tab: the Service tab EXCLUDES these, the Team tab shows
 * ONLY these. Backed by rpc_team_item_variant_ids (SECURITY INVOKER, non-anon).
 */
export function useTeamItemVariantIds() {
  return useQuery({
    queryKey: ['team-item-variant-ids'],
    queryFn: async (): Promise<Set<string>> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_team_item_variant_ids' as never)
      if (error) throw new Error(error.message)
      return new Set((data as unknown as string[]) ?? [])
    },
    staleTime: 5 * 60 * 1000,
  })
}
