/**
 * Builds the self-contained HTML for the Customer Statement PDF.
 *
 * Uses the shared brand module (`@/lib/pdf/pdf-fonts`) for IBM Plex Sans /
 * Arabic fonts, company header, contact strip, footer, and base CSS.
 * Adds statement-specific sections: bilingual customer/date meta, transaction
 * ledger with running balance, and closing summary.
 */

import type { PdfFonts, PdfAssets } from '@/lib/pdf/pdf-fonts'
import {
  fontFacesCss,
  brandHeaderHtml,
  contactStripHtml,
  footerHtml,
  BASE_CSS,
} from '@/lib/pdf/pdf-fonts'

export interface StatementTxn {
  txn_date:    string
  txn_type:    'invoice' | 'payment' | 'credit_note'
  reference:   string
  description: string
  debit:       number
  credit:      number
  balance:     number
}

export interface BuildStatementHtmlInput {
  customer_name: string
  date_from:     string | null
  date_to:       string | null
  generated_at:  string
  transactions:  StatementTxn[]
  opening_balance: number
  total_debit:   number
  total_credit:  number
  closing_balance: number
  assets: PdfAssets
  fonts:  PdfFonts
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

const TXN_LABEL: Record<StatementTxn['txn_type'], string> = {
  invoice:     'Invoice',
  payment:     'Payment',
  credit_note: 'Credit Note',
}

// ── Template ────────────────────────────────────────────────────────────────

export function buildStatementHtml(input: BuildStatementHtmlInput): string {
  const dateRange = input.date_from && input.date_to
    ? `${fmtDate(input.date_from)} — ${fmtDate(input.date_to)}`
    : input.date_from
      ? `From ${fmtDate(input.date_from)}`
      : input.date_to
        ? `Until ${fmtDate(input.date_to)}`
        : 'All transactions'

  const openingRow = `
    <tr class="opening-row">
      <td class="cell-date">${escapeHtml(input.date_from ? fmtDate(input.date_from) : '—')}</td>
      <td class="cell-type" colspan="3"><em>Opening Balance</em></td>
      <td class="cell-num">—</td>
      <td class="cell-num">—</td>
      <td class="cell-num cell-balance ${input.opening_balance > 0 ? 'balance-owed' : ''}">
        ${escapeHtml(fmtMoney(input.opening_balance))}
      </td>
    </tr>
  `

  const txnRows = input.transactions.length > 0
    ? input.transactions.map((t) => `
      <tr>
        <td class="cell-date">${escapeHtml(fmtDate(t.txn_date))}</td>
        <td class="cell-type">
          <span class="type-pill type-${t.txn_type}">${escapeHtml(TXN_LABEL[t.txn_type])}</span>
        </td>
        <td class="cell-ref">${escapeHtml(t.reference)}</td>
        <td class="cell-desc">${escapeHtml(t.description)}</td>
        <td class="cell-num cell-debit">${t.debit > 0 ? escapeHtml(fmtMoney(t.debit)) : '—'}</td>
        <td class="cell-num cell-credit">${t.credit > 0 ? escapeHtml(fmtMoney(t.credit)) : '—'}</td>
        <td class="cell-num cell-balance ${t.balance > 0 ? 'balance-owed' : ''}">
          ${escapeHtml(fmtMoney(t.balance))}
        </td>
      </tr>
    `).join('')
    : `<tr><td colspan="7" class="empty-cell">No transactions in this period</td></tr>`

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<title>Statement — ${escapeHtml(input.customer_name)}</title>
<style>
  ${fontFacesCss(input.fonts)}
  ${BASE_CSS}

  /* ─── Statement-specific ─── */
  body { padding: 6mm 0 12mm; overflow: visible; height: auto; min-height: 297mm; }

  .statement-meta {
    display: grid; grid-template-columns: 1fr 1fr; gap: 0 12mm;
    padding: 1.5mm 14mm 3mm;
  }

  .ledger-wrap { padding: 3mm 14mm 0; }
  table.ledger {
    width: 100%; border-collapse: collapse; border: 0.7px solid var(--text);
    font-family: 'IBMPlexSans', sans-serif;
  }
  table.ledger th {
    background: var(--orange); color: #fff; padding: 2.5mm 2mm;
    text-align: left; vertical-align: middle;
    font-weight: 600; font-size: 9px; letter-spacing: 0.2px;
    border-right: 0.7px solid rgba(255,255,255,0.25);
  }
  table.ledger th:last-child { border-right: 0; }
  table.ledger th.num { text-align: right; }
  table.ledger td {
    border-top: 0.7px solid var(--grey-rule);
    padding: 1.8mm 2mm; vertical-align: middle;
    font-size: 8.5px;
  }
  table.ledger tr:nth-child(even) td { background: #fafafa; }
  table.ledger tr.opening-row td {
    background: #f0f0f0; font-weight: 600;
  }
  .cell-date { white-space: nowrap; color: var(--muted); }
  .cell-type { white-space: nowrap; }
  .cell-ref { font-weight: 600; color: var(--text); }
  .cell-desc { color: var(--muted); }
  .cell-num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .cell-debit { color: var(--text); }
  .cell-credit { color: #059669; }
  .cell-balance { font-weight: 700; color: var(--text); }
  .cell-balance.balance-owed { color: #dc2626; }
  .empty-cell { text-align: center; padding: 6mm 0; font-style: italic; color: var(--muted); }

  .type-pill {
    display: inline-block; padding: 0.5mm 1.8mm;
    border-radius: 2mm; font-size: 7.5px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.3px;
  }
  .type-invoice     { background: #dbeafe; color: #1e40af; }
  .type-payment     { background: #d1fae5; color: #065f46; }
  .type-credit_note { background: #fef3c7; color: #92400e; }

  /* Summary card */
  .summary-block { padding: 4mm 14mm 0; display: flex; justify-content: flex-end; }
  .summary-card {
    min-width: 90mm; border: 0.7px solid var(--text);
    font-family: 'IBMPlexSans', sans-serif;
  }
  .summary-card .row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 2mm 3mm; border-bottom: 0.5px solid var(--grey-rule);
    font-size: 9px;
  }
  .summary-card .row:last-child { border-bottom: 0; }
  .summary-card .label { color: var(--muted); }
  .summary-card .value { font-weight: 700; font-variant-numeric: tabular-nums; }
  .summary-card .value.credit { color: #059669; }
  .summary-card .grand {
    background: rgba(237, 124, 44, 0.12); padding: 3mm 3mm;
    font-size: 11px;
  }
  .summary-card .grand .value.owed { color: #dc2626; }
  .summary-card .grand .value.settled { color: #059669; }

  .footer-note {
    padding: 4mm 14mm 2mm;
    font-family: 'IBMPlexSans', sans-serif;
    font-size: 7.5px; color: var(--muted); font-style: italic;
    text-align: center;
  }

  .footer { position: relative; bottom: auto; margin-top: 6mm; }

  @media print {
    body { min-height: auto; }
    tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>

  ${brandHeaderHtml(input.assets.logo)}

  <div class="midbar">
    ${contactStripHtml()}
    <div class="dark-strip"></div>
    <div class="ribbon">
      <div class="ar-title">كشف حساب</div>
      <div class="en-title">Customer Statement</div>
      <div class="doc-no">${escapeHtml(fmtDate(input.generated_at))}</div>
    </div>
  </div>

  <div class="statement-meta">
    <div class="meta-block">
      <div class="meta-value">${escapeHtml(input.customer_name || '—')}</div>
      <div class="meta-label">
        <div class="ar">اسم الزبون</div>
        <div class="en">(Customer Name)</div>
      </div>
    </div>
    <div class="meta-block">
      <div class="meta-value">${escapeHtml(dateRange)}</div>
      <div class="meta-label">
        <div class="ar">الفترة</div>
        <div class="en">(Period)</div>
      </div>
    </div>
  </div>

  <div class="ledger-wrap">
    <table class="ledger">
      <thead>
        <tr>
          <th style="width:11%">Date</th>
          <th style="width:11%">Type</th>
          <th style="width:12%">Reference</th>
          <th style="width:31%">Description</th>
          <th class="num" style="width:11%">Debit</th>
          <th class="num" style="width:11%">Credit</th>
          <th class="num" style="width:13%">Balance</th>
        </tr>
      </thead>
      <tbody>
        ${openingRow}
        ${txnRows}
      </tbody>
    </table>
  </div>

  <div class="summary-block">
    <div class="summary-card">
      <div class="row">
        <span class="label">Opening Balance</span>
        <span class="value">${escapeHtml(fmtMoney(input.opening_balance))}</span>
      </div>
      <div class="row">
        <span class="label">Total Invoiced (Debit)</span>
        <span class="value">${escapeHtml(fmtMoney(input.total_debit))}</span>
      </div>
      <div class="row">
        <span class="label">Total Paid / Credited</span>
        <span class="value credit">${escapeHtml(fmtMoney(input.total_credit))}</span>
      </div>
      <div class="row grand">
        <span class="label">Closing Balance</span>
        <span class="value ${input.closing_balance > 0 ? 'owed' : 'settled'}">
          ${escapeHtml(fmtMoney(input.closing_balance))}
        </span>
      </div>
    </div>
  </div>

  <div class="footer-note">
    Statement generated on ${escapeHtml(fmtDate(input.generated_at))}. For any queries please contact info@alfaytri.com.
  </div>

  ${footerHtml(input.assets.footer)}

</body>
</html>`
}
