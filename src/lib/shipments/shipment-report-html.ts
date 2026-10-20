import { milestones, summarize, forecastsDue, type ReportShipment } from './report'
import type { ShipmentStatus } from '@/hooks/useShipments'

// Minimal forecast row shape (avoids importing the client hook into this server module).
type ForecastRow = {
  forecast_number: string; item_name: string | null; qty: number; supplier_name: string | null
  engagement: string; currency: string; est_value: number | null
  planned_order_date: string | null; needed_by_date: string | null
}
const ENG_LABEL: Record<string, string> = {
  not_started: 'Not started', in_discussion: 'In discussion', quotation_received: 'Quotation received',
  negotiating: 'Negotiating', ready_to_order: 'Ready to order', on_hold: 'On hold',
}

// Self-contained HTML for the shipment report PDF (rendered by html-to-pdf, which
// loads with no network — all styles inline). Mirrors the on-screen report and
// reuses the same pure shaping helpers so the two never drift.

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fdate(s: string | null): string {
  if (!s) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s)
  return isNaN(d.getTime()) ? '—' : `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`
}
const qar = (n: number | null | undefined) => n == null ? '—' : `QAR ${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`

const STATUS: Record<ShipmentStatus, { label: string; bg: string; fg: string }> = {
  planned: { label: 'Planned', bg: '#edf0f2', fg: '#6b7885' },
  booked: { label: 'Booked', bg: '#e5eef6', fg: '#28618f' },
  in_transit: { label: 'In transit', bg: '#fbeedd', fg: '#b45309' },
  customs: { label: 'Customs', bg: '#fbeedd', fg: '#b45309' },
  delivered: { label: 'Delivered', bg: '#e4f2ea', fg: '#1f7a4d' },
  delayed: { label: 'Delayed', bg: '#f9e5e3', fg: '#b3261e' },
}

function delayBadge(s: ReportShipment): string {
  if (s.status === 'delivered') return `<span class="badge ok">received</span>`
  if (s.delay.overdueDays > 0) return `<span class="badge late">${s.delay.overdueDays}d past ETA</span>`
  if (s.delay.delayDays > 0) return `<span class="badge warn">delayed ${s.delay.delayDays}d</span>`
  return `<span class="badge ok">on schedule</span>`
}

function card(s: ReportShipment): string {
  const st = STATUS[s.status]
  const miles = milestones(s).map((m) => `
    <div class="mile ${m.state}">
      <div class="dot"></div>
      <div class="ml">${esc(m.label)}</div>
      <div class="md">${m.date ? fdate(m.date) : m.state === 'pending' ? 'pending' : '—'}</div>
    </div>`).join('')
  const reason = s.delay.isDelayed && s.delayReason
    ? `<div class="reason"><b>Delay reason — ${esc(s.delayReason)}</b></div>` : ''
  const pos = s.pos.map((p) => {
    const main = `
    <tr class="po">
      <td><span class="mono b">${esc(p.po_number)}</span>${p.supplier_name ? `<div class="sub">${esc(p.supplier_name)}</div>` : ''}</td>
      <td>${p.items.map((it) => `${esc(it.name)} <span class="sub">×${it.qty}/${it.po_qty}</span>`).join('<br>')}</td>
      <td class="mono">${fdate(p.requested)}</td>
      <td class="mono">${p.approved ? fdate(p.approved) : 'pending'}</td>
      <td class="mono r">${qar(p.value_qar)}</td>
      <td class="mono r ${(p.balance_qar ?? 0) > 0 ? 'due' : 'paid'}">${p.balance_qar == null ? '—' : p.balance_qar > 0 ? `${qar(p.balance_qar)} due` : 'paid'}</td>
    </tr>`
    const notes = p.comments.length ? `
    <tr class="ponotes"><td colspan="6">
      ${p.comments.map((c) => `<div class="note"><div class="nt">${esc(c.comment)}</div><div class="nm">&mdash; ${esc(c.by ?? 'Unknown')} &middot; ${fdate(c.at)}</div></div>`).join('')}
    </td></tr>` : ''
    return main + notes
  }).join('')
  return `
  <section class="ship">
    <div class="head">
      <span class="sid">${esc(s.shipment_number)}</span>
      <span class="pill" style="background:${st.bg};color:${st.fg}">${st.label}</span>
      ${s.location ? `<span class="loc">Now at <b>${esc(s.location)}</b></span>` : ''}
      <span class="mode">${esc(s.mode)}</span>
      <span class="grow"></span>${delayBadge(s)}
    </div>
    <div class="miles">${miles}</div>
    ${reason}
    <table class="pos">
      <thead><tr><th>PO / Supplier</th><th>Items</th><th>Requested</th><th>Approved</th><th class="r">PO value</th><th class="r">Balance</th></tr></thead>
      <tbody>${pos || `<tr><td colspan="6" class="empty">No purchase orders linked.</td></tr>`}</tbody>
    </table>
  </section>`
}

