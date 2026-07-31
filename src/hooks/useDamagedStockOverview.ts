/**
 * Phase 9.7 — Damaged-stock overview hooks + return-from-repair mutation.
 *
 * Three read hooks power the `/warehouse/damaged-stock` page tabs:
 *   - useDamagedOnHand     → current damaged inventory (per warehouse × variant)
 *   - useOutForRepair      → in-transit damaged_repair_out transfers
 *   - useDamagedMovements  → last 200 damaged-stock ledger movements
 *
 * The mutation hook wraps `rpc_return_damaged_from_repair` (from 9.5 / 9.6 / 9.7)
 * and invalidates the three read hooks + warehouse_transfers list + the good-
 * stock cache (good units land back in inventory_stock, weighted-avg changes).
 *
 * All list queries are capped per docs/supabase-budget.md. Display labels
 * are derived from `inventory_items.name_en` + `.sku` (variant `code`
 * appended when present) so the UI never renders a raw UUID (per Dropdown
 * UUID Guard — same rule applies to non-Select displays).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

// ─── shared display-name helper ─────────────────────────────────────────
type BrandVariantJoin = {
  brand: string | null
  code: string | null
  inventory_items: { name_en: string | null; sku: string | null } | null
} | null

function itemLabelFromJoin(bv: BrandVariantJoin): { name: string; sku: string } {
  const baseName = bv?.inventory_items?.name_en ?? ''
  const brand    = bv?.brand ?? ''
  const name     = brand ? `${baseName} — ${brand}` : baseName || 'Unknown item'
  const baseSku  = bv?.inventory_items?.sku ?? ''
  const code     = bv?.code ?? ''
  const sku      = baseSku && code ? `${baseSku}-${code}` : baseSku || code || ''
  return { name, sku }
}

// ─── 1. On-hand damaged stock ───────────────────────────────────────────
export type DamagedOnHandRow = {
  key: string                // synthetic (warehouse_id + brand_variant_id — table has composite PK, no `id`)
  warehouse_id: string
  warehouse_name: string
  brand_variant_id: string
  item_name: string
  sku: string
  qty: number
  weighted_unit_cost: number
  updated_at: string
}

export function useDamagedOnHand() {
  return useQuery({
    queryKey: queryKeys.damagedStock.all,
    queryFn: async (): Promise<DamagedOnHandRow[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_damaged_stock')
        .select(`
          warehouse_id,
          brand_variant_id,
          qty,
          weighted_unit_cost,
          updated_at,
          warehouses ( name ),
          inventory_item_brand_variants (
            brand,
            code,
            inventory_items ( name_en, sku )
          )
        `)
        .gt('qty', 0)
        .limit(500)
      if (error) throw error

      const rows = (data ?? []).map((r: any): DamagedOnHandRow => {
        const label = itemLabelFromJoin(r.inventory_item_brand_variants as BrandVariantJoin)
        return {
          key:                `${r.warehouse_id}:${r.brand_variant_id}`,
          warehouse_id:       r.warehouse_id,
          warehouse_name:     r.warehouses?.name ?? '—',
          brand_variant_id:   r.brand_variant_id,
          item_name:          label.name,
          sku:                label.sku,
          qty:                Number(r.qty ?? 0),
          weighted_unit_cost: Number(r.weighted_unit_cost ?? 0),
          updated_at:         r.updated_at,
        }
      })
      rows.sort((a, b) =>
        a.warehouse_name.localeCompare(b.warehouse_name) ||
        a.item_name.localeCompare(b.item_name),
      )
      return rows
    },
    staleTime: 60_000,
  })
}

// ─── 2. Out-for-repair transfers ────────────────────────────────────────
export type OutForRepairRow = {
  transfer_id: string
  transfer_number: string
  from_warehouse_id: string
  from_warehouse_name: string
  to_warehouse_id: string          // vendor virtual warehouse
  repair_vendor_id: string | null
  repair_vendor_name: string
  expected_return_date: string | null
  dispatched_at: string | null
  source_return_line_disposition_id: string | null
  brand_variant_id: string
  item_name: string
  sku: string
  qty: number
  unit_cost: number
}

export function useOutForRepair() {
  return useQuery({
    queryKey: queryKeys.damagedStock.outForRepairAll,
    queryFn: async (): Promise<OutForRepairRow[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('warehouse_transfers')
        .select(`
          id,
          transfer_number,
          from_warehouse_id,
          to_warehouse_id,
          repair_vendor_id,
          expected_return_date,
          dispatched_at,
          source_return_line_disposition_id,
          warehouses!warehouse_transfers_from_warehouse_id_fkey ( name ),
          repair_vendors ( name ),
          warehouse_transfer_items!inner (
            brand_variant_id,
            item_name,
            sku,
            requested_qty,
            unit_cost,
            inventory_item_brand_variants (
              brand,
              code,
              inventory_items ( name_en, sku )
            )
          )
        `)
        .eq('transfer_kind', 'damaged_repair_out')
        .eq('status', 'in_transit')
        .order('dispatched_at', { ascending: false })
        .limit(500)
      if (error) throw error

      const out: OutForRepairRow[] = []
      for (const r of (data ?? []) as any[]) {
        const items = Array.isArray(r.warehouse_transfer_items) ? r.warehouse_transfer_items : []
        for (const it of items) {
          const bvLabel = itemLabelFromJoin(it.inventory_item_brand_variants as BrandVariantJoin)
          out.push({
            transfer_id:        r.id,
            transfer_number:    r.transfer_number ?? '',
            from_warehouse_id:  r.from_warehouse_id,
            from_warehouse_name: r.warehouses?.name ?? '—',
            to_warehouse_id:    r.to_warehouse_id,
            repair_vendor_id:   r.repair_vendor_id,
            repair_vendor_name: r.repair_vendors?.name ?? '—',
            expected_return_date: r.expected_return_date,
            dispatched_at:      r.dispatched_at,
            source_return_line_disposition_id: r.source_return_line_disposition_id,
            brand_variant_id:   it.brand_variant_id,
            item_name:          it.item_name || bvLabel.name,
            sku:                it.sku || bvLabel.sku,
            qty:                Number(it.requested_qty ?? 0),
            unit_cost:          Number(it.unit_cost ?? 0),
          })
        }
      }
      return out
    },
    staleTime: 60_000,
  })
}

// ─── 3. Damaged-stock movements ─────────────────────────────────────────
export type DamagedMovementRow = {
  id: string
  created_at: string
  movement_type: string
  qty: number
  warehouse_id: string
  warehouse_name: string
  brand_variant_id: string
  item_name: string
  sku: string
  unit_cost: number
  notes: string | null
  source_return_line_disposition_id: string | null
  source_transfer_id: string | null
}

export function useDamagedMovements() {
  return useQuery({
    queryKey: queryKeys.damagedStock.movementsAll,
    queryFn: async (): Promise<DamagedMovementRow[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_damaged_movements')
        .select(`
          id,
          created_at,
          movement_type,
          qty,
          warehouse_id,
          brand_variant_id,
          unit_cost,
          notes,
          source_return_line_disposition_id,
          source_transfer_id,
          warehouses ( name ),
          inventory_item_brand_variants (
            brand,
            code,
            inventory_items ( name_en, sku )
          )
        `)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error

      return (data ?? []).map((r: any): DamagedMovementRow => {
        const label = itemLabelFromJoin(r.inventory_item_brand_variants as BrandVariantJoin)
        return {
          id:               r.id,
          created_at:       r.created_at,
          movement_type:    r.movement_type,
          qty:              Number(r.qty ?? 0),
          warehouse_id:     r.warehouse_id,
          warehouse_name:   r.warehouses?.name ?? '—',
          brand_variant_id: r.brand_variant_id,
          item_name:        label.name,
          sku:              label.sku,
          unit_cost:        Number(r.unit_cost ?? 0),
          notes:            r.notes ?? null,
          source_return_line_disposition_id: r.source_return_line_disposition_id,
          source_transfer_id: r.source_transfer_id,
        }
      })
    },
    staleTime: 60_000,
  })
}

// ─── 3b. Pending vendor assignment (send_for_repair without a transfer) ─
// Dispositions land here when the operator picked "Send for repair" in the
// ReplacementDeliveryDialog but hasn't chosen a vendor yet. warehouse_transfer_id
// is null until vendor + expected date get picked via SendForRepairDialog.
export type PendingRepairAssignmentRow = {
  disposition_id:    string
  return_id:         string
  return_number:     string
  warehouse_id:      string
  warehouse_name:    string
  brand_variant_id:  string | null
  item_name:         string
  sku:               string
  qty:               number
  created_at:        string
}

export function usePendingRepairAssignments() {
  return useQuery({
    queryKey: queryKeys.damagedStock.pendingRepairAssignmentAll,
    queryFn: async (): Promise<PendingRepairAssignmentRow[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('return_line_inventory_dispositions')
        .select(`
          id,
          qty,
          created_at,
          return_lines!inner (
            item_name,
            sku,
            brand_variant_id,
            return_id,
            so_po_returns!inner (
              return_number,
              restock_warehouse_id,
              warehouses:restock_warehouse_id ( name )
            )
          )
        `)
        .eq('disposition_type', 'send_for_repair')
        .is('warehouse_transfer_id', null)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error

      return (data ?? []).map((r: any): PendingRepairAssignmentRow => {
        const rl = r.return_lines
        const ret = rl?.so_po_returns
        return {
          disposition_id:   r.id,
          return_id:        rl?.return_id ?? '',
          return_number:    ret?.return_number ?? '—',
          warehouse_id:     ret?.restock_warehouse_id ?? '',
          warehouse_name:   ret?.warehouses?.name ?? '—',
          brand_variant_id: rl?.brand_variant_id ?? null,
          item_name:        rl?.item_name ?? 'Unknown item',
          sku:              rl?.sku ?? '',
          qty:              Number(r.qty ?? 0),
          created_at:       r.created_at,
        }
      }).filter((r) => r.warehouse_id !== '')  // safety: skip malformed rows
    },
    staleTime: 60_000,
  })
}

// ─── 4. Return-from-repair mutation ─────────────────────────────────────
export type ReturnFromRepairPayload = {
  transferId:   string
  outcome:      'good' | 'writeoff' | 'mixed'
  qtyGood:      number
  qtyWriteoff:  number
  repairCost?:  number | null
  notes?:       string | null
}

export function useReturnFromRepair() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: ReturnFromRepairPayload) => {
      const supabase = createClient()
      const { error } = await supabase.rpc('rpc_return_damaged_from_repair', {
        p_transfer_id:  payload.transferId,
        p_outcome:      payload.outcome,
        p_qty_good:     payload.qtyGood,
        p_qty_writeoff: payload.qtyWriteoff,
        p_repair_cost:  payload.repairCost ?? 0,
        p_notes:        payload.notes ?? undefined,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.damagedStock.all })
      qc.invalidateQueries({ queryKey: queryKeys.damagedStock.movementsAll })
      qc.invalidateQueries({ queryKey: queryKeys.damagedStock.outForRepairAll })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseTransfers })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseStockAll })
    },
  })
}
