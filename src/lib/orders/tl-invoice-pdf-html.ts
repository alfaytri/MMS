/**
 * Builds the self-contained HTML for a TL (team-leader) invoice PDF —
 * one combined document with the invoice lines AND the payment history.
 *
 * Style mirrors `confirmation-pdf-html.ts` (bilingual header/footer, same
 * brand assets) so the two PDFs read as a set. Adds a "Payments" section
 * below the summary column.
 */

import type { PdfFonts, PdfAssets } from '@/lib/pdf/pdf-fonts'
import {
  fontFacesCss,
  brandHeaderHtml,
  contactStripHtml,
  footerHtml,
  stampSectionHtml,
  BASE_CSS,
} from '@/lib/pdf/pdf-fonts'

export interface TlInvoiceLineInput {
  name:      string
  nameAr:    string | null
  unitEn:    string
  unitAr:    string
  qty:       number
  unitPrice: number
  total:     number
}

export interface TlInvoicePaymentInput {
  paidAt: string   // ISO
  method: string   // human-readable ("Cash", "Online Payment")
  amount: number
}

export interface BuildTlInvoiceHtmlInput {
  invoiceNumber:  string
  orderRef:       string | null
  issuingDate:    string     // pre-formatted
  customerName:   string
  customerPhone:  string
  lines:          TlInvoiceLineInput[]
  subtotal:       number     // service subtotal
  sparePartCost?: number     // 0 until we add line categorization
  discount:       number
  total:          number
  paid:           number
  remaining:      number
  status:         'unpaid' | 'partial' | 'paid'
  payments:       TlInvoicePaymentInput[]
  currency?:      string     // default 'QAR'
  assets:         PdfAssets
  fonts:          PdfFonts
}

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c])
}

