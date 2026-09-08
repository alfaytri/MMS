import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { notifyOwnerAndKey } from '@/lib/notify'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ShipmentMode = 'air' | 'sea' | 'land' | 'manual'
export type ShipmentStatus = 'booked' | 'in_transit' | 'customs' | 'delivered' | 'delayed'
export type ScheduleLeg = 'etd' | 'eta'
export type ScheduleRevisionType = 'original' | 'updated' | 'actual'

export type ShipmentEvent = {
  date: string
  title: string                 // short label ("Departed Ningbo", "Documents submitted")
  location?: string             // optional — freeform (non-port) events omit it
  status?: string
  notes?: string
  normalizedTimestamp?: string  // 17track auto-sync
  hash?: string                 // 17track auto-sync
}

export type ShipmentPoSummary = { po_id: string; po_number: string; supplier_name: string | null }

export type Shipment = {
  id: string
  shipment_number: string
  tracking_number: string | null
  mode: ShipmentMode
  carrier: string | null
  status: ShipmentStatus
  etd: string | null            // current planned (trigger-cached)
  eta: string | null
  etd_actual: string | null
  eta_actual: string | null
  events: ShipmentEvent[]
  archived: boolean
  is_syncing: boolean
  last_synced_at: string | null
  sync_error: string | null
  created_at: string
  // derived
  pos: ShipmentPoSummary[]
  lineCount: number
}

export type ShipmentLine = {
  id: string
  po_line_item_id: string
  qty: number
  po_id: string
  po_number: string
  supplier_name: string | null
  item_name: string
  sku: string | null
  po_qty: number
}

export type ScheduleRevision = {
  id: string
  leg: ScheduleLeg
  revision_type: ScheduleRevisionType
  date_value: string
  reason: string | null
  created_at: string
}

export type ShipmentDetail = { shipment: Shipment; lines: ShipmentLine[]; revisions: ScheduleRevision[] }

export type CreateShipmentPayload = {
  mode: ShipmentMode
  tracking_number?: string | null
  carrier?: string | null
  lines: { po_line_item_id: string; qty: number }[]
  etd_original?: string | null
  etd_reason?: string | null
}

export type ShippablePo = { id: string; po_number: string; supplier_name: string | null; created_at: string; status: string }

// ─── Loose access for objects not yet in the generated Database types ───────────
// A full `gen types` regen is deferred (the staging types have drifted), so the
// new tables (shipment_line_items, shipment_schedule_revisions) and the
// create_shipment RPC are reached through these loose handles; every result is
// cast to the explicit row types above. Mirrors the codebase's existing
// "cast until types are regenerated" pattern (see useInventoryReceivals).
type LooseResult = { data: unknown; error: { message: string } | null }
type LooseQuery = {
  select: (q?: string) => LooseQuery
  insert: (v: unknown) => LooseQuery
  update: (v: unknown) => LooseQuery
  delete: () => LooseQuery
  eq: (c: string, v: unknown) => LooseQuery
  in: (c: string, v: readonly unknown[]) => LooseQuery
  order: (c: string, o?: { ascending?: boolean }) => LooseQuery
  limit: (n: number) => LooseQuery
  single: () => Promise<LooseResult>
  then: <R>(f: (v: LooseResult) => R) => Promise<R>
}
function looseFrom(table: string): LooseQuery {
  return (createClient().from as unknown as (t: string) => LooseQuery)(table)
}
async function looseRpc(fn: string, args: Record<string, unknown>): Promise<LooseResult> {
  return (createClient().rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<LooseResult>)(fn, args)
}

// ─── Raw row shapes (list/detail nested selects) ────────────────────────────────

type RawPoLine = {
  id: string; po_id: string; item_name: string; sku: string | null; qty: number
  purchase_orders: { po_number: string; supplier_name: string | null } | null
}
type RawShipmentLine = { id: string; qty: number; po_line_items: RawPoLine | null }
type RawShipment = {
  id: string; shipment_number: string; tracking_number: string | null; mode: ShipmentMode
  carrier: string | null; status: ShipmentStatus; etd: string | null; eta: string | null
  etd_actual: string | null; eta_actual: string | null; events: ShipmentEvent[] | null
  archived: boolean; is_syncing: boolean; last_synced_at: string | null; sync_error: string | null
  created_at: string; shipment_line_items: RawShipmentLine[] | null
}

const SHIPMENT_SELECT =
  'id, shipment_number, tracking_number, mode, carrier, status, etd, eta, etd_actual, eta_actual, events, archived, is_syncing, last_synced_at, sync_error, created_at, ' +
  'shipment_line_items( id, qty, po_line_items( id, po_id, item_name, sku, qty, purchase_orders( po_number, supplier_name ) ) )'

