/**
 * Builds the self-contained HTML for the Customer Statement PDF.
 * Mirrors public/brand/customer-statement-preview.html — one row per Sale
 * Order with Total / Paid / Outstanding / Status columns, and a summary card
 * of Total Orders / Paid / Outstanding.
 */

import type { PdfFonts, PdfAssets } from '@/lib/pdf/pdf-fonts'
import {
  fontFacesCss,
  brandHeaderHtml,
  contactStripHtml,
  footerHtml,
  BASE_CSS,
} from '@/lib/pdf/pdf-fonts'

export interface StatementOrderRow {
  so_number:   string
  so_date:     string
  status:      string
  total:       number
  paid:        number
  outstanding: number
}

export interface BuildStatementHtmlInput {
  customer_name:  string
  customer_phone: string | null
  account_type:   string
  statement_date: string
  open_orders:    number
  orders:         StatementOrderRow[]
  total_orders_value: number
  total_paid:     number
  total_outstanding: number
  notes:          string | null
  assets:         PdfAssets
  fonts:          PdfFonts
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c])
}

function fmtMoney(amount: number | null): string {
  const n = amount ?? 0
  return `QAR ${n.toLocaleString('en-QA', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const day    = String(d.getUTCDate()).padStart(2, '0')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${day} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

// Map SO status to a badge class + human label
function statusBadge(status: string): { cls: string; label: string } {
  switch (status) {
    case 'quotation':        return { cls: 'badge-quotation',  label: 'Quotation' }
    case 'pending_approval': return { cls: 'badge-pending',    label: 'Pending Approval' }
    case 'confirmed':        return { cls: 'badge-confirmed',  label: 'Confirmed' }
    case 'in_progress':      return { cls: 'badge-progress',   label: 'In Progress' }
    case 'partial_delivery': return { cls: 'badge-partial',    label: 'Partial Delivery' }
    case 'delivered':        return { cls: 'badge-delivered',  label: 'Delivered' }
    case 'invoiced':         return { cls: 'badge-invoiced',   label: 'Invoiced' }
    case 'closed':           return { cls: 'badge-closed',     label: 'Closed' }
    default:                 return { cls: 'badge-confirmed',  label: status }
  }
}

// ── Template ────────────────────────────────────────────────────────────────

export function buildStatementHtml(input: BuildStatementHtmlInput): string {
  const orderRows = input.orders.length > 0
    ? input.orders.map((o) => {
        const badge = statusBadge(o.status)
        return `
        <tr>
          <td class="cell-num" style="color:#dc2626; font-weight:600;">${escapeHtml(fmtMoney(o.outstanding))}</td>
          <td class="cell-num">${escapeHtml(fmtMoney(o.paid))}</td>
          <td class="cell-num">${escapeHtml(fmtMoney(o.total))}</td>
          <td class="cell-status"><span class="badge ${badge.cls}">${escapeHtml(badge.label)}</span></td>
          <td class="cell-num">${escapeHtml(fmtDate(o.so_date))}</td>
          <td class="cell-num" style="font-weight:600; font-size:11.5px;">${escapeHtml(o.so_number)}</td>
        </tr>`
      }).join('')
    : `<tr><td colspan="6" style="text-align:center; padding: 8mm 0; color: var(--muted); font-style: italic;">No open orders</td></tr>`

  const notesText = input.notes
    ? escapeHtml(input.notes)
    : 'This statement reflects all open and unpaid sales orders as of the statement date. Completed and fully paid orders are excluded. Please contact us for any discrepancies.'

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<title>Statement — ${escapeHtml(input.customer_name)}</title>
<style>
  ${fontFacesCss(input.fonts)}
  ${BASE_CSS}

  /* ─── Statement-specific overrides ─── */
  table.lines td.cell-status { text-align: center; }
  table.lines td.cell-status .badge {
    display: inline-block; padding: 1mm 2.5mm; border-radius: 3px;
    font-family: 'IBMPlexSans', sans-serif; font-size: 8px; letter-spacing: 0.3px;
  }
  .badge-quotation  { background: #f3f4f6; color: #374151; }
  .badge-pending    { background: #fef3c7; color: #92400e; }
  .badge-confirmed  { background: #dcfce7; color: #166534; }
  .badge-progress   { background: #dbeafe; color: #1e40af; }
  .badge-partial    { background: #fef9c3; color: #854d0e; }
  .badge-delivered  { background: #d1fae5; color: #065f46; }
  .badge-invoiced   { background: #dbeafe; color: #1e40af; }
  .badge-closed     { background: #e5e7eb; color: #4b5563; }

  .notes-wrap { flex: 1; }
  .notes-wrap .notes-title {
    font-family: 'IBMPlexSans', sans-serif; font-weight: 700; font-size: 9px; color: var(--text);
    margin-bottom: 1.5mm;
  }
  .notes-wrap .notes-text {
    font-family: 'IBMPlexSans', sans-serif; font-size: 8px; color: var(--muted); line-height: 1.6;
  }

  .summary-row .s-outstanding { color: #dc2626; font-size: 10px; }
  .summary-divider { height: 0.7px; background: var(--text); }
</style>
</head>
<body>

  ${brandHeaderHtml(input.assets.logo)}

  <div class="midbar">
    ${contactStripHtml()}
    <div class="dark-strip"></div>
    <div class="ribbon">
      <div class="ar-title">كشف حساب الزبون</div>
      <div class="en-title">Customer Statement</div>
    </div>
  </div>

  <div class="meta">
    <div class="meta-block">
      <div class="meta-value">${escapeHtml(fmtDate(input.statement_date))}</div>
      <div class="meta-label">
        <div class="ar">تاريخ الكشف</div>
        <div class="en">(Statement Date)</div>
      </div>
    </div>
    <div class="meta-block">
      <div class="meta-value">${escapeHtml(input.account_type || '—')}</div>
      <div class="meta-label">
        <div class="ar">نوع الحساب</div>
        <div class="en">(Account Type)</div>
      </div>
    </div>
    <div class="meta-block">
      <div class="meta-value">${escapeHtml(input.customer_phone ?? '—')}</div>
      <div class="meta-label">
        <div class="ar">هاتف الزبون</div>
        <div class="en">(Customer Phone)</div>
      </div>
    </div>
    <div class="meta-block">
      <div class="meta-value">${escapeHtml(input.customer_name || '—')}</div>
      <div class="meta-label">
        <div class="ar">اسم الزبون</div>
        <div class="en">(Customer Name)</div>
      </div>
    </div>
    <div class="meta-block">
      <div class="meta-value">${escapeHtml(String(input.open_orders))}</div>
      <div class="meta-label">
        <div class="ar">عدد الأوامر المفتوحة</div>
        <div class="en">(Open Orders)</div>
      </div>
    </div>
  </div>

  <div class="lines-wrap">
    <table class="lines">
      <thead>
        <tr>
          <th style="width:17%">المستحق<span class="en">(Outstanding)</span></th>
          <th style="width:17%">المدفوع<span class="en">(Paid)</span></th>
          <th style="width:17%">الإجمالي<span class="en">(Total)</span></th>
          <th style="width:14%">الحالة<span class="en">(Status)</span></th>
          <th style="width:16%">التاريخ<span class="en">(Date)</span></th>
          <th style="width:19%">رقم أمر البيع<span class="en">(SO #)</span></th>
        </tr>
      </thead>
      <tbody>
        ${orderRows}
      </tbody>
    </table>
  </div>

  <div class="bottom-section">
    <div class="notes-wrap">
      <div class="notes-title">Notes</div>
      <div class="notes-text">${notesText}</div>
    </div>
    <div class="summary-inner">
      <div class="summary-row">
        <span class="s-label">إجمالي الأوامر</span>
        <span class="s-en">Total Orders Value</span>
        <span class="s-sep">:</span>
        <span class="s-amount">${escapeHtml(fmtMoney(input.total_orders_value))}</span>
      </div>
      <div class="summary-row">
        <span class="s-label">إجمالي المدفوع</span>
        <span class="s-en">Total Paid</span>
        <span class="s-sep">:</span>
        <span class="s-amount">${escapeHtml(fmtMoney(input.total_paid))}</span>
      </div>
      <div class="summary-divider"></div>
      <div class="summary-row">
        <span class="s-label">إجمالي المستحق</span>
        <span class="s-en">Total Outstanding</span>
        <span class="s-sep">:</span>
        <span class="s-amount s-outstanding">${escapeHtml(fmtMoney(input.total_outstanding))}</span>
      </div>
    </div>
  </div>

  ${footerHtml(input.assets.footer)}

</body>
</html>`
}
