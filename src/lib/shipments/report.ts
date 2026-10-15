import type { ShipmentStatus, ShipmentMode } from '@/hooks/useShipments'

// Pure, UI-agnostic shaping + delay math for the shipment report. Shared by the
// on-screen report page and the server-side PDF builder so both stay identical.

const MS_DAY = 86400000

/** Parse a DATE/ISO string to a LOCAL midnight Date (timezone-safe at day granularity). */
export function parseDay(s: string | null | undefined): Date | null {
  if (!s) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3])
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function dayDiff(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / MS_DAY)
}

export type DelayInfo = { delayDays: number; overdueDays: number; isDelayed: boolean }

/**
 * delay   = how far the current/revised ETA slipped past the original ETA (never negative).
 * overdue = the effective ETA (current, else original) is in the past and the shipment
 *           has not been delivered.
 */
export function computeDelay(args: {
  status: ShipmentStatus
  etaOriginal: string | null
  etaCurrent: string | null
  now?: Date
}): DelayInfo {
  const now = args.now ?? new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const o = parseDay(args.etaOriginal)
  const c = parseDay(args.etaCurrent)
  const delayDays = o && c ? Math.max(0, dayDiff(c, o)) : 0
  const ref = c ?? o
  const overdueDays = ref && args.status !== 'delivered' && ref < today ? dayDiff(today, ref) : 0
  return { delayDays, overdueDays, isDelayed: delayDays > 0 || overdueDays > 0 }
}

// ─── Shaped report model (what the hook produces, page + PDF consume) ──────────

export type ReportItem = { name: string; sku: string | null; qty: number; po_qty: number }

export type ReportPO = {
  po_id: string
  po_number: string
  supplier_name: string | null
  requested: string | null    // purchase_orders.created_date
  approved: string | null     // final approved po_approvals date (null = not fully approved)
  value_qar: number | null    // purchase_orders.total_qar
  balance_qar: number | null  // total_qar − Σ outgoing payments
  items: ReportItem[]
}

export type ReportShipment = {
  id: string
  shipment_number: string
  status: ShipmentStatus
  mode: ShipmentMode
  carrier: string | null
  tracking_number: string | null
  location: string | null
  etd: string | null
  eta: string | null           // current planned
  etaOriginal: string | null   // from the 'original' eta revision
  etaActual: string | null
  delayReason: string | null
  delay: DelayInfo
  pos: ReportPO[]
}

export type MilestoneState = 'done' | 'pending' | 'flag' | 'none'
export type Milestone = { label: string; date: string | null; state: MilestoneState }

/** The logistics-timeline milestone strip (no advance/balance payment steps). */
export function milestones(s: ReportShipment): Milestone[] {
  const reqs = s.pos.map((p) => p.requested).filter((x): x is string => !!x).sort()
  const requested = reqs[0] ?? null
  const apps = s.pos.map((p) => p.approved)
  const somePending = s.pos.some((p) => !p.approved)
  const allApproved = s.pos.length > 0 && !somePending
  const approved = allApproved ? (apps.filter((x): x is string => !!x).sort().slice(-1)[0] ?? null) : null
  const moved = s.delay.delayDays > 0
  const delivered = s.status === 'delivered'
  return [
    { label: 'Requested', date: requested, state: requested ? 'done' : 'none' },
    { label: 'Approved', date: approved, state: approved ? 'done' : somePending ? 'pending' : 'none' },
    { label: 'ETD', date: s.etd, state: s.etd ? 'done' : 'none' },
    { label: 'Original ETA', date: s.etaOriginal, state: s.etaOriginal ? (moved ? 'flag' : 'done') : 'none' },
    {
      label: delivered ? 'Received' : 'Expected',
      date: delivered ? (s.etaActual ?? s.eta) : s.eta,
      state: delivered ? 'done' : s.delay.isDelayed ? 'flag' : s.eta ? 'pending' : 'none',
    },
  ]
}

export type ReportKpis = {
  shipments: number
  pos: number
  delivered: number
  delayed: number
  valueQar: number
  balanceQar: number
}

export function summarize(shipments: ReportShipment[]): ReportKpis {
  const poIds = new Set<string>()
  let valueQar = 0
  let balanceQar = 0
  for (const s of shipments) {
    for (const p of s.pos) {
      if (!poIds.has(p.po_id)) {
        poIds.add(p.po_id)
        valueQar += p.value_qar ?? 0
        balanceQar += p.balance_qar ?? 0
      }
    }
  }
  return {
    shipments: shipments.length,
    pos: poIds.size,
    delivered: shipments.filter((s) => s.status === 'delivered').length,
    delayed: shipments.filter((s) => s.status !== 'delivered' && s.delay.isDelayed).length,
    valueQar,
    balanceQar,
  }
}
