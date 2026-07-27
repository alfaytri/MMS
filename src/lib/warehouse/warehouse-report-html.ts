import type { PdfFonts, PdfAssets } from '@/lib/pdf/pdf-fonts'
import { fontFacesCss, brandHeaderHtml, footerHtml, stampSectionHtml } from '@/lib/pdf/pdf-fonts'

// ─── HTML helpers ────────────────────────────────────────────────────────────

const HTML_ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
function esc(v: string): string { return v.replace(/[&<>"']/g, c => HTML_ESC[c]) }

function fmtMoney(n: number): string {
  return n.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtQty(n: number): string {
  return n.toLocaleString('en-QA', { maximumFractionDigits: 3 })
}
function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtDateTime(d: string | null | undefined): string {
  if (!d) return '—'
  const dt = new Date(d)
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

// ─── Report CSS ──────────────────────────────────────────────────────────────

const REPORT_CSS = `
  :root {
    --orange: #ED7C2C;
    --dark: #2f2f33;
    --text: #111;
    --muted: #6b7280;
    --border: #d1d5db;
    --stripe: #f8f9fa;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    background: #fff; color: var(--text);
    font-family: 'IBMPlexSans', sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  body { padding: 6mm 10mm 12mm; }

  .top-row {
    display: grid; grid-template-columns: 1fr auto 1fr;
    align-items: start; margin-bottom: 0;
  }
  .top-row .logo { width: 50px; height: auto; display: block; align-self: center; margin: 0 4mm; }
  .addr-en { font-family: 'IBMPlexSans', sans-serif; font-size: 7px; line-height: 1.5; color: #111; text-align: left; }
  .addr-en div { margin-bottom: 0.5px; }
  .addr-en .brand { font-weight: 700; font-size: 14px; letter-spacing: 0.5px; margin-bottom: 2px; line-height: 1.2; }
  .addr-en .tagline { font-weight: 400; font-size: 7px; margin-bottom: 2px; letter-spacing: 0.1px; line-height: 1.3; }
  .addr-ar { font-family: 'IBMPlexAr', sans-serif; direction: rtl; text-align: right; font-size: 7px; line-height: 1.5; color: #111; font-weight: 400; }
  .addr-ar div { margin-bottom: 0.5px; }
  .addr-ar .brand { font-weight: 700; font-size: 14px; margin-bottom: 2px; line-height: 1.2; }
  .addr-ar .tagline { font-weight: 400; font-size: 7px; margin-bottom: 2px; line-height: 1.3; }

  .report-title-bar {
    background: var(--orange); color: #fff; text-align: center;
    padding: 3mm 6mm; margin: 3mm 0 0;
  }
  .report-title-bar .en { font-weight: 700; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; }
  .report-title-bar .ar { font-family: 'IBMPlexAr', sans-serif; font-weight: 700; font-size: 11px; margin-top: 1px; }

  .report-meta {
    display: flex; justify-content: space-between; align-items: center;
    padding: 2mm 0; border-bottom: 1px solid var(--border); margin-bottom: 2mm;
    font-size: 8px; color: var(--muted);
  }
  .report-meta .meta-item { display: flex; gap: 2mm; }
  .report-meta .meta-label { font-weight: 600; color: var(--text); }

  table.report-table {
    width: 100%; border-collapse: collapse; font-size: 7.5px; margin-top: 1mm;
  }
  table.report-table thead { display: table-header-group; }
  table.report-table th {
    background: var(--orange); color: #fff; padding: 2mm 2mm;
    text-align: left; font-weight: 600; font-size: 7px;
    text-transform: uppercase; letter-spacing: 0.3px;
    border: 0.5px solid var(--dark); white-space: nowrap;
  }
  table.report-table th.r { text-align: right; }
  table.report-table th.c { text-align: center; }
  table.report-table td {
    padding: 1.5mm 2mm; border-bottom: 0.3px solid var(--border);
    vertical-align: middle; line-height: 1.4;
  }
  table.report-table td.r { text-align: right; font-family: 'IBMPlexSans', sans-serif; }
  table.report-table td.c { text-align: center; }
  table.report-table td.mono { font-family: 'IBMPlexSans', sans-serif; font-size: 7px; }
  table.report-table tr:nth-child(even) td { background: var(--stripe); }
  table.report-table tr.cat-row td { background: #e2e8f0; font-weight: 600; }
  table.report-table tr.sub-row td { background: #eff6ff; font-weight: 500; padding-left: 5mm; }
  table.report-table tr.total-row td {
    background: var(--dark); color: #fff; font-weight: 700;
    border-top: 1px solid var(--dark); font-size: 8px; padding: 2mm;
  }

  .badge {
    display: inline-block; padding: 0.5mm 2mm; border-radius: 2px;
    font-size: 6.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px;
  }
  .badge-success { background: #dcfce7; color: #166534; }
  .badge-warning { background: #fef9c3; color: #854d0e; }
  .badge-danger  { background: #fee2e2; color: #991b1b; }
  .badge-info    { background: #dbeafe; color: #1e40af; }
  .badge-muted   { background: #f3f4f6; color: #6b7280; }

  .text-muted { color: var(--muted); }
  .text-success { color: #166534; }
  .text-danger { color: #991b1b; }

  .footer { position: fixed; bottom: 4mm; left: 0; right: 0; text-align: center; }
  .footer img { height: 35px; width: auto; }

  .page-number::after { content: counter(page); }

  @media print { body { background: #fff; } }
`

// ─── Report shell ────────────────────────────────────────────────────────────

interface ReportShellOpts {
  titleEn: string
  titleAr: string
  landscape?: boolean
  meta: { label: string; value: string }[]
  fonts: PdfFonts
  assets: PdfAssets
}

function reportShell(opts: ReportShellOpts, bodyHtml: string): string {
  const pageSize = opts.landscape ? 'A4 landscape' : 'A4'
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
@page { size: ${pageSize}; margin: 0; }
${fontFacesCss(opts.fonts)}
${REPORT_CSS}
</style>
</head>
<body>
  ${brandHeaderHtml(opts.assets.brandHeader ?? opts.assets.logo)}

  <div class="report-title-bar">
    <div class="en">${esc(opts.titleEn)}</div>
    <div class="ar">${esc(opts.titleAr)}</div>
  </div>

  <div class="report-meta">
    <div style="display:flex;gap:6mm;">
      ${opts.meta.map(m => `<div class="meta-item"><span class="meta-label">${esc(m.label)}:</span> ${esc(m.value)}</div>`).join('')}
    </div>
    <div class="meta-item"><span class="meta-label">Generated:</span> ${fmtDateTime(new Date().toISOString())}</div>
  </div>

  ${bodyHtml}

  ${stampSectionHtml(opts.assets.stamp)}
  ${footerHtml(opts.assets.footer)}
</body>
</html>`
}

// ─── Status badge helpers ────────────────────────────────────────────────────

function statusBadge(status: string): string {
  const label = status.replace(/_/g, ' ')
  const cls =
    status === 'received' || status === 'approved' || status === 'completed' ? 'badge-success' :
    status === 'pending' || status === 'pending_approval' || status === 'in_progress' || status === 'submitted' ? 'badge-warning' :
    status === 'rejected' || status === 'cancelled' ? 'badge-danger' :
    status === 'in_transit' || status === 'draft' ? 'badge-info' :
    'badge-muted'
  return `<span class="badge ${cls}">${esc(label)}</span>`
}

function movementBadge(type: string): string {
  const labels: Record<string, string> = {
    adjustment: 'Adjustment', cost_adjustment: 'Cost Adj.', free_receival: 'Free Receival',
    purchase_receival: 'Purchase Receival', purchase_return: 'Purchase Return',
    purchase_return_cancelled: 'Return (Cancelled)', receival_edit: 'Receival Edit',
    sale_delivery: 'Sale Delivery', sale_return: 'Sale Return',
    sale_return_damaged: 'Return (Damaged)', transfer_in: 'Transfer In',
    transfer_out: 'Transfer Out', transfer_shrinkage: 'Shrinkage',
  }
  const cls =
    type.includes('receival') || type === 'sale_return' ? 'badge-success' :
    type.includes('delivery') || type.includes('return') || type.includes('damage') || type.includes('shrinkage') ? 'badge-danger' :
    type.includes('transfer') ? 'badge-info' :
    'badge-muted'
  return `<span class="badge ${cls}">${esc(labels[type] ?? type)}</span>`
}

// ═════════════════════════════════════════════════════════════════════════════
//  REPORT BUILDERS
// ═════════════════════════════════════════════════════════════════════════════

// ─── 1. Stock Overview ───────────────────────────────────────────────────────

export interface StockOverviewRow {
  category_name: string | null
  subcategory_name: string | null
  item_name: string
  brand: string | null
  sku: string | null
  item_type: string | null
  qty: number
  avg_cost: number
  total_value: number
}

export interface StockOverviewInput {
  warehouseName: string
  rows: StockOverviewRow[]
  fonts: PdfFonts
  assets: PdfAssets
}

export function buildStockOverviewReportHtml(input: StockOverviewInput): string {
  const { rows, warehouseName, fonts, assets } = input
  const totalQty = rows.reduce((s, r) => s + r.qty, 0)
  const totalValue = rows.reduce((s, r) => s + r.total_value, 0)

  const typeLabels: Record<string, string> = {
    products: 'Products', 'spare-parts': 'Spare Parts', consumables: 'Consumables', tools: 'Tools',
  }

  let tableRows = ''
  let idx = 0
  for (const r of rows) {
    idx++
    tableRows += `<tr>
      <td class="c">${idx}</td>
      <td>${esc(r.category_name ?? '—')}</td>
      <td>${esc(r.subcategory_name ?? '—')}</td>
      <td>${esc(r.item_name)}</td>
      <td>${esc(r.brand ?? '—')}</td>
      <td class="mono">${esc(r.sku ?? '—')}</td>
      <td class="c">${esc(typeLabels[r.item_type ?? ''] ?? '—')}</td>
      <td class="r">${fmtQty(r.qty)}</td>
      <td class="r">${fmtMoney(r.avg_cost)}</td>
      <td class="r">${fmtMoney(r.total_value)}</td>
    </tr>\n`
  }

  const body = `
  <table class="report-table">
    <thead><tr>
      <th class="c" style="width:5%">#</th>
      <th style="width:12%">Category</th>
      <th style="width:12%">Subcategory</th>
      <th style="width:16%">Item</th>
      <th style="width:12%">Brand</th>
      <th style="width:8%">SKU</th>
      <th class="c" style="width:8%">Type</th>
      <th class="r" style="width:7%">Qty</th>
      <th class="r" style="width:10%">Avg Cost</th>
      <th class="r" style="width:10%">Total Value</th>
    </tr></thead>
    <tbody>
      ${tableRows}
      <tr class="total-row">
        <td colspan="7" style="text-align:right">TOTAL</td>
        <td class="r">${fmtQty(totalQty)}</td>
        <td></td>
        <td class="r">${fmtMoney(totalValue)}</td>
      </tr>
    </tbody>
  </table>`

  return reportShell({
    titleEn: 'Stock Overview Report',
    titleAr: 'تقرير نظرة عامة على المخزون',
    landscape: true,
    meta: [
      { label: 'Warehouse', value: warehouseName },
      { label: 'Total Items', value: String(rows.length) },
    ],
    fonts, assets,
  }, body)
}

// ─── 2. Transfers ────────────────────────────────────────────────────────────

export interface TransferReportRow {
  transfer_number: string
  date: string
  from_warehouse: string
  to_warehouse: string
  status: string
  items_count: number
  total_qty: number
  created_by_name: string | null
  dispatched_by_name: string | null
  received_by_name: string | null
  notes: string | null
}

export interface TransfersReportInput {
  rows: TransferReportRow[]
  fonts: PdfFonts
  assets: PdfAssets
}

export function buildTransfersReportHtml(input: TransfersReportInput): string {
  const { rows, fonts, assets } = input

  let tableRows = ''
  let idx = 0
  for (const r of rows) {
    idx++
    tableRows += `<tr>
      <td class="c">${idx}</td>
      <td class="mono">${esc(r.transfer_number)}</td>
      <td>${fmtDate(r.date)}</td>
      <td>${esc(r.from_warehouse)}</td>
      <td>${esc(r.to_warehouse)}</td>
      <td class="c">${r.items_count}</td>
      <td class="r">${fmtQty(r.total_qty)}</td>
      <td class="c">${statusBadge(r.status)}</td>
      <td>${esc(r.created_by_name ?? '—')}</td>
      <td>${esc(r.dispatched_by_name ?? '—')}</td>
      <td>${esc(r.received_by_name ?? '—')}</td>
    </tr>\n`
  }

  const body = `
  <table class="report-table">
    <thead><tr>
      <th class="c" style="width:4%">#</th>
      <th style="width:8%">Transfer #</th>
      <th style="width:8%">Date</th>
      <th style="width:12%">From</th>
      <th style="width:12%">To</th>
      <th class="c" style="width:5%">Items</th>
      <th class="r" style="width:6%">Total Qty</th>
      <th class="c" style="width:10%">Status</th>
      <th style="width:12%">Created By</th>
      <th style="width:12%">Dispatched By</th>
      <th style="width:11%">Received By</th>
    </tr></thead>
    <tbody>${tableRows}</tbody>
  </table>`

  return reportShell({
    titleEn: 'Stock Transfers Report',
    titleAr: 'تقرير التحويلات',
    landscape: true,
    meta: [{ label: 'Total Transfers', value: String(rows.length) }],
    fonts, assets,
  }, body)
}

// ─── 3. Adjustments ─────────────────────────────────────────────────────────

export interface AdjustmentReportRow {
  created_at: string
  warehouse_name: string
  item_name: string
  brand: string | null
  adjustment_type: string
  qty: number
  reason: string
  status: string
  requested_by_name: string | null
  approved_by_name: string | null
}

export interface AdjustmentsReportInput {
  rows: AdjustmentReportRow[]
  fonts: PdfFonts
  assets: PdfAssets
}

export function buildAdjustmentsReportHtml(input: AdjustmentsReportInput): string {
  const { rows, fonts, assets } = input
  const typeLabels: Record<string, string> = {
    increase: 'Increase', decrease: 'Decrease', damage: 'Damage', write_off: 'Write Off',
  }

  let tableRows = ''
  let idx = 0
  for (const r of rows) {
    idx++
    const typeCls = r.adjustment_type === 'increase' ? 'badge-success' :
      r.adjustment_type === 'decrease' ? 'badge-warning' : 'badge-danger'
    tableRows += `<tr>
      <td class="c">${idx}</td>
      <td>${fmtDate(r.created_at)}</td>
      <td>${esc(r.warehouse_name)}</td>
      <td>${esc(r.item_name)}</td>
      <td>${esc(r.brand ?? '—')}</td>
      <td class="c"><span class="badge ${typeCls}">${esc(typeLabels[r.adjustment_type] ?? r.adjustment_type)}</span></td>
      <td class="r">${fmtQty(r.qty)}</td>
      <td>${esc(r.reason)}</td>
      <td class="c">${statusBadge(r.status)}</td>
      <td>${esc(r.requested_by_name ?? '—')}</td>
      <td>${esc(r.approved_by_name ?? '—')}</td>
    </tr>\n`
  }

  const body = `
  <table class="report-table">
    <thead><tr>
      <th class="c" style="width:4%">#</th>
      <th style="width:7%">Date</th>
      <th style="width:10%">Warehouse</th>
      <th style="width:14%">Item</th>
      <th style="width:9%">Brand</th>
      <th class="c" style="width:7%">Type</th>
      <th class="r" style="width:5%">Qty</th>
      <th style="width:14%">Reason</th>
      <th class="c" style="width:9%">Status</th>
      <th style="width:10%">Requested By</th>
      <th style="width:11%">Approved By</th>
    </tr></thead>
    <tbody>${tableRows}</tbody>
  </table>`

  return reportShell({
    titleEn: 'Stock Adjustments Report',
    titleAr: 'تقرير تعديلات المخزون',
    landscape: true,
    meta: [{ label: 'Total Adjustments', value: String(rows.length) }],
    fonts, assets,
  }, body)
}

// ─── 4. Inventory Checks ────────────────────────────────────────────────────

export interface InventoryCheckReportRow {
  check_number: string
  warehouse_name: string
  status: string
  started_at: string | null
  initiated_by_name: string | null
  reviewed_by_name: string | null
  reviewed_at: string | null
  notes: string | null
}

export interface InventoryChecksReportInput {
  rows: InventoryCheckReportRow[]
  fonts: PdfFonts
  assets: PdfAssets
}

export function buildInventoryChecksReportHtml(input: InventoryChecksReportInput): string {
  const { rows, fonts, assets } = input

  let tableRows = ''
  let idx = 0
  for (const r of rows) {
    idx++
    tableRows += `<tr>
      <td class="c">${idx}</td>
      <td class="mono">${esc(r.check_number)}</td>
      <td>${esc(r.warehouse_name)}</td>
      <td class="c">${statusBadge(r.status)}</td>
      <td>${fmtDateTime(r.started_at)}</td>
      <td>${esc(r.initiated_by_name ?? '—')}</td>
      <td>${esc(r.reviewed_by_name ?? '—')}</td>
      <td>${fmtDateTime(r.reviewed_at)}</td>
      <td>${esc(r.notes ?? '')}</td>
    </tr>\n`
  }

  const body = `
  <table class="report-table">
    <thead><tr>
      <th class="c" style="width:3%">#</th>
      <th style="width:7%">Check #</th>
      <th style="width:10%">Warehouse</th>
      <th class="c" style="width:9%">Status</th>
      <th style="width:13%">Started</th>
      <th style="width:13%">Initiated By</th>
      <th style="width:13%">Reviewed By</th>
      <th style="width:13%">Reviewed At</th>
      <th style="width:15%">Notes</th>
    </tr></thead>
    <tbody>${tableRows}</tbody>
  </table>`

  return reportShell({
    titleEn: 'Inventory Checks Report',
    titleAr: 'تقرير فحوصات الجرد',
    landscape: true,
    meta: [{ label: 'Total Checks', value: String(rows.length) }],
    fonts, assets,
  }, body)
}

// ─── 5. Stock Value ──────────────────────────────────────────────────────────

export interface StockValueReportRow {
  category_name: string | null
  subcategory_name: string | null
  item_name: string
  brand: string | null
  sku: string | null
  item_type: string | null
  qty: number
  avg_cost: number
  total_value: number
  warehouse_name: string
}

export interface StockValueReportInput {
  rows: StockValueReportRow[]
  fonts: PdfFonts
  assets: PdfAssets
}

export function buildStockValueReportHtml(input: StockValueReportInput): string {
  const { rows, fonts, assets } = input
  const totalQty = rows.reduce((s, r) => s + r.qty, 0)
  const totalValue = rows.reduce((s, r) => s + r.total_value, 0)

  let tableRows = ''
  let idx = 0
  for (const r of rows) {
    idx++
    tableRows += `<tr>
      <td class="c">${idx}</td>
      <td>${esc(r.warehouse_name)}</td>
      <td>${esc(r.category_name ?? '—')}</td>
      <td>${esc(r.subcategory_name ?? '—')}</td>
      <td>${esc(r.item_name)}</td>
      <td>${esc(r.brand ?? '—')}</td>
      <td class="mono">${esc(r.sku ?? '—')}</td>
      <td class="r">${fmtQty(r.qty)}</td>
      <td class="r">${fmtMoney(r.avg_cost)}</td>
      <td class="r">${fmtMoney(r.total_value)}</td>
    </tr>\n`
  }

  const body = `
  <table class="report-table">
    <thead><tr>
      <th class="c" style="width:4%">#</th>
      <th style="width:10%">Warehouse</th>
      <th style="width:11%">Category</th>
      <th style="width:11%">Subcategory</th>
      <th style="width:15%">Item</th>
      <th style="width:10%">Brand</th>
      <th style="width:7%">SKU</th>
      <th class="r" style="width:7%">Qty</th>
      <th class="r" style="width:12%">Avg Cost (QR)</th>
      <th class="r" style="width:13%">Total Value (QR)</th>
    </tr></thead>
    <tbody>
      ${tableRows}
      <tr class="total-row">
        <td colspan="7" style="text-align:right">TOTAL</td>
        <td class="r">${fmtQty(totalQty)}</td>
        <td></td>
        <td class="r">${fmtMoney(totalValue)}</td>
      </tr>
    </tbody>
  </table>`

  return reportShell({
    titleEn: 'Stock Value Report',
    titleAr: 'تقرير قيمة المخزون',
    landscape: true,
    meta: [
      { label: 'Total Items', value: String(rows.length) },
      { label: 'Total Value (QR)', value: fmtMoney(totalValue) },
    ],
    fonts, assets,
  }, body)
}

// ─── 6. Movements ────────────────────────────────────────────────────────────

export interface MovementReportRow {
  created_at: string
  warehouse_name: string
  item_name: string
  sku: string | null
  movement_type: string
  qty: number
  unit_cost: number
  reference_type: string | null
  notes: string | null
}

export interface MovementsReportInput {
  rows: MovementReportRow[]
  warehouseName: string
  fonts: PdfFonts
  assets: PdfAssets
}

export function buildMovementsReportHtml(input: MovementsReportInput): string {
  const { rows, warehouseName, fonts, assets } = input
  const refLabels: Record<string, string> = {
    sale_delivery: 'Sale Delivery', receival: 'PO Receival', po_return: 'Purchase Return',
    return: 'Sale Return', transfer: 'Transfer', adjustment: 'Adjustment',
    landed_cost: 'Landed Cost', inventory_check: 'Inv. Check',
    cost_adjustment: 'Cost Adj.', free_receival: 'Free Receival',
  }

  let tableRows = ''
  let idx = 0
  for (const r of rows) {
    idx++
    tableRows += `<tr>
      <td class="c">${idx}</td>
      <td>${fmtDateTime(r.created_at)}</td>
      <td>${esc(r.warehouse_name)}</td>
      <td>${esc(r.item_name)}</td>
      <td class="mono">${esc(r.sku ?? '—')}</td>
      <td class="c">${movementBadge(r.movement_type)}</td>
      <td class="r">${fmtQty(r.qty)}</td>
      <td class="r">${fmtMoney(r.unit_cost)}</td>
      <td>${esc(refLabels[r.reference_type ?? ''] ?? r.reference_type ?? '—')}</td>
      <td>${esc(r.notes ?? '')}</td>
    </tr>\n`
  }

  const body = `
  <table class="report-table">
    <thead><tr>
      <th class="c" style="width:3%">#</th>
      <th style="width:11%">Date/Time</th>
      <th style="width:10%">Warehouse</th>
      <th style="width:16%">Item</th>
      <th style="width:7%">SKU</th>
      <th class="c" style="width:11%">Movement Type</th>
      <th class="r" style="width:6%">Qty</th>
      <th class="r" style="width:9%">Unit Cost</th>
      <th style="width:10%">Reference</th>
      <th style="width:17%">Notes</th>
    </tr></thead>
    <tbody>${tableRows}</tbody>
  </table>`

  return reportShell({
    titleEn: 'Stock Movements Report',
    titleAr: 'تقرير حركات المخزون',
    landscape: true,
    meta: [
      { label: 'Warehouse', value: warehouseName },
      { label: 'Total Movements', value: String(rows.length) },
    ],
    fonts, assets,
  }, body)
}

// ─── 7. Receivals & Deliveries ───────────────────────────────────────────────

export interface ReceivalDeliveryReportRow {
  direction: 'inbound' | 'outbound'
  doc_number: string
  reference_number: string
  warehouse_name: string
  counterparty: string
  date: string
  item_count: number
  status: string
  responsible_name: string | null
}

export interface ReceivalsDeliveriesReportInput {
  rows: ReceivalDeliveryReportRow[]
  fonts: PdfFonts
  assets: PdfAssets
}

export function buildReceivalsDeliveriesReportHtml(input: ReceivalsDeliveriesReportInput): string {
  const { rows, fonts, assets } = input

  let tableRows = ''
  let idx = 0
  for (const r of rows) {
    idx++
    const dirBadge = r.direction === 'inbound'
      ? '<span class="badge badge-success">Receival</span>'
      : '<span class="badge badge-info">Delivery</span>'
    const refLabel = r.direction === 'inbound' ? 'PO' : 'SO'
    tableRows += `<tr>
      <td class="c">${idx}</td>
      <td>${fmtDate(r.date)}</td>
      <td class="c">${dirBadge}</td>
      <td class="mono">${esc(r.doc_number)}</td>
      <td class="mono">${refLabel}: ${esc(r.reference_number)}</td>
      <td>${esc(r.counterparty)}</td>
      <td>${esc(r.warehouse_name)}</td>
      <td class="c">${r.item_count}</td>
      <td class="c">${statusBadge(r.status)}</td>
      <td>${esc(r.responsible_name ?? '—')}</td>
    </tr>\n`
  }

  const body = `
  <table class="report-table">
    <thead><tr>
      <th class="c" style="width:3%">#</th>
      <th style="width:8%">Date</th>
      <th class="c" style="width:8%">Type</th>
      <th style="width:9%">Doc #</th>
      <th style="width:9%">Reference</th>
      <th style="width:14%">Supplier / Customer</th>
      <th style="width:12%">Warehouse</th>
      <th class="c" style="width:5%">Items</th>
      <th class="c" style="width:10%">Status</th>
      <th style="width:12%">Responsible</th>
    </tr></thead>
    <tbody>${tableRows}</tbody>
  </table>`

  return reportShell({
    titleEn: 'Receivals & Deliveries Report',
    titleAr: 'تقرير الاستلام والتسليم',
    landscape: true,
    meta: [
      { label: 'Total Records', value: String(rows.length) },
      { label: 'Receivals', value: String(rows.filter(r => r.direction === 'inbound').length) },
      { label: 'Deliveries', value: String(rows.filter(r => r.direction === 'outbound').length) },
    ],
    fonts, assets,
  }, body)
}
