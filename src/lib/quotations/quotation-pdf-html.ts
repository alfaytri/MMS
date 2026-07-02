/**
 * Builds the self-contained HTML for the order-quotation PDF.
 *
 * Two callers:
 *  - `generate-quotation-pdf.ts` — passes assets/fonts as base64 data URLs and
 *    feeds the result to Puppeteer for PDF rendering.
 *  - `/api/quotations/preview-html` — same builder, same assets, response is
 *    set as an iframe `srcDoc` on the editor page so the on-screen preview is
 *    pixel-identical to what the customer will receive.
 *
 * Layout uses the compact bilingual IBM Plex Sans design shared across all
 * document PDFs: compact header, contact strip, dark strip with orange ribbon,
 * bilingual meta grid, RTL services table, vertical summary column, and the
 * absolute-positioned footer.
 */

import type { PdfFonts, PdfAssets } from '@/lib/pdf/pdf-fonts'
import { fontFacesCss, brandHeaderHtml, contactStripHtml, footerHtml, BASE_CSS } from '@/lib/pdf/pdf-fonts'

export interface QuotationLineItem {
  name:      string                  // service name (Arabic or English — rendered as-is)
  pathLabel: string                  // "Cat › Subcat" breadcrumb shown beneath name (may be empty)
  qty:       number
  unitPrice: number
  subtotal:  number
}

export interface BuildQuotationHtmlInput {
  quotationNumber: string
  issuingDate:     string             // pre-formatted ("24 Jun 2026")
  validUntilDate:  string             // pre-formatted
  validityDays:    number
  customerName:    string
  customerPhone:   string
  services:        QuotationLineItem[]
  subtotal:        number
  discount:        number
  total:           number
  notes:           string             // empty string if none
  preparedBy:      string             // empty string if none
  currency?:       string             // default 'QAR'
  assets:          PdfAssets
  fonts:           PdfFonts
}

// ── Helpers ─────────────────────────────────────────────────────────────────

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

// ── Template ────────────────────────────────────────────────────────────────

export function buildQuotationHtml(input: BuildQuotationHtmlInput): string {
  const currency = input.currency ?? 'QAR'

  const servicesRows = input.services.length === 0
    ? `<tr>
         <td colspan="4" class="empty-row">Add services from the left panel</td>
       </tr>`
    : input.services.map((li) => `
        <tr>
          <td class="cell-num">${escapeHtml(fmtMoney(li.subtotal,  currency))}</td>
          <td class="cell-num">${escapeHtml(fmtMoney(li.unitPrice, currency))}</td>
          <td class="cell-num">${escapeHtml(String(li.qty))}</td>
          <td class="cell-item">
            <div class="item-name">${escapeHtml(li.name).replace(/\n/g, '<br>')}</div>
            ${li.pathLabel ? `<div class="item-sku">${escapeHtml(li.pathLabel)}</div>` : ''}
          </td>
        </tr>
      `).join('')

  // Build terms / notes area
  const hasTerms = !!(input.notes || input.preparedBy)
  const termsHtml = hasTerms ? `
    <div class="terms-wrap">
      <div class="terms">
        ${input.notes ? `
          <div class="terms-row">
            <div class="terms-key">Notes</div>
            <div class="terms-val">${escapeHtml(input.notes).replace(/\n/g, '<br>')}</div>
          </div>` : ''}
        <div class="terms-row">
          <div class="terms-key">Validity</div>
          <div class="terms-val">Valid for ${escapeHtml(String(input.validityDays))} days from issue date${input.preparedBy ? ` · Prepared by ${escapeHtml(input.preparedBy)}` : ''}</div>
        </div>
      </div>
    </div>` : `
    <div class="terms-wrap">
      <div class="terms">
        <div class="terms-row">
          <div class="terms-key">Validity</div>
          <div class="terms-val">Valid for ${escapeHtml(String(input.validityDays))} days from issue date${input.preparedBy ? ` · Prepared by ${escapeHtml(input.preparedBy)}` : ''}</div>
        </div>
      </div>
    </div>`

  // Vertical summary column
  const summaryHtml = `
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
      <div class="summary-divider"></div>
      <div class="summary-row s-grand">
        <span class="s-label">الإجمالي النهائي</span>
        <span class="s-en">Grand Total</span>
        <span class="s-sep">:</span>
        <span class="s-amount">${escapeHtml(fmtMoney(input.total, currency))}</span>
      </div>
    </div>`

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<title>Order Quotation — ${escapeHtml(input.quotationNumber)}</title>
<style>
  ${fontFacesCss(input.fonts)}
  ${BASE_CSS}

  /* ─── Order quotation overrides ─── */
  table.lines td.empty-row {
    border-top: 0.7px solid var(--text);
    padding: 10mm 3mm;
    text-align: center;
    color: #999;
    font-style: italic;
    font-size: 11px;
    font-family: 'IBMPlexSans', sans-serif;
  }
  .summary-divider { height: 0.7px; background: var(--text); }
</style>
</head>
<body>

  <!-- ─────────── Top: company logo + addresses ─────────── -->
  ${brandHeaderHtml(input.assets.logo)}

  <!-- ─────────── Mid bar: contact strip + dark strip + ribbon ─────────── -->
  <div class="midbar">
    ${contactStripHtml()}
    <div class="dark-strip"></div>
    <div class="ribbon">
      <div class="ar-title">عرض سعر</div>
      <div class="en-title">Quotation</div>
      <div class="doc-no">${escapeHtml(input.quotationNumber || '—')}</div>
    </div>
  </div>

  <!-- ─────────── Meta grid ─────────── -->
  <div class="meta">
    <div class="meta-block">
      <div class="meta-value">${escapeHtml(input.issuingDate)}</div>
      <div class="meta-label">
        <div class="ar">تاريخ الإصدار</div>
        <div class="en">(Issuing Date)</div>
      </div>
    </div>
    <div class="meta-block">
      <div class="meta-value">${escapeHtml(input.validUntilDate)}</div>
      <div class="meta-label">
        <div class="ar">صالح حتى</div>
        <div class="en">(Valid Until)</div>
      </div>
    </div>
    <div class="meta-block">
      <div class="meta-value">${escapeHtml(input.customerPhone || '—')}</div>
      <div class="meta-label">
        <div class="ar">هاتف الزبون</div>
        <div class="en">(Customer Phone)</div>
      </div>
    </div>
    <div class="meta-block">
      <div class="meta-value">${escapeHtml(input.customerName || '—')}</div>
      <div class="meta-label">
        <div class="ar">اسم الزبون</div>
        <div class="en">(Customer Name)</div>
      </div>
    </div>
  </div>

  <!-- ─────────── Services table ─────────── -->
  <div class="lines-wrap">
    <table class="lines">
      <thead>
        <tr>
          <th style="width:18%">الإجمالي<span class="en">(Total)</span></th>
          <th style="width:18%">قيمة الوحدة<span class="en">(Unit Price)</span></th>
          <th style="width:12%">الكمية<span class="en">(Qty)</span></th>
          <th style="width:52%">الخدمات<span class="en">(Service)</span></th>
        </tr>
      </thead>
      <tbody>
        ${servicesRows}
      </tbody>
    </table>
  </div>

  <!-- ─────────── Bottom: terms + summary ─────────── -->
  <div class="bottom-section">
    ${termsHtml}
    ${summaryHtml}
  </div>

  <!-- ─────────── Footer ─────────── -->
  ${footerHtml(input.assets.footer)}

</body>
</html>`
}