function forecastHtml(forecasts: ForecastRow[], due: ReturnType<typeof forecastsDue>): string {
  if (!forecasts.length) return ''
  const countdown = (d: number | null) => d == null ? '' : d < 0 ? `${-d}d overdue` : d === 0 ? 'order today' : `in ${d}d`
  const review = due.length ? `
    <div class="review"><h3>&#9873; For review &mdash; ${due.length} to order within 30 days</h3>
    ${due.map((f) => `<div class="frow"><span class="mono b">${esc(f.forecast_number)}</span><span>${esc(f.item_name ?? '—')} &times;${esc(f.qty)}${f.supplier_name ? ' &middot; ' + esc(f.supplier_name) : ''}</span><span class="due">${countdown(f.daysToOrder)} &middot; ${fdate(f.planned_order_date)}</span></div>`).join('')}</div>` : ''
  const rows = forecasts.map((f) => `<tr>
    <td class="mono">${esc(f.forecast_number)}</td><td>${esc(f.item_name ?? '—')} &times;${esc(f.qty)}</td><td>${esc(f.supplier_name ?? '—')}</td>
    <td>${esc(ENG_LABEL[f.engagement] ?? f.engagement)}</td><td class="r">${f.est_value == null ? '—' : esc(f.currency + ' ' + f.est_value.toLocaleString('en-US'))}</td>
    <td class="mono">${fdate(f.planned_order_date)}</td><td class="mono">${fdate(f.needed_by_date)}</td></tr>`).join('')
  return `${review}
    <h2 class="sect">Upcoming purchase forecast &mdash; ${forecasts.length} planned</h2>
    <table class="fc"><thead><tr><th>Ref</th><th>Item</th><th>Supplier</th><th>Engagement</th><th class="r">Est. value</th><th>Planned order</th><th>Needed by</th></tr></thead><tbody>${rows}</tbody></table>`
}

