import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { computeDelay, type ReportShipment, type ReportPO, type ReportPoComment } from '@/lib/shipments/report'
import type { ShipmentStatus, ShipmentMode, ShipmentEvent } from '@/hooks/useShipments'

// Shipment tables aren't in the generated Database types yet (see useShipments.ts),
// so they're reached through a loose handle; PO / approvals / payments use the
// typed client. Everything is cast to the explicit report row types.
type LooseResult = { data: unknown; error: { message: string } | null }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function looseFrom(t: string): any { return (createClient().from as unknown as (t: string) => unknown)(t) }

const SELECT =
  'id, shipment_number, tracking_number, mode, carrier, status, etd, eta, etd_actual, eta_actual, events, created_at, ' +
  'shipment_line_items( id, qty, po_line_items( id, po_id, item_name, sku, qty, purchase_orders( po_number, supplier_name ) ) ), ' +
  'shipment_po_comments( po_id, comment, created_by_name, created_at )'

type RawPoLine = { id: string; po_id: string; item_name: string; sku: string | null; qty: number; purchase_orders: { po_number: string; supplier_name: string | null } | null }
type RawLine = { id: string; qty: number; po_line_items: RawPoLine | null }
type RawComment = { po_id: string; comment: string; created_by_name: string | null; created_at: string }
type RawShip = {
  id: string; shipment_number: string; tracking_number: string | null; mode: ShipmentMode; carrier: string | null
  status: ShipmentStatus; etd: string | null; eta: string | null; etd_actual: string | null; eta_actual: string | null
  events: ShipmentEvent[] | null; created_at: string; shipment_line_items: RawLine[] | null
  shipment_po_comments: RawComment[] | null
}

function currentLocation(events: ShipmentEvent[]): string | null {
  const withLoc = [...events].filter((e) => !!e.location)
    .sort((a, b) => new Date(b.normalizedTimestamp ?? b.date).getTime() - new Date(a.normalizedTimestamp ?? a.date).getTime())
  return withLoc[0]?.location ?? null
}

export function useShipmentReport() {
  return useQuery({
    queryKey: ['shipment-report'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ReportShipment[]> => {
      const { data: shipRaw, error } = (await looseFrom('shipments')
        .select(SELECT).eq('archived', false).order('created_at', { ascending: false })) as LooseResult
      if (error) throw new Error(error.message)
      const ships = (shipRaw as RawShip[]) ?? []
      if (!ships.length) return []

      const shipIds = ships.map((s) => s.id)
      const poIds = Array.from(new Set(
        ships.flatMap((s) => (s.shipment_line_items ?? []).map((l) => l.po_line_items?.po_id).filter((x): x is string => !!x)),
      ))

      // Schedule revisions → original ETA + latest ETA-change reason, per shipment.
      const revByShip = new Map<string, { leg: string; revision_type: string; date_value: string; reason: string | null }[]>()
      const { data: revs } = (await looseFrom('shipment_schedule_revisions')
        .select('shipment_id, leg, revision_type, date_value, reason, created_at')
        .in('shipment_id', shipIds).order('created_at', { ascending: true })) as LooseResult
      for (const r of (revs as ({ shipment_id: string } & { leg: string; revision_type: string; date_value: string; reason: string | null })[]) ?? []) {
        const arr = revByShip.get(r.shipment_id) ?? []
        arr.push(r); revByShip.set(r.shipment_id, arr)
      }

      // PO financials + approval date + paid total (typed tables).
      const supabase = createClient()
      const poMeta = new Map<string, { requested: string | null; value: number | null }>()
      const approvedByPo = new Map<string, string>()
      const paidByPo = new Map<string, number>()
      if (poIds.length) {
        const { data: pos } = await supabase.from('purchase_orders').select('id, created_date, total_qar').in('id', poIds)
        for (const p of (pos ?? []) as { id: string; created_date: string | null; total_qar: number | null }[]) {
          poMeta.set(p.id, { requested: p.created_date, value: p.total_qar })
        }
        const { data: apps } = await supabase.from('po_approvals').select('po_id, date, status').in('po_id', poIds).eq('status', 'approved')
        for (const a of (apps ?? []) as { po_id: string; date: string | null }[]) {
          if (a.date && (!approvedByPo.has(a.po_id) || a.date > approvedByPo.get(a.po_id)!)) approvedByPo.set(a.po_id, a.date)
        }
        const { data: pays } = await supabase.from('payments').select('source_id, amount_qar, amount')
          .eq('source_type', 'purchase_order').in('source_id', poIds).is('deleted_at', null)
        for (const p of (pays ?? []) as { source_id: string; amount_qar: number | null; amount: number | null }[]) {
          paidByPo.set(p.source_id, (paidByPo.get(p.source_id) ?? 0) + (p.amount_qar ?? p.amount ?? 0))
        }
      }

      return ships.map((s): ReportShipment => {
        const srevs = revByShip.get(s.id) ?? []
        const etaOriginal = srevs.find((r) => r.leg === 'eta' && r.revision_type === 'original')?.date_value ?? null
        const etaUpdates = srevs.filter((r) => r.leg === 'eta' && r.revision_type === 'updated' && r.reason)
        const delayReason = etaUpdates.length ? etaUpdates[etaUpdates.length - 1].reason : null

        // Per-PO comment cards (newest first) for this shipment.
        const cmtByPo = new Map<string, ReportPoComment[]>()
        for (const c of s.shipment_po_comments ?? []) {
          const a = cmtByPo.get(c.po_id) ?? []
          a.push({ comment: c.comment, by: c.created_by_name, at: c.created_at })
          cmtByPo.set(c.po_id, a)
        }
        for (const a of cmtByPo.values()) a.sort((x, y) => y.at.localeCompare(x.at))

        const poMap = new Map<string, ReportPO>()
        for (const l of s.shipment_line_items ?? []) {
          const pli = l.po_line_items
          if (!pli) continue
          let po = poMap.get(pli.po_id)
          if (!po) {
            const meta = poMeta.get(pli.po_id)
            const value = meta?.value ?? null
            const paid = paidByPo.get(pli.po_id) ?? 0
            po = {
              po_id: pli.po_id, po_number: pli.purchase_orders?.po_number ?? '—', supplier_name: pli.purchase_orders?.supplier_name ?? null,
              requested: meta?.requested ?? null, approved: approvedByPo.get(pli.po_id) ?? null,
              value_qar: value, balance_qar: value != null ? value - paid : null, items: [],
              comments: cmtByPo.get(pli.po_id) ?? [],
            }
            poMap.set(pli.po_id, po)
          }
          po.items.push({ name: pli.item_name, sku: pli.sku, qty: l.qty, po_qty: pli.qty })
        }

        return {
          id: s.id, shipment_number: s.shipment_number, status: s.status, mode: s.mode, carrier: s.carrier,
          tracking_number: s.tracking_number, location: currentLocation(s.events ?? []),
          etd: s.etd, eta: s.eta, etaOriginal, etaActual: s.eta_actual, delayReason,
          delay: computeDelay({ status: s.status, etaOriginal, etaCurrent: s.eta }),
          pos: Array.from(poMap.values()),
        }
      })
    },
  })
}
