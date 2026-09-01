/**
 * Consumption returns (Phase 3b) — hook family for /consumption/returns.
 *
 * Custody consumption = a "sale" of cost, so a posted consumption can be
 * returned: good stock is re-layered and the consumption COGS reversed, damaged
 * stock flows through the shared disposition recorders (write-off / restock as
 * damaged), also reversing the consumption COGS. Reuses so_po_returns /
 * return_lines with source_type='consumption' (migrations 20260831001900/002000)
 * and the source-agnostic rpc_record_inventory_disposition. Mirrors
 * useSaleReturns; no customer / credit-note dimension.
 *
 * Spec: docs/plans/2026-08-29-consumption-sales-returns-warranty-design.md §5.4.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/logActivity'

export type ConsumptionReturnStatus =
  | 'pending' | 'pending_inspection' | 'received' | 'restocked' | 'closed' | 'cancelled'

export type ConsumptionReturnLine = {
  id:                  string
  consumption_line_id: string | null
  brand_variant_id:    string | null
  item_name:           string
  sku:                 string | null
  qty:                 number
  condition:           'good' | 'damaged' | 'inspection' | null
  condition_notes:     string | null
}

export type ConsumptionReturn = {
  id:              string
  return_number:   string
  source_type:     'consumption'
  source_id:       string           // consumption_entries.id
  ce_number:       string | null
  date:            string
  reason:          string
  status:          ConsumptionReturnStatus
  division_id:     string | null
  restock_warehouse_id: string | null
  notes:           string | null
  created_by_name: string | null
  created_at:      string
  restocked_at:    string | null
  return_lines:    ConsumptionReturnLine[]
}

export type ReturnableConsumption = {
  id:            string
  ce_number:     string
  date:          string
  division_id:   string | null
  consumer_type: string
  consumer_display: string | null
  notes:         string | null
}

export type ConsumptionReturnableLine = {
  consumption_line_id: string
  brand_variant_id:    string
  item_name:           string
  sku:                 string | null
  consumed_qty:        number
  already_returned_qty: number
  returnable_qty:      number
}

const KEYS = {
  all:         ['consumption-returns'] as const,
  list:        (f: { search?: string; status?: string }) => ['consumption-returns', 'list', f] as const,
  returnable:  ['consumption-returns', 'returnable-consumptions'] as const,
  lines:       (id: string | null) => ['consumption-returns', 'returnable-lines', id] as const,
}

// ─── List ──────────────────────────────────────────────────────────────────
export function useConsumptionReturns(filters: { search?: string; status?: string } = {}) {
  return useQuery({
    queryKey: KEYS.list(filters),
    queryFn: async (): Promise<ConsumptionReturn[]> => {
      const supabase = createClient()
      let q = supabase
        .from('so_po_returns')
        .select('*, return_lines(*), consumption_entries!so_po_returns_source_id_fkey(ce_number)')
        .eq('source_type', 'consumption' as never)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(500)
      if (filters.status) q = q.eq('status', filters.status as never)
      if (filters.search && filters.search.trim()) {
        q = q.ilike('return_number', `%${filters.search.trim()}%`)
      }
      const { data, error } = await q
      if (error) {
        // The FK-embedded consumption_entries alias may not resolve on older
        // PostgREST caches; fall back to a plain select and stitch ce_number.
        const { data: plain, error: e2 } = await supabase
          .from('so_po_returns')
          .select('*, return_lines(*)')
          .eq('source_type', 'consumption' as never)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(500)
        if (e2) throw e2
        const ids = Array.from(new Set((plain ?? []).map((r) => r.source_id as string)))
        const ceById = new Map<string, string>()
        if (ids.length) {
          const { data: ces } = await supabase
            .from('consumption_entries').select('id, ce_number').in('id', ids)
          for (const ce of ces ?? []) ceById.set(ce.id as string, ce.ce_number as string)
        }
        return ((plain ?? []) as unknown as ConsumptionReturn[]).map((r) => ({
          ...r, ce_number: ceById.get(r.source_id) ?? null,
        }))
      }
      return ((data ?? []) as unknown as Array<ConsumptionReturn & { consumption_entries?: { ce_number: string } | null }>)
        .map((r) => ({ ...r, ce_number: r.consumption_entries?.ce_number ?? null }))
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
}

// ─── Returnable consumptions (posted) ────────────────────────────────────────
export function useReturnableConsumptions() {
  return useQuery({
    queryKey: KEYS.returnable,
    queryFn: async (): Promise<ReturnableConsumption[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('consumption_entries')
        .select('id, ce_number, date, division_id, consumer_type, notes, status')
        .eq('status', 'posted')
        .order('date', { ascending: false })
        .limit(500)
      if (error) throw error
      return ((data ?? []) as Array<Record<string, unknown>>).map((c) => ({
        id: c.id as string,
        ce_number: c.ce_number as string,
        date: c.date as string,
        division_id: (c.division_id as string | null) ?? null,
        consumer_type: c.consumer_type as string,
        consumer_display: null,
        notes: (c.notes as string | null) ?? null,
      }))
    },
    staleTime: 60_000,
  })
}

// ─── Returnable lines for a consumption ──────────────────────────────────────
export function useConsumptionReturnableLines(consumptionId: string | null) {
  return useQuery({
    queryKey: KEYS.lines(consumptionId),
    enabled: !!consumptionId,
    queryFn: async (): Promise<ConsumptionReturnableLine[]> => {
      const supabase = createClient()
      const { data: lines, error } = await supabase
        .from('consumption_lines')
        .select('id, brand_variant_id, item_name, sku, qty')
        .eq('consumption_id', consumptionId!)
      if (error) throw error
      const lineIds = (lines ?? []).map((l) => l.id as string)
      // Already-returned per consumption_line_id (exclude cancelled returns).
      const returnedByLine = new Map<string, number>()
      if (lineIds.length) {
        const { data: rls, error: e2 } = await supabase
          .from('return_lines')
          .select('consumption_line_id, qty, so_po_returns!inner(status)')
          .in('consumption_line_id' as never, lineIds)
        if (e2) throw e2
        for (const rl of ((rls ?? []) as unknown as Array<{ consumption_line_id: string | null; qty: number; so_po_returns: { status: string } | null }>)) {
          if (!rl.consumption_line_id) continue
          if (rl.so_po_returns?.status === 'cancelled') continue
          returnedByLine.set(rl.consumption_line_id, (returnedByLine.get(rl.consumption_line_id) ?? 0) + rl.qty)
        }
      }
      return (lines ?? []).map((l) => {
        const consumed = l.qty as number
        const returned = returnedByLine.get(l.id as string) ?? 0
        return {
          consumption_line_id: l.id as string,
          brand_variant_id: l.brand_variant_id as string,
          item_name: l.item_name as string,
          sku: (l.sku as string | null) ?? null,
          consumed_qty: consumed,
          already_returned_qty: returned,
          returnable_qty: Math.max(0, consumed - returned),
        }
      })
    },
    staleTime: 15_000,
  })
}

// ─── Create ──────────────────────────────────────────────────────────────────
export function useCreateConsumptionReturn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      source_id: string        // consumption_entries.id
      date: string
      reason: string
      restock_warehouse_id: string | null
      notes: string | null
      items: {
        consumption_line_id: string
        brand_variant_id: string
        item_name: string
        sku: string | null
        qty: number
        condition: 'good' | 'damaged'
        condition_notes?: string | null
      }[]
    }) => {
      const supabase = createClient()
      if (payload.items.length === 0) throw new Error('Add at least one line to return')

      // Division is stamped from the consumption so the dispositions / restock
      // can resolve a sub-container (there is no sale-order fallback).
      const { data: ce, error: ceErr } = await supabase
        .from('consumption_entries').select('division_id').eq('id', payload.source_id).single()
      if (ceErr) throw ceErr

      const { count } = await supabase
        .from('so_po_returns')
        .select('*', { count: 'exact', head: true })
        .eq('source_type', 'consumption' as never)
      const return_number = `CR-${String((count ?? 0) + 1).padStart(5, '0')}`

      const { data: { user } } = await supabase.auth.getUser()
      let createdById: string | null = null
      let createdByName: string | null = null
      if (user) {
        const { data: profile } = await supabase
          .from('user_data').select('id, full_name').eq('auth_user_id', user.id).maybeSingle()
        createdById = profile?.id ?? null
        createdByName = profile?.full_name ?? null
      }

      const { data, error } = await supabase
        .from('so_po_returns')
        .insert({
          return_number,
          source_type: 'consumption',
          source_id: payload.source_id,
          date: payload.date,
          reason: payload.reason,
          restock_warehouse_id: payload.restock_warehouse_id,
          notes: payload.notes,
          status: 'pending',
          division_id: (ce as { division_id: string | null }).division_id,
          created_by: createdById,
          created_by_name: createdByName,
        } as never)
        .select()
        .single()
      if (error) throw error

      const { error: linesErr } = await supabase
        .from('return_lines')
        .insert(payload.items.map((it) => ({
          return_id: (data as { id: string }).id,
          item_name: it.item_name,
          sku: it.sku,
          qty: it.qty,
          condition: it.condition,
          brand_variant_id: it.brand_variant_id,
          condition_notes: it.condition_notes ?? null,
          consumption_line_id: it.consumption_line_id,
        })) as never)
      if (linesErr) throw linesErr

      return data as unknown as ConsumptionReturn
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      void logActivity({
        action: 'Consumption Return Created',
        module: 'consumption',
        entity_id: (data as { source_id: string }).source_id,
        entity_type: 'consumption_return',
        details: (data as { return_number: string }).return_number,
      })
    },
  })
}

// ─── Complete inspection (split good / damaged) ───────────────────────────────
// A consumption return can arrive as pending_inspection with a single
// condition='inspection' line — this is how a covered consumption warranty claim
// resolves (rpc_start_warranty_claim_resolution, Phase 4). The operator splits
// it into good / damaged and picks the warehouse the good stock returns to; the
// source-agnostic rpc_complete_return_inspection carries consumption_line_id onto
// the split lines and moves the return to 'received' so Restock / Disposition can
// take over.
export function useCompleteConsumptionReturnInspection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      returnId: string
      splits: { return_line_id: string; good_qty: number; damaged_qty: number; condition_notes?: string | null }[]
      restockWarehouseId: string | null
    }) => {
      const supabase = createClient()
      const { error } = await supabase.rpc('rpc_complete_return_inspection', {
        p_return_id: v.returnId,
        p_splits: v.splits as unknown as import('@/types/database.types').Json,
        p_restock_warehouse_id: v.restockWarehouseId ?? undefined,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  })
}

// ─── Restock good lines ──────────────────────────────────────────────────────
export function useProcessConsumptionReturnRestock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (returnId: string) => {
      const supabase = createClient()
      const { error } = await supabase.rpc(
        'rpc_process_consumption_return_restock' as never,
        { p_return_id: returnId } as never,
      )
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  })
}

// ─── Record dispositions on damaged lines (write_off / restock_as_damaged) ────
export function useRecordConsumptionReturnDisposition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      returnId: string
      warehouseId: string
      dispositions: { return_line_id: string; type: 'write_off' | 'restock_as_damaged'; qty: number; notes?: string | null }[]
    }) => {
      const supabase = createClient()
      const { error } = await supabase.rpc('rpc_record_inventory_disposition', {
        p_return_id: v.returnId,
        p_warehouse_id: v.warehouseId,
        p_dispositions: v.dispositions as never,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  })
}

// ─── Cancel ──────────────────────────────────────────────────────────────────
export function useCancelConsumptionReturn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (returnId: string) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('so_po_returns')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() } as never)
        .eq('id', returnId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  })
}
