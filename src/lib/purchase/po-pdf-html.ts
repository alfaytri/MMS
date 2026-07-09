/**
 * Builds the self-contained HTML for the Purchase Order / Confirmed Purchase
 * Order PDF.
 *
 * Uses the shared brand module (`@/lib/pdf/pdf-fonts`) for IBM Plex Sans /
 * Arabic fonts, company header, contact strip, footer, and base CSS.
 * Adds PO-specific sections: bilingual meta blocks, line-items table,
 * summary column, and terms.
 *
 * The only difference between PO and Confirmed PO is the ribbon text and
 * doc-no prefix — both share the orange colour scheme.
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

export type PoPdfVariant = 'rfq' | 'draft' | 'po' | 'confirmed'

// ── Interfaces ─────────────────────────────────────────────────────────────

export interface PoLineItem {
  item_name:    string
  item_name_ar?: string | null
  sku:          string | null
  qty:          number
  unit:         string
  unit_price:   number
  total_price:  number
}

export interface PoPayment {
  date:      string
  amount:    number
  method:    string
  reference: string | null
}

export interface BuildPoHtmlInput {
  po_number:         string
  created_date:      string          // ISO date
  expected_delivery: string | null   // ISO date
  supplier_name:     string
  supplier_phone:    string | null
  rfq_number:        string | null   // linked RFQ reference
  status:            string          // PO status for display
  lines:             PoLineItem[]
  subtotal:          number
  discount_amount:   number
  total_qar:         number
  currency:          string
  payment_terms:     string | null
  delivery_terms:    string | null
  variant:           PoPdfVariant    // rfq | draft | po | confirmed — drives ribbon text and doc-# prefix
  payments:          PoPayment[]
  amount_paid:       number
  outstanding:       number
  assets:            PdfAssets
  fonts:             PdfFonts
}

// ── Helpers ────────────────────────────────────────────────────────────────

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c])
}

function fmtMoney(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString('en-QA', {
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

// ── Template ───────────────────────────────────────────────────────────────

export function buildPurchaseOrderHtml(input: BuildPoHtmlInput): string {
  const {
    po_number, created_date, expected_delivery, supplier_name,
    supplier_phone, rfq_number, status, lines, subtotal,
    discount_amount, total_qar, currency, payment_terms,
    delivery_terms, variant, payments, amount_paid,
    outstanding, assets, fonts,
  } = input

  // ── Variant → ribbon + doc-# prefix ──────────────────────────────────
  const RIBBON: Record<PoPdfVariant, { ar: string; en: string; prefix: string }> = {
    rfq:       { ar: 'طلب عرض أسعار',   en: 'Request for Quotation',  prefix: 'RFQ-'  },
    draft:     { ar: 'مسودة أمر شراء',  en: 'Draft Purchase Order',   prefix: 'DPO-'  },
    po:        { ar: 'أمر شراء',        en: 'Purchase Order',         prefix: 'PO-'   },
    confirmed: { ar: 'أمر شراء مؤكد',   en: 'Confirmed Purchase Order', prefix: 'CPO-' },
  }
  const arTitle  = RIBBON[variant].ar
  const enTitle  = RIBBON[variant].en
  // Strip whatever prefix the source po_number has (e.g. "PO-00013") and swap in the variant prefix.
  const docNoDisplay = po_number.replace(/^[A-Z]+-/, RIBBON[variant].prefix)

  const showPayments = variant === 'po' || variant === 'confirmed'
  const showDiscount = (discount_amount ?? 0) > 0

  // ── Line-item rows ──────────────────────────────────────────────────
  const lineRows = lines.map((li) => {
    const nameArHtml = li.item_name_ar
      ? `<div class="item-name-ar">${escapeHtml(li.item_name_ar)}</div>`
      : ''
    const skuHtml = li.sku
      ? `<div class="item-sku">${escapeHtml(li.sku)}</div>`
      : ''

    return `
      <tr>
        <td class="cell-item">
          <div class="item-name">${escapeHtml(li.item_name)}</div>
          ${nameArHtml}
          ${skuHtml}
        </td>
        <td class="cell-num">${escapeHtml(li.unit)}</td>
        <td class="cell-num">${li.qty}</td>
        <td class="cell-num">${escapeHtml(fmtMoney(li.unit_price, currency))}</td>
        <td class="cell-num">${escapeHtml(fmtMoney(li.total_price, currency))}</td>
      </tr>`
  }).join('')

  // ── Meta blocks (6 fields) ──────────────────────────────────────────
  const metaBlocks: string[] = []

  metaBlocks.push(metaBlock(fmtDate(created_date), 'تاريخ الطلب', 'Order Date'))
  metaBlocks.push(metaBlock(
    expected_delivery ? fmtDate(expected_delivery) : '—',
    'تاريخ التسليم المتوقع',
    'Expected Delivery',
  ))
  metaBlocks.push(metaBlock(
    supplier_phone ? escapeHtml(supplier_phone) : '—',
    'هاتف المورد',
    'Supplier Phone',
  ))
  metaBlocks.push(metaBlock(escapeHtml(supplier_name), 'اسم المورد', 'Supplier Name'))

  if (rfq_number) {
    metaBlocks.push(metaBlock(escapeHtml(rfq_number), 'رقم طلب عرض الأسعار', 'RFQ #'))
  }

  metaBlocks.push(metaBlock(escapeHtml(status), 'حالة الطلب', 'Order Status'))

  // ── Payment rows ─────────────────────────────────────────────────────
  const paymentRows = payments.length > 0
    ? payments.map((p) => `
      <tr>
        <td>${escapeHtml(fmtDate(p.date))}</td>
        <td>${escapeHtml(fmtMoney(p.amount, currency))}</td>
        <td>${escapeHtml(p.method)}</td>
        <td>${escapeHtml(p.reference ?? '—')}</td>
      </tr>`).join('')
    : `<tr><td colspan="4" style="text-align:center;color:var(--muted);font-style:italic;">No payments recorded</td></tr>`

  const outstandingClass = outstanding > 0 ? ' s-outstanding' : ''

  // ── Terms rows ──────────────────────────────────────────────────────
  const termsRows: string[] = []
  if (payment_terms) {
    termsRows.push(`
      <div class="terms-row">
        <div class="terms-key">Payment Terms</div>
        <div class="terms-val">${escapeHtml(payment_terms)}</div>
      </div>`)
  }
  if (delivery_terms) {
    termsRows.push(`
      <div class="terms-row">
        <div class="terms-key">Delivery Terms</div>
        <div class="terms-val">${escapeHtml(delivery_terms)}</div>
      </div>`)
  }

  // ── Full HTML document ──────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<title>Al Faytri — ${enTitle}</title>
<style>
  ${fontFacesCss(fonts)}
  ${BASE_CSS}

  /* ─── PO-specific: payments table ─── */
  .payments-wrap { flex: 1; }
  table.payments {
    width: 100%; border-collapse: collapse; border: 0.7px solid var(--text);
  }
  table.payments th {
    background: var(--orange); color: #fff; padding: 2mm 2.5mm;
    font-family: 'IBMPlexSans', sans-serif; font-size: 8px; font-weight: 600;
    text-align: left; border-right: 0.7px solid rgba(255,255,255,0.3);
  }
  table.payments th:last-child { border-right: 0; }
  table.payments td {
    padding: 2mm 2.5mm; font-family: 'IBMPlexSans', sans-serif; font-size: 8px;
    border-top: 0.7px solid var(--grey-rule); border-right: 0.7px solid var(--grey-rule);
  }
  table.payments td:last-child { border-right: 0; }

  .summary-row .s-outstanding { color: #dc2626; font-size: 10px; }
  .summary-divider { height: 0.7px; background: var(--text); }
</style>
</head>
<body>

  ${brandHeaderHtml(assets.brandHeader ?? assets.logo)}

  <div class="midbar">
    ${contactStripHtml()}
    <div class="dark-strip"></div>
    <div class="ribbon">
      <div class="ar-title">${arTitle}</div>
      <div class="en-title">${enTitle}</div>
      <div class="doc-no">${escapeHtml(docNoDisplay)}</div>
    </div>
  </div>

  <div class="meta">
    ${metaBlocks.join('\n    ')}
  </div>

  <div class="lines-wrap">
    <table class="lines">
      <thead>
        <tr>
          <th style="width:48%">الصنف<span class="en">(Item)</span></th>
          <th style="width:10%">الوحدة<span class="en">(Unit)</span></th>
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

  <div class="bottom-section"${!showPayments ? ' style="justify-content: flex-end;"' : ''}>
    ${showPayments ? `
    <div class="payments-wrap">
      <table class="payments">
        <thead>
          <tr>
            <th>Date</th>
            <th>Amount</th>
            <th>Method</th>
            <th>Reference</th>
          </tr>
        </thead>
        <tbody>${paymentRows}</tbody>
      </table>
      ${termsRows.length > 0 ? `<div class="terms">${termsRows.join('')}</div>` : ''}
    </div>
    ` : (termsRows.length > 0 ? `<div class="payments-wrap"><div class="terms">${termsRows.join('')}</div></div>` : '')}
    <div class="summary-inner">
      <div class="summary-row">
        <span class="s-label">المجموع الفرعي</span>
        <span class="s-en">Subtotal</span>
        <span class="s-sep">:</span>
        <span class="s-amount">${escapeHtml(fmtMoney(subtotal, currency))}</span>
      </div>
      ${showDiscount ? `
      <div class="summary-row">
        <span class="s-label">قيمة الخصم</span>
        <span class="s-en">Discount</span>
        <span class="s-sep">:</span>
        <span class="s-amount">${escapeHtml(fmtMoney(discount_amount, currency))}</span>
      </div>
      ` : ''}
      <div class="summary-row s-grand">
        <span class="s-label">الإجمالي النهائي</span>
        <span class="s-en">Grand Total</span>
        <span class="s-sep">:</span>
        <span class="s-amount">${escapeHtml(fmtMoney(total_qar, currency))}</span>
      </div>
      ${showPayments ? `
      <div class="summary-divider"></div>
      <div class="summary-row">
        <span class="s-label">المبلغ المدفوع</span>
        <span class="s-en">Amount Paid</span>
        <span class="s-sep">:</span>
        <span class="s-amount">${escapeHtml(fmtMoney(amount_paid, currency))}</span>
      </div>
      <div class="summary-row">
        <span class="s-label">الرصيد المتبقي</span>
        <span class="s-en">Outstanding</span>
        <span class="s-sep">:</span>
        <span class="s-amount${outstandingClass}">${escapeHtml(fmtMoney(outstanding, currency))}</span>
      </div>
      ` : ''}
    </div>
  </div>

  ${stampSectionHtml(assets.stamp)}

  ${footerHtml(assets.footer)}

</body>
</html>`
}

// ── Private helper ─────────────────────────────────────────────────────────

function metaBlock(value: string, arLabel: string, enLabel: string): string {
  return `
    <div class="meta-block">
      <div class="meta-value">${value}</div>
      <div class="meta-label">
        <div class="ar">${arLabel}</div>
        <div class="en">(${enLabel})</div>
      </div>
    </div>`
}