function mapShipment(r: RawShipment): Shipment {
  const posMap = new Map<string, ShipmentPoSummary>()
  for (const sli of r.shipment_line_items ?? []) {
    const pli = sli.po_line_items
    if (pli && !posMap.has(pli.po_id)) {
      posMap.set(pli.po_id, { po_id: pli.po_id, po_number: pli.purchase_orders?.po_number ?? '—', supplier_name: pli.purchase_orders?.supplier_name ?? null })
    }
  }
  return {
    id: r.id, shipment_number: r.shipment_number, tracking_number: r.tracking_number, mode: r.mode,
    carrier: r.carrier, status: r.status, etd: r.etd, eta: r.eta, etd_actual: r.etd_actual, eta_actual: r.eta_actual,
    events: r.events ?? [], archived: r.archived, is_syncing: r.is_syncing, last_synced_at: r.last_synced_at,
    sync_error: r.sync_error, created_at: r.created_at,
    pos: Array.from(posMap.values()), lineCount: (r.shipment_line_items ?? []).length,
  }
}

// ─── List ───────────────────────────────────────────────────────────────────────

export function useShipments({ archived = false, search = '' }: { archived?: boolean; search?: string } = {}) {
  return useQuery({
    queryKey: queryKeys.shipments.list(archived, search),
    queryFn: async (): Promise<Shipment[]> => {
      const { data, error } = (await looseFrom('shipments')
        .select(SHIPMENT_SELECT)
        .eq('archived', archived)
        .order('created_at', { ascending: false })) as LooseResult
      if (error) throw new Error(error.message)
      let rows = (data as RawShipment[] ?? []).map(mapShipment)
      const s = search.trim().toLowerCase()
      if (s) {
        rows = rows.filter((r) =>
          r.shipment_number.toLowerCase().includes(s) ||
          (r.tracking_number ?? '').toLowerCase().includes(s) ||
          (r.carrier ?? '').toLowerCase().includes(s) ||
          r.pos.some((p) => p.po_number.toLowerCase().includes(s) || (p.supplier_name ?? '').toLowerCase().includes(s)),
        )
      }
      return rows
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ─── Detail ───────────────────────────────────────────────────────────────────

export function useShipmentDetail(id: string | null) {
  return useQuery({
    queryKey: queryKeys.shipments.detail(id),
    enabled: !!id,
    queryFn: async (): Promise<ShipmentDetail> => {
      const { data, error } = (await looseFrom('shipments')
        .select(SHIPMENT_SELECT)
        .eq('id', id!)
        .single()) as LooseResult
      if (error) throw new Error(error.message)
      const raw = data as RawShipment
      const shipment = mapShipment(raw)
      const lines: ShipmentLine[] = (raw.shipment_line_items ?? []).flatMap((sli) => {
        const pli = sli.po_line_items
        if (!pli) return []
        return [{
          id: sli.id, po_line_item_id: pli.id, qty: sli.qty, po_id: pli.po_id,
          po_number: pli.purchase_orders?.po_number ?? '—', supplier_name: pli.purchase_orders?.supplier_name ?? null,
          item_name: pli.item_name, sku: pli.sku, po_qty: pli.qty,
        }]
      })
      const { data: revData, error: revErr } = (await looseFrom('shipment_schedule_revisions')
        .select('id, leg, revision_type, date_value, reason, created_at')
        .eq('shipment_id', id!)
        .order('created_at', { ascending: true })) as LooseResult
      if (revErr) throw new Error(revErr.message)
      return { shipment, lines, revisions: (revData as ScheduleRevision[]) ?? [] }
    },
  })
}

// ─── PO picker data (searchable, scoped to shippable POs) ───────────────────────

export function useShippablePurchaseOrders(search: string) {
  return useQuery({
    queryKey: queryKeys.shipments.shippablePos(search),
    queryFn: async (): Promise<ShippablePo[]> => {
      const supabase = createClient()
      let q = supabase
        .from('purchase_orders')
        .select('id, po_number, supplier_name, created_at, status')
        .in('status', ['approved', 'partially_received'])
        .order('created_at', { ascending: false })
        .limit(50)
      const s = search.trim()
      if (s) q = q.or(`po_number.ilike.%${s}%,supplier_name.ilike.%${s}%`)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as ShippablePo[]
    },
    staleTime: 60 * 1000,
  })
}

/** Total qty of each PO line already shipped across every shipment (for the remaining-un-shipped default). */
export function useLineShippedElsewhere(poLineIds: string[]) {
  return useQuery({
    queryKey: queryKeys.shipments.shippedByLine(poLineIds),
    enabled: poLineIds.length > 0,
    queryFn: async (): Promise<Map<string, number>> => {
      const { data, error } = (await looseFrom('shipment_line_items')
        .select('po_line_item_id, qty')
        .in('po_line_item_id', poLineIds)) as LooseResult
      if (error) throw new Error(error.message)
      const m = new Map<string, number>()
      for (const row of (data as { po_line_item_id: string; qty: number }[]) ?? []) {
        m.set(row.po_line_item_id, (m.get(row.po_line_item_id) ?? 0) + row.qty)
      }
      return m
    },
    staleTime: 30 * 1000,
  })
}

// ─── Mutations ──────────────────────────────────────────────────────────────────

export function useCreateShipment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateShipmentPayload): Promise<Shipment> => {
      const { data, error } = await looseRpc('create_shipment', {
        p_mode: payload.mode,
        p_tracking_number: payload.tracking_number || null,
        p_carrier: payload.carrier || null,
        p_lines: payload.lines,
        p_etd_original: payload.etd_original || null,
        p_etd_reason: payload.etd_reason || null,
      })
      if (error) throw new Error(error.message)
      return data as Shipment
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.shipments.all }),
  })
}