const CURRENCY_PREFIXES: Record<string, string> = {
  QAR: 'QAR ', USD: '$', EUR: '€', GBP: '£', AED: 'AED ', SAR: 'SAR ', KWD: 'KWD ',
}
function fmtMoney(amount: number, currency: string): string {
  const prefix = CURRENCY_PREFIXES[currency] ?? `${currency} `
  return `${prefix}${amount.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function fmtDateShort(iso: string): string {
  const d = new Date(iso)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

const STATUS_LABEL: Record<BuildTlInvoiceHtmlInput['status'], string> = {
  unpaid:  'UNPAID',
  partial: 'PARTIAL',
  paid:    'PAID',
}
const STATUS_COLOR: Record<BuildTlInvoiceHtmlInput['status'], { bg: string; fg: string }> = {
  unpaid:  { bg: '#f3f4f6', fg: '#374151' },
  partial: { bg: '#fef3c7', fg: '#92400e' },
  paid:    { bg: '#dcfce7', fg: '#166534' },
}

export function buildTlInvoiceHtml(input: BuildTlInvoiceHtmlInput): string {
  const currency = input.currency ?? 'QAR'
  const badge    = STATUS_COLOR[input.status]

  const lineRows = input.lines.map((li) => {
    const arLine = li.nameAr
      ? `<div class="ar-line">${escapeHtml(li.nameAr)}</div>`
      : ''
    return `
    <tr>
      <td class="cell-num">${escapeHtml(fmtMoney(li.total, currency))}</td>
      <td class="cell-num">${escapeHtml(String(li.qty))}</td>
      <td class="cell-unit">
        <div>${escapeHtml(li.unitEn)}</div>
        <div class="ar">${escapeHtml(li.unitAr)}</div>
      </td>
      <td class="cell-num">${escapeHtml(fmtMoney(li.unitPrice, currency))}</td>
      <td class="cell-desc">
        <div class="en-line">${escapeHtml(li.name)}</div>
        ${arLine}
      </td>
    </tr>
    `
  }).join('')

  const paymentRows = input.payments.length === 0
    ? `<tr><td colspan="3" class="cell-empty">No payments recorded</td></tr>`
    : input.payments.map((p) => `
      <tr>
        <td class="cell-num">${escapeHtml(fmtMoney(p.amount, currency))}</td>
        <td>${escapeHtml(p.method)}</td>
        <td>${escapeHtml(fmtDateShort(p.paidAt))}</td>
      </tr>`).join('')

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<title>Invoice — ${escapeHtml(input.invoiceNumber)}</title>
<style>
  ${fontFacesCss(input.fonts)}
  ${BASE_CSS}

  /* TL-invoice specific */
  table.lines { direction: ltr; }
  table.lines th { text-align: center; }
  table.lines td.cell-desc {
    text-align: center;
    padding: 6px 8px;
    word-break: break-word;
    overflow-wrap: anywhere;
    white-space: normal;
  }
  table.lines td.cell-desc .en-line {
    font-family: 'IBMPlexSans', sans-serif;
    font-size: 10px;
    line-height: 1.4;
    color: #222;
    text-align: center;
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  table.lines td.cell-desc .ar-line {
    font-family: 'IBMPlexAr', sans-serif;
    font-size: 10px;
    line-height: 1.45;
    color: #444;
    direction: rtl;
    text-align: center;
    margin-top: 2px;
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  table.lines td.cell-unit {
    text-align: center;
    font-size: 10px;
    line-height: 1.3;
  }
  table.lines td.cell-unit .ar {
    font-family: 'IBMPlexAr', sans-serif;
    color: #555;
    font-size: 9px;
    margin-top: 1px;
  }
  table.lines th.th-bilingual {
    line-height: 1.3;
  }
  table.lines th.th-bilingual .ar-header {
    font-family: 'IBMPlexAr', sans-serif;
    display: block;
    font-size: 10px;
    font-weight: 600;
  }
  table.lines th.th-bilingual .en-header {
    display: block;
    font-family: 'IBMPlexSans', sans-serif;
    font-size: 9px;
    font-weight: 500;
    color: #efe6d9;
    margin-top: 1px;
  }
  .cell-empty {
    text-align: center;
    color: #888;
    font-style: italic;
    padding: 6px 4px;
    font-size: 9px;
  }
  /* Horizontal totals bar */
  table.totals-bar {
    width: 100%;
    border-collapse: collapse;
    margin-top: 14px;
    font-size: 10px;
  }
  table.totals-bar th,
  table.totals-bar td {
    border: 1px solid #d4d4d4;
    padding: 6px 8px;
    text-align: center;
    vertical-align: middle;
  }
  table.totals-bar th {
    background: #f3f3f3;
    color: #333;
    font-weight: 600;
    font-family: 'IBMPlexAr', 'IBMPlexSans', sans-serif;
    line-height: 1.35;
  }
  table.totals-bar th .en {
    display: block;
    font-family: 'IBMPlexSans', sans-serif;
    font-size: 9px;
    font-weight: 500;
    color: #666;
    margin-top: 1px;
  }
  table.totals-bar td {
    background: #fafafa;
    font-family: 'IBMPlexSans', sans-serif;
    font-size: 11px;
    font-weight: 500;
  }
  table.totals-bar th.grand,
  table.totals-bar td.grand {
    background: #fff2e6;
    color: #b45309;
    font-weight: 700;
  }
  /* Compact payments table override */
  .payments-wrap { max-width: 320px; margin-left: auto; }
  .payments-wrap table.lines { font-size: 9px; }
  .payments-wrap table.lines th,
  .payments-wrap table.lines td { padding: 3px 5px; }
  .payments-wrap table.lines th .en { font-size: 8px; }
  .payments-heading {
    margin-top: 14px;
    margin-bottom: 4px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #666;
    text-align: right;
    max-width: 320px;
    margin-left: auto;
  }
  .status-badge {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.05em;
    background: ${badge.bg};
    color: ${badge.fg};
  }
  .section-heading {
    margin-top: 18px;
    margin-bottom: 6px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #4a4a4a;
    border-bottom: 1px solid #ddd;
    padding-bottom: 3px;
  }
</style>
</head>
<body>

  <!-- Header: company logo + addresses -->
  ${brandHeaderHtml(input.assets.brandHeader ?? input.assets.logo)}

  <!-- Mid bar: contact strip + dark strip + ribbon -->
  <div class="midbar">
    ${contactStripHtml()}
    <div class="dark-strip"></div>
    <div class="ribbon">
      <div class="ar-title">فاتورة</div>
      <div class="en-title">Invoice</div>
      <div class="doc-no">${escapeHtml(input.invoiceNumber)}</div>
    </div>
  </div>

  <!-- Meta row: date, order ref, phone, name, status badge -->
  <div class="meta">
    <div class="meta-block">
      <div class="meta-value"><span class="status-badge">${STATUS_LABEL[input.status]}</span></div>
      <div class="meta-label">
        <div class="ar">حالة الدفع</div>
        <div class="en">(Payment Status)</div>
      </div>
    </div>
    <div class="meta-block">
      <div class="meta-value">${escapeHtml(input.orderRef ?? '—')}</div>
      <div class="meta-label">
        <div class="ar">رقم الطلب</div>
        <div class="en">(Order Ref)</div>
      </div>
    </div>
    <div class="meta-block">
      <div class="meta-value">${escapeHtml(input.issuingDate)}</div>
      <div class="meta-label">
        <div class="ar">تاريخ الإصدار</div>
        <div class="en">(Issuing Date)</div>
      </div>
    </div>
    <div class="meta-block">
      <div class="meta-value">${escapeHtml(input.customerPhone)}</div>
      <div class="meta-label">
        <div class="ar">هاتف الزبون</div>
        <div class="en">(Customer Phone)</div>
      </div>
    </div>
    <div class="meta-block">
      <div class="meta-value">${escapeHtml(input.customerName)}</div>
      <div class="meta-label">
        <div class="ar">اسم الزبون</div>
        <div class="en">(Customer Name)</div>
      </div>
    </div>
  </div>

  <!-- Lines table (Subtotal → Qty → Unit → Unit Price → Service) -->
  <div class="lines-wrap">
    <table class="lines">
      <thead>
        <tr>
          <th class="th-bilingual" style="width:16%">
            <span class="ar-header">سعر الخدمة</span>
            <span class="en-header">(Subtotal in QAR)</span>
          </th>
          <th class="th-bilingual" style="width:10%">
            <span class="ar-header">العدد</span>
            <span class="en-header">(Quantity)</span>
          </th>
          <th class="th-bilingual" style="width:14%">
            <span class="ar-header">نوع الوحدة</span>
            <span class="en-header">(Unit)</span>
          </th>
          <th class="th-bilingual" style="width:14%">
            <span class="ar-header">السعر لكل وحدة</span>
            <span class="en-header">(Unit Price in QAR)</span>
          </th>
          <th class="th-bilingual" style="width:46%">
            <span class="ar-header">الخدمة</span>
            <span class="en-header">(Service)</span>
          </th>
        </tr>
      </thead>
      <tbody>
        ${lineRows}
      </tbody>
    </table>
  </div>

  <!-- Totals bar (Balance → Paid → Invoice Total → Discount → Spare Part → Service Subtotal) -->
  <table class="totals-bar">
    <thead>
      <tr>
        <th>المبلغ المتبقي<span class="en">(Balance Amount)</span></th>
        <th>المبلغ المدفوع<span class="en">(Paid Amount)</span></th>
        <th class="grand">المبلغ الكلي<span class="en">(Invoice Total)</span></th>
        <th>قيمة الخصم<span class="en">(Discount)</span></th>
        <th>سعر قطع الغيار<span class="en">(Spare Part cost)</span></th>
        <th>سعر الخدمة<span class="en">(Service Subtotal)</span></th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${escapeHtml(fmtMoney(input.remaining, currency))}</td>
        <td>${escapeHtml(fmtMoney(input.paid, currency))}</td>
        <td class="grand">${escapeHtml(fmtMoney(input.total, currency))}</td>
        <td>${escapeHtml(fmtMoney(input.discount, currency))}</td>
        <td>${escapeHtml(fmtMoney(input.sparePartCost ?? 0, currency))}</td>
        <td>${escapeHtml(fmtMoney(input.subtotal, currency))}</td>
      </tr>
    </tbody>
  </table>

  <!-- Payments section (compact) -->
  <div class="payments-heading">Payments · المدفوعات</div>
  <div class="payments-wrap">
    <table class="lines">
      <thead>
        <tr>
          <th style="width:36%">المبلغ<span class="en">(Amount)</span></th>
          <th style="width:34%">طريقة الدفع<span class="en">(Method)</span></th>
          <th style="width:30%">التاريخ<span class="en">(Date)</span></th>
        </tr>
      </thead>
      <tbody>
        ${paymentRows}
      </tbody>
    </table>
  </div>

  <!-- Stamp + footer -->
  ${stampSectionHtml(input.assets.stamp)}

  ${footerHtml(input.assets.footer)}

</body>
</html>`
}
