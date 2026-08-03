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
 * Plan: docs/plans/2026-08-03-teams-places-consumption.md (Task 9).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

// ─── Types ──────────────────────────────────────────────────────────────

export type ConsumerType = 'team' | 'customer_site' | 'customer' | 'internal'

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
  consumer_team_sub_id:      string | null
  consumer_place_sub_id:     string | null
  consumer_customer_id:      string | null
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
  consumer_team_sub_id:      string | null
  consumer_place_sub_id:     string | null
  consumer_customer_id:      string | null
  notes:                     string | null
  attachments:               string[] | null
  posted_at:                 string | null
  cancelled_at:              string | null
  source_warehouse:  { name: string | null }                | null
  source_sub:        { name: string | null }                | null
  team_sub:          { name: string | null }                | null
  place_sub:         { name: string | null }                | null
  customer:          { name: string | null }                | null
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
  if (row.consumer_type === 'team')          consumer_display = row.team_sub?.name  ?? '(team removed)'
  if (row.consumer_type === 'customer_site') consumer_display = row.place_sub?.name ?? '(place removed)'
  if (row.consumer_type === 'customer')      consumer_display = row.customer?.name ?? '(customer removed)'

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
    consumer_team_sub_id:      row.consumer_team_sub_id,
    consumer_place_sub_id:     row.consumer_place_sub_id,
    consumer_customer_id:      row.consumer_customer_id,
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
  consumer_type, consumer_team_sub_id, consumer_place_sub_id, consumer_customer_id,
  notes, attachments, posted_at, cancelled_at,
  source_warehouse:source_warehouse_id(name),
  source_sub:source_sub_container_id(name),
  team_sub:consumer_team_sub_id(name),
  place_sub:consumer_place_sub_id(name),
  customer:consumer_customer_id(name),
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

// ─── 3. Post mutation ───────────────────────────────────────────────────

export type PostConsumptionLine = { brand_variant_id: string; qty: number }

export function useCreateConsumption() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      source_warehouse_id:      string
      source_sub_container_id:  string
      consumer_type:            ConsumerType
      consumer_team_sub_id?:    string | null
      consumer_place_sub_id?:   string | null
      consumer_customer_id?:    string | null
      notes?:                   string | null
      attachments?:             string[]
      lines:                    PostConsumptionLine[]
    }) => {
      const supabase = createClient()
      // The RPC accepts NULL for the consumer FK / notes params (no NOT NULL
      // constraint), but Supabase's generated types mark them non-nullable.
      // Match the same cast pattern useCustodyMoves.ts / usePlaceSubContainers.ts
      // use elsewhere for the same class of RPCs.
      const rpcArgs = {
        p_source_warehouse_id:     payload.source_warehouse_id,
        p_source_sub_container_id: payload.source_sub_container_id,
        p_consumer_type:           payload.consumer_type,
        p_consumer_team_sub_id:    payload.consumer_team_sub_id  ?? null,
        p_consumer_place_sub_id:   payload.consumer_place_sub_id ?? null,
        p_consumer_customer_id:    payload.consumer_customer_id  ?? null,
        p_notes:                   payload.notes ?? null,
        p_attachments:             payload.attachments ?? [],
        p_lines:                   payload.lines,
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

const BUCKET = 'consumption-attachments'

export async function uploadConsumptionAttachment(file: File): Promise<string> {
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('File too large — maximum 10 MB')
  }
  const supabase = createClient()
  const now = new Date()
  const year  = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${year}/${month}/${now.getTime()}-${sanitized}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file)
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
