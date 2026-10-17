import { describe, it, expect } from 'vitest'
import { computeDelay, summarize, milestones, forecastsDue, type ReportShipment } from '../report'
import { buildShipmentReportHtml } from '../shipment-report-html'

const FC = (planned: string | null) => ({
  forecast_number: 'FC-1', item_name: 'X', qty: 1, supplier_name: null,
  engagement: 'not_started', currency: 'QAR', est_value: null,
  planned_order_date: planned, needed_by_date: null,
})

const sampleShipment: ReportShipment = {
  id: 's1', shipment_number: 'SHP-00001', status: 'in_transit', mode: 'sea', carrier: 'Maersk',
  tracking_number: null, location: 'Jebel Ali', etd: '2026-10-01', eta: '2026-10-20', etaOriginal: '2026-10-15',
  etaActual: null, delayReason: 'Port congestion', delay: { delayDays: 5, overdueDays: 0, isDelayed: true },
  pos: [{
    po_id: 'p1', po_number: 'PO-2026-10-006', supplier_name: 'Safetech', requested: '2026-09-20', approved: '2026-09-25',
    value_qar: 15625, balance_qar: 5000, items: [{ name: 'Euroinox 40/50 M', sku: 'CEN-EUR-001', qty: 10, po_qty: 10 }],
  }],
}

const NOW = new Date(2026, 9, 15) // 15 Oct 2026 (local)

describe('computeDelay', () => {
  it('no ETA dates → not delayed', () => {
    expect(computeDelay({ status: 'booked', etaOriginal: null, etaCurrent: null, now: NOW }))
      .toEqual({ delayDays: 0, overdueDays: 0, isDelayed: false })
  })

  it('current ETA slipped 5 days past the original → delayDays 5', () => {
    const r = computeDelay({ status: 'in_transit', etaOriginal: '2026-10-20', etaCurrent: '2026-10-25', now: NOW })
    expect(r.delayDays).toBe(5)
    expect(r.overdueDays).toBe(0) // both still in the future
    expect(r.isDelayed).toBe(true)
  })

  it('current ETA earlier than original → no negative delay', () => {
    const r = computeDelay({ status: 'in_transit', etaOriginal: '2026-10-25', etaCurrent: '2026-10-20', now: NOW })
    expect(r.delayDays).toBe(0)
  })

  it('ETA in the past and not delivered → overdue', () => {
    const r = computeDelay({ status: 'in_transit', etaOriginal: '2026-10-05', etaCurrent: '2026-10-10', now: NOW })
    expect(r.overdueDays).toBe(5) // 15 - 10
    expect(r.delayDays).toBe(5)
    expect(r.isDelayed).toBe(true)
  })

  it('ETA in the past but delivered → not overdue', () => {
    const r = computeDelay({ status: 'delivered', etaOriginal: '2026-10-01', etaCurrent: '2026-10-05', now: NOW })
    expect(r.overdueDays).toBe(0)
    expect(r.isDelayed).toBe(true) // still carries the historical slip
  })

  it('only original ETA (no revision), in the past, not delivered → overdue off original', () => {
    const r = computeDelay({ status: 'customs', etaOriginal: '2026-10-11', etaCurrent: null, now: NOW })
    expect(r.overdueDays).toBe(4)
    expect(r.delayDays).toBe(0) // no slip computable without both
    expect(r.isDelayed).toBe(true)
  })

  it('on schedule → not delayed', () => {
    const r = computeDelay({ status: 'in_transit', etaOriginal: '2026-10-20', etaCurrent: '2026-10-20', now: NOW })
    expect(r).toEqual({ delayDays: 0, overdueDays: 0, isDelayed: false })
  })
})

describe('summarize', () => {
  it('rolls up shipments, de-duped POs, and QAR totals', () => {
    const k = summarize([sampleShipment])
    expect(k).toEqual({ shipments: 1, pos: 1, delivered: 0, delayed: 1, valueQar: 15625, balanceQar: 5000 })
  })
  it('counts a PO shared by two shipments only once', () => {
    const k = summarize([sampleShipment, { ...sampleShipment, id: 's2', shipment_number: 'SHP-00002' }])
    expect(k.shipments).toBe(2)
    expect(k.pos).toBe(1)
    expect(k.valueQar).toBe(15625) // not double-counted
  })
})

describe('milestones', () => {
  it('produces the logistics strip with the flagged slipped ETA', () => {
    const m = milestones(sampleShipment)
    expect(m.map((x) => x.label)).toEqual(['Requested', 'Approved', 'ETD', 'Original ETA', 'Expected'])
    expect(m.find((x) => x.label === 'Approved')?.state).toBe('done')
    expect(m.find((x) => x.label === 'Original ETA')?.state).toBe('flag') // delay slipped
  })
})

describe('forecastsDue', () => {
  it('flags lines with a planned order date on/before today+N; ignores null dates', () => {
    const now = new Date(2026, 9, 15)
    const due = forecastsDue([FC('2026-10-20'), FC('2026-12-01'), FC(null)], 30, now)
    expect(due.map((d) => d.planned_order_date)).toEqual(['2026-10-20'])
    expect(due[0].dueSoon).toBe(true)
    expect(due[0].daysToOrder).toBe(5)
  })
  it('treats a null planned date as not due (no NaN)', () => {
    expect(forecastsDue([FC(null)], 30, new Date(2026, 9, 15))).toEqual([])
  })
  it('includes past-due (negative days) lines, sorted by planned date', () => {
    const due = forecastsDue([FC('2026-10-20'), FC('2026-10-01')], 30, new Date(2026, 9, 15))
    expect(due.map((d) => d.planned_order_date)).toEqual(['2026-10-01', '2026-10-20'])
    expect(due[0].daysToOrder).toBe(-14)
  })
})

describe('buildShipmentReportHtml', () => {
  it('renders a self-contained document with the shipment, PO and KPIs', () => {
    const html = buildShipmentReportHtml({ shipments: [sampleShipment], generatedAt: '2026-10-15T00:00:00Z' })
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('SHP-00001')
    expect(html).toContain('Safetech')
    expect(html).toContain('Euroinox 40/50 M')
    expect(html).toContain('Port congestion')
    expect(html).toContain('QAR 15,625')
  })
  it('renders the forecast sections when forecasts are supplied', () => {
    const html = buildShipmentReportHtml({
      shipments: [], generatedAt: '2026-10-15T00:00:00Z',
      forecasts: [{ forecast_number: 'FC-00007', item_name: 'K 30/70 M', qty: 5, supplier_name: 'Safetech', engagement: 'negotiating', currency: 'QAR', est_value: 2275, planned_order_date: '2030-01-01', needed_by_date: null }],
    })
    expect(html).toContain('Upcoming purchase forecast')
    expect(html).toContain('FC-00007')
    expect(html).toContain('Negotiating')
  })
  it('handles an empty report without throwing', () => {
    const html = buildShipmentReportHtml({ shipments: [] })
    expect(html).toContain('No shipments to report')
  })
})
