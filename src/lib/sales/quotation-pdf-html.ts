/**
 * Builds the self-contained HTML for the SO Quotation PDF.
 *
 * Uses the shared PDF brand module (`@/lib/pdf/pdf-fonts`) for IBM Plex Sans
 * fonts, company header, contact strip, footer, and base CSS. The layout
 * matches `public/brand/so-quotation-preview.html`.
 *
 * Ribbon: "عرض سعر" / "Quotation"
 * Meta: Quote Date | Validity | Customer Phone | Customer Name
 * Table: الصنف (Item) 48% | الكمية (Qty) 10% | سعر الوحدة (Unit Price) 16% | الإجمالي (Total) 16%
 * Bottom: Terms (left) + Summary column (right) — Subtotal, Discount, Grand Total
 */

import type { PdfFonts, PdfAssets } from '@/lib/pdf/pdf-fonts'
import {
  fontFacesCss,
  BASE_CSS,
  brandHeaderHtml,
  contactStripHtml,
  footerHtml,
  stampSectionHtml,
} from '@/lib/pdf/pdf-fonts'

export interface QuotationLineItem {
  item_name:    string
  item_name_ar: string | null
  sku:          string | null
  qty:          number
  unit:         string
  unit_price:   number
  total:        number
  line_type:    string
}

export interface BuildQuotationHtmlInput {
  so_number:        string
  created_at:       string                       // ISO
  validity_days:    number
  currency:         string
  customer_name:    string
  customer_phone:   string | null
  lines:            QuotationLineItem[]
  subtotal:                 number
  discount_amount_resolved: number
  discount_label:           string | null
  total:                    number
  payment_terms:        string | null
  payment_terms_notes:  string | null
  delivery_terms:       string | null
  delivery_terms_notes: string | null
  customer_notes:       string | null
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

const CURRENCY_PREFIXES: Record<string, string> = {
  QAR: 'QAR ', USD: '$', EUR: '€', GBP: '£', AED: 'AED ', SAR: 'SAR ', KWD: 'KWD ',
}
function fmtMoney(amount: number, currency: string): string {
  const prefix = CURRENCY_PREFIXES[currency] ?? `${currency} `
  return `${prefix}${amount.toLocaleString('en-QA', {
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

// ── Template ────────────────────────────────────────────────────────────────

export function buildQuotationHtml(input: BuildQuotationHtmlInput): string {
  const currency  = input.currency || 'QAR'
  const quoteDate = fmtDate(input.created_at)
  const validity  = `${input.validity_days} days`

  // RTL table — rightmost column = first <th>/<td> in source
  const lineRows = input.lines.map((li) => `
    <tr>
      <td class="cell-item">
        <div class="item-name">${escapeHtml(li.item_name)}</div>
        ${li.item_name_ar ? `<div class="item-name-ar">${escapeHtml(li.item_name_ar)}</div>` : ''}
        ${li.sku ? `<div class="item-sku">${escapeHtml(li.sku)}</div>` : ''}
      </td>
      <td class="cell-num">${escapeHtml(String(li.qty))}</td>
      <td class="cell-num">${escapeHtml(fmtMoney(li.unit_price, currency))}</td>
      <td class="cell-num">${escapeHtml(fmtMoney(li.total,      currency))}</td>
    </tr>
  `).join('')

  const termsHtml = (input.payment_terms || input.delivery_terms || input.customer_notes) ? `
    <div class="terms-wrap">
      <div class="terms">
        ${input.payment_terms ? `
          <div class="terms-row">
            <div class="terms-key">Payment Terms</div>
            <div class="terms-val">${escapeHtml(input.payment_terms)}${input.payment_terms_notes ? ` — ${escapeHtml(input.payment_terms_notes)}` : ''}</div>
          </div>` : ''}
        ${input.delivery_terms ? `
          <div class="terms-row">
            <div class="terms-key">Delivery Terms</div>
            <div class="terms-val">${escapeHtml(input.delivery_terms)}${input.delivery_terms_notes ? ` — ${escapeHtml(input.delivery_terms_notes)}` : ''}</div>
          </div>` : ''}
        ${input.customer_notes ? `
          <div class="terms-row">
            <div class="terms-key">Notes</div>
            <div class="terms-val">${escapeHtml(input.customer_notes)}</div>
          </div>` : ''}
      </div>
    </div>` : '<div class="terms-wrap"></div>'

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<title>Quotation — ${escapeHtml(input.so_number)}</title>
<style>
  ${fontFacesCss(input.fonts)}
  ${BASE_CSS}
  .summary-divider { height: 0.7px; background: var(--text); }
</style>
</head>
<body>

  <!-- ─────────── Top: company logo + bilingual addresses ─────────── -->
  ${brandHeaderHtml(input.assets.brandHeader ?? input.assets.logo)}

  <!-- ─────────── Mid bar: contact strip + dark strip + orange ribbon ─────────── -->
  <div class="midbar">
    ${contactStripHtml()}
    <div class="dark-strip"></div>
    <div class="ribbon">
      <div class="ar-title">عرض سعر</div>
      <div class="en-title">Quotation</div>
      <div class="doc-no">${escapeHtml(input.so_number)}</div>
    </div>
  </div>

  <!-- ─────────── Meta blocks (4: Quote Date / Validity / Customer Phone / Customer Name) ─────────── -->
  <div class="meta">
    <div class="meta-block">
      <div class="meta-value">${escapeHtml(quoteDate)}</div>
      <div class="meta-label">
        <div class="ar">تاريخ عرض السعر</div>
        <div class="en">(Quote Date)</div>
      </div>
    </div>
    <div class="meta-block">
      <div class="meta-value">${escapeHtml(validity)}</div>
      <div class="meta-label">
        <div class="ar">مدة الصلاحية</div>
        <div class="en">(Validity)</div>
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
      <div class="meta-value">${escapeHtml(input.customer_name)}</div>
      <div class="meta-label">
        <div class="ar">اسم الزبون</div>
        <div class="en">(Customer Name)</div>
      </div>
    </div>
  </div>

  <!-- ─────────── Line items ─────────── -->
  <div class="lines-wrap">
    <table class="lines">
      <thead>
        <tr>
          <th style="width:48%">الصنف<span class="en">(Item)</span></th>
          <th style="width:10%">الكمية<span class="en">(Qty)</span></th>
          <th style="width:16%">سعر الوحدة<span class="en">(Unit Price)</span></th>
          <th style="width:16%">الإجمالي<span class="en">(Total)</span></th>
        </tr>
      </thead>
      <tbody>
        ${lineRows}
      </tbody>
    </table>
  </div>

  <!-- ─────────── Terms + Summary ─────────── -->
  <div class="bottom-section">
    ${termsHtml}
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
        <span class="s-amount">${escapeHtml(fmtMoney(input.discount_amount_resolved, currency))}</span>
      </div>
      <div class="summary-divider"></div>
      <div class="summary-row s-grand">
        <span class="s-label">الإجمالي النهائي</span>
        <span class="s-en">Grand Total</span>
        <span class="s-sep">:</span>
        <span class="s-amount">${escapeHtml(fmtMoney(input.total, currency))}</span>
      </div>
    </div>
  </div>

  <!-- ─────────── Footer ─────────── -->
  ${stampSectionHtml(input.assets.stamp)}

  ${footerHtml(input.assets.footer)}

</body>
</html>`
}
