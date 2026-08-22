/**
 * Builds the self-contained HTML for the order-confirmation PDF.
 *
 * Caller passes pre-loaded brand assets and fonts as base64 data URLs, so the
 * HTML has no external references — `puppeteer.page.setContent(html)` renders
 * the document without any further network or filesystem access.
 *
 * Design notes:
 *  - Uses the shared compact bilingual template (IBM Plex Sans/Arabic).
 *  - All decorative elements (orange ribbon, dark contact bar, table headers,
 *    summary column) are pure HTML/CSS — no design PNGs. Only the company
 *    logo and the "ahlha" footer wordmark remain as images.
 *  - English text uses IBM Plex Sans.
 *  - Arabic text uses IBM Plex Sans Arabic throughout.
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

export interface ConfirmationLineItem {
  name:      string
  qty:       number
  unitPrice: number
  subtotal:  number
}

export interface BuildConfirmationHtmlInput {
  orderNumber:   string
  issuingDate:   string
  scheduledDate: string
  customerName:  string
  customerPhone: string
  services:      ConfirmationLineItem[]
  subtotal:      number
  discount:      number
  total:         number
  currency?:     string                        // default 'QAR'
  assets:        PdfAssets
  fonts:         PdfFonts
}

// -- Helpers -----------------------------------------------------------------

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

// -- Template ----------------------------------------------------------------

export function buildConfirmationHtml(input: BuildConfirmationHtmlInput): string {
  const currency = input.currency ?? 'QAR'

  const servicesRows = input.services.map((li) => `
    <tr>
      <td class="cell-num">${escapeHtml(fmtMoney(li.subtotal, currency))}</td>
      <td class="cell-num">${escapeHtml(fmtMoney(li.unitPrice, currency))}</td>
      <td class="cell-num">${escapeHtml(String(li.qty))}</td>
      <td class="cell-item">${escapeHtml(li.name).replace(/\n/g, '<br>')}</td>
    </tr>
  `).join('')

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<title>Booking Confirmation — ${escapeHtml(input.orderNumber)}</title>
<style>
  ${fontFacesCss(input.fonts)}
  ${BASE_CSS}

  /* Confirmation-specific: service cell uses IBMPlexAr for mixed en/ar names */
  table.lines td.cell-item {
    text-align: right;
    font-family: 'IBMPlexAr', 'IBMPlexSans', sans-serif;
    font-weight: 400;
    font-size: 10px;
    line-height: 1.45;
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
      <div class="ar-title">الخدمات المحجوزة</div>
      <div class="en-title">Requested Service</div>
      <div class="doc-no">${escapeHtml(input.orderNumber)}</div>
    </div>
  </div>

  <!-- Customer details -->
  <div class="meta">
    <div class="meta-block">
      <div class="meta-value">${escapeHtml(input.issuingDate)}</div>
      <div class="meta-label">
        <div class="ar">تاريخ الإصدار</div>
        <div class="en">(Issuing Date)</div>
      </div>
    </div>
    <div class="meta-block">
      <div class="meta-value">${escapeHtml(input.scheduledDate)}</div>
      <div class="meta-label">
        <div class="ar">تاريخ موعد الخدمة</div>
        <div class="en">(Service Schedule Date)</div>
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

  <!-- Services table -->
  <div class="lines-wrap">
    <table class="lines">
      <thead>
        <tr>
          <th style="width:18%">إجمالي الخدمات<span class="en">(Subtotal)</span></th>
          <th style="width:18%">قيمة الوحدة<span class="en">(Unit Price)</span></th>
          <th style="width:12%">الكمية<span class="en">(Qty)</span></th>
          <th style="width:52%">الخدمات المحجوزة<span class="en">(Requested Service)</span></th>
        </tr>
      </thead>
      <tbody>
        ${servicesRows}
      </tbody>
    </table>
  </div>

  <!-- Summary column -->
  <div class="bottom-section" style="justify-content: flex-end;">
    <div class="summary-inner">
      <div class="summary-row">
        <span class="s-label">المجموع الفرعي</span>
        <span class="s-en">Subtotal</span>
        <span class="s-sep">:</span>
        <span class="s-amount">${escapeHtml(fmtMoney(input.subtotal, currency))}</span>
      </div>
      <div class="summary-row">
        <span class="s-label">قيمة الخصم</span>
        <span class="s-en">Discount</span>
        <span class="s-sep">:</span>
        <span class="s-amount">${escapeHtml(fmtMoney(input.discount, currency))}</span>
      </div>
      <div class="summary-row s-grand">
        <span class="s-label">الإجمالي النهائي</span>
        <span class="s-en">Grand Total</span>
        <span class="s-sep">:</span>
        <span class="s-amount">${escapeHtml(fmtMoney(input.total, currency))}</span>
      </div>
    </div>
  </div>

  <!-- Footer -->
  ${stampSectionHtml(input.assets.stamp)}

  ${footerHtml(input.assets.footer)}

</body>
</html>`
}