export function buildShipmentReportHtml(payload: { shipments: ReportShipment[]; forecasts?: ForecastRow[]; generatedAt?: string }): string {
  const ships = payload.shipments ?? []
  const forecasts = payload.forecasts ?? []
  const due = forecastsDue(forecasts)
  const k = summarize(ships)
  const genDate = fdate((payload.generatedAt ?? new Date().toISOString()).slice(0, 10))
  const kpi = (n: string | number, l: string) => `<div class="kpi"><div class="n">${esc(n)}</div><div class="l">${esc(l)}</div></div>`
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box} body{margin:0;font-family:"Segoe UI",Arial,sans-serif;color:#1c2733;font-size:12px}
  .mono{font-family:"Consolas",monospace} .b{font-weight:700} .r{text-align:right} .grow{flex:1}
  .hdr{border-bottom:2px solid #0f5e73;padding:0 0 10px;margin:0 0 16px;display:flex;align-items:flex-end;justify-content:space-between}
  .hdr h1{margin:0;font-size:20px;letter-spacing:.02em} .hdr .d{font-family:"Consolas",monospace;font-size:11px;color:#4a5866}
  .summary{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
  .kpi{border:1px solid #d7dde2;border-radius:8px;padding:8px 12px;min-width:110px} .kpi .n{font-family:"Consolas",monospace;font-weight:700;font-size:16px} .kpi .l{font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:#6b7885;margin-top:2px}
  .ship{border:1px solid #d7dde2;border-radius:10px;margin-bottom:12px;break-inside:avoid;page-break-inside:avoid;overflow:hidden}
  .head{display:flex;align-items:center;gap:10px;padding:10px 14px}
  .sid{font-family:"Consolas",monospace;font-weight:700;font-size:15px}
  .pill{border-radius:999px;padding:2px 9px;font-size:11px;font-weight:600}
  .loc{color:#4a5866} .loc b{color:#1c2733} .mode{font-size:11px;color:#6b7885;text-transform:capitalize}
  .badge{font-family:"Consolas",monospace;font-size:11px;font-weight:700;padding:3px 8px;border-radius:5px}
  .badge.ok{background:#e4f2ea;color:#1f7a4d} .badge.warn{background:#fbeedd;color:#b45309} .badge.late{background:#f9e5e3;color:#b3261e}
  .miles{display:flex;gap:0;padding:4px 14px 12px}
  .mile{flex:1;position:relative;padding-top:10px;padding-right:6px} .mile:before{content:"";position:absolute;top:15px;left:0;right:0;height:2px;background:#d7dde2}
  .mile.done:before{background:#0f5e73} .mile .dot{position:relative;z-index:1;width:11px;height:11px;border-radius:50%;background:#fff;border:2px solid #d7dde2;margin-bottom:5px}
  .mile.done .dot{background:#0f5e73;border-color:#0f5e73} .mile.flag .dot{background:#d97706;border-color:#d97706} .mile.pending .dot{border-color:#d97706}
  .mile .ml{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#6b7885} .mile .md{font-family:"Consolas",monospace;font-size:11px;font-weight:600} .mile.flag .md,.mile.pending .md{color:#b45309}
  .reason{margin:0 14px 10px;padding:7px 11px;border-left:3px solid #d97706;background:#fbeedd;border-radius:0 5px 5px 0;font-size:11.5px} .reason b{color:#b45309}
  table.pos{width:100%;border-collapse:collapse;font-size:11px} table.pos th{background:#f2f5f7;color:#4a5866;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.05em;padding:6px 14px;border-top:1px solid #d7dde2}
  table.pos td{padding:7px 14px;border-top:1px solid #eceff2;vertical-align:top} .sub{font-size:10px;color:#6b7885} .due{color:#b45309;font-weight:700} .paid{color:#1f7a4d}
  table.pos tr.ponotes td{border-top:0;padding:0 14px 8px}
  .note{border:1px solid #dbe3ea;border-left:3px solid #0f5e73;background:#f6f9fb;border-radius:0 6px 6px 0;padding:6px 9px;margin-top:6px} .note:first-child{margin-top:0}
  .note .nt{white-space:pre-wrap;color:#1c2733;font-size:11px} .note .nm{font-size:9.5px;color:#6b7885;margin-top:3px;font-family:"Consolas",monospace}
  .empty{color:#6b7885;text-align:center}
  .review{border:1px solid #e8c893;border-left:4px solid #d97706;border-radius:8px;background:#fdf6ec;padding:10px 14px;margin:16px 0 10px;break-inside:avoid} .review h3{margin:0 0 4px;font-size:13px;color:#b45309}
  .frow{display:flex;gap:10px;padding:5px 0;border-top:1px dashed #e8d9bf;font-size:11.5px} .frow:first-of-type{border-top:0} .frow .due{margin-left:auto;font-family:"Consolas",monospace;font-weight:700;color:#b45309}
  h2.sect{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#4a5866;margin:16px 0 8px;border-bottom:1px solid #d7dde2;padding-bottom:5px}
  table.fc{width:100%;border-collapse:collapse;font-size:11px} table.fc th{background:#f2f5f7;color:#4a5866;text-align:left;font-size:9px;text-transform:uppercase;padding:6px 10px;border-bottom:1px solid #d7dde2} table.fc td{padding:6px 10px;border-bottom:1px solid #eceff2}
  @page{size:A4;margin:14mm}
  </style></head><body>
  <div class="hdr"><h1>Shipment Report</h1><div class="d">Generated ${esc(genDate)}</div></div>
  <div class="summary">
    ${kpi(k.shipments, 'Shipments')}${kpi(k.pos, 'Purchase orders')}${kpi(k.delivered, 'Delivered')}
    ${kpi(k.delayed, 'Delayed / overdue')}${kpi(qar(k.valueQar), 'Total PO value')}${kpi(qar(k.balanceQar), 'Balance outstanding')}
    ${kpi(forecasts.length, 'Upcoming purchases')}${kpi(due.length, 'To order <= 30 days')}
  </div>
  ${ships.length ? ships.map(card).join('') : '<div class="empty" style="padding:48px">No shipments to report.</div>'}
  ${forecastHtml(forecasts, due)}
  </body></html>`
}