export function useAddShipmentLines() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ shipment_id, lines }: { shipment_id: string; lines: { po_line_item_id: string; qty: number }[] }) => {
      const { error } = (await looseFrom('shipment_line_items')
        .insert(lines.map((l) => ({ shipment_id, po_line_item_id: l.po_line_item_id, qty: l.qty })))) as LooseResult
      if (error) throw new Error(error.message)
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: queryKeys.shipments.all }); qc.invalidateQueries({ queryKey: queryKeys.shipments.detail(v.shipment_id) }) },
  })
}

export function useUpdateShipmentLineQty() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, qty }: { id: string; qty: number; shipment_id: string }) => {
      const { error } = (await looseFrom('shipment_line_items').update({ qty }).eq('id', id)) as LooseResult
      if (error) throw new Error(error.message)
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: queryKeys.shipments.all }); qc.invalidateQueries({ queryKey: queryKeys.shipments.detail(v.shipment_id) }) },
  })
}

export function useRemoveShipmentLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; shipment_id: string }) => {
      const { error } = (await looseFrom('shipment_line_items').delete().eq('id', id)) as LooseResult
      if (error) throw new Error(error.message)
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: queryKeys.shipments.all }); qc.invalidateQueries({ queryKey: queryKeys.shipments.detail(v.shipment_id) }) },
  })
}

export function useAddScheduleRevision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { shipment_id: string; leg: ScheduleLeg; revision_type: ScheduleRevisionType; date_value: string; reason?: string | null }) => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = (await looseFrom('shipment_schedule_revisions').insert({
        shipment_id: v.shipment_id, leg: v.leg, revision_type: v.revision_type,
        date_value: v.date_value, reason: v.reason?.trim() || null, created_by: user?.id ?? null,
      })) as LooseResult
      if (error) throw new Error(error.message)
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: queryKeys.shipments.all }); qc.invalidateQueries({ queryKey: queryKeys.shipments.detail(v.shipment_id) }) },
  })
}

export function useAddShipmentEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, event, currentEvents }: { id: string; event: ShipmentEvent; currentEvents: ShipmentEvent[] }) => {
      const { error } = (await looseFrom('shipments').update({ events: [...currentEvents, event] }).eq('id', id)) as LooseResult
      if (error) throw new Error(error.message)
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: queryKeys.shipments.all }); qc.invalidateQueries({ queryKey: queryKeys.shipments.detail(v.id) }) },
  })
}

export function useUpdateShipmentStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ShipmentStatus }) => {
      const { error } = (await looseFrom('shipments').update({ status }).eq('id', id)) as LooseResult
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.shipments.all })
      qc.invalidateQueries({ queryKey: queryKeys.shipments.detail(variables.id) })
      // Delay/customs → notify EVERY linked PO's owner (best-effort). Resolves the
      // POs through the shipment's lines (po_id is being retired).
      if (variables.status === 'delayed' || variables.status === 'customs') {
        void (async () => {
          const { data } = (await looseFrom('shipment_line_items')
            .select('po_line_items( purchase_orders( id, po_number, created_by ) )')
            .eq('shipment_id', variables.id)) as LooseResult
          type Row = { po_line_items: { purchase_orders: { id: string; po_number: string; created_by: string | null } | null } | null }
          const seen = new Set<string>()
          const pos: { id: string; po_number: string; created_by: string | null }[] = []
          for (const row of (data as Row[]) ?? []) {
            const po = row.po_line_items?.purchase_orders
            if (po && !seen.has(po.id)) { seen.add(po.id); pos.push(po) }
          }
          const label = variables.status === 'customs' ? 'held at customs' : 'delayed'
          const poNumbers = pos.map((p) => p.po_number).filter(Boolean).join(', ')
          const owners = Array.from(new Set(pos.map((p) => p.created_by).filter((x): x is string => !!x)))
          for (const owner of owners) {
            await notifyOwnerAndKey(
              owner, 'notify.purchase.shipment_delayed', 'shipment_delayed',
              `Shipment ${label}${poNumbers ? ` — PO ${poNumbers}` : ''}`,
              { relatedId: variables.id, relatedType: 'shipment' },
            )
          }
        })()
      }
    },
  })
}

export function useDeleteShipment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = (await looseFrom('shipments').delete().eq('id', id)) as LooseResult
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.shipments.all }),
  })
}
