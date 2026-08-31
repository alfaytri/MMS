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
  item_name:         string
  item_name_ar?:     string | null
  brand_variant_id?: string | null
  sku:               string | null
  qty:               number
  unit:              string
  unit_price:        number
  total_price:       number
  /** Per-line flag: whether to show the spec on this PO (set at PO creation). */
  show_specification?: boolean
  /** Resolved item specification text — present only when it should print. */
  specification?:    string | null
  /** Full category breadcrumb (root › … › leaf), printed above the item name. */
  category_path?:    string | null
  /** Catalog item name — shown when item_name (the vendor name) is left blank. */
  catalog_name?:     string | null
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
  quote_deadline:    string | null   // RFQ response deadline (used when variant === 'rfq')
  vendor_notes:      string | null   // free-form notes to the vendor, rendered on every variant
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

// Suppliers fill these fields with pen on the printed RFQ.
const RFQ_BLANK = '&nbsp;'
// Default response window: 5 days from the RFQ creation date.
function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString()
}

// ── Template ───────────────────────────────────────────────────────────────

export function buildPurchaseOrderHtml(input: BuildPoHtmlInput): string {
  const {
    po_number, created_date, expected_delivery, supplier_name,
    supplier_phone, rfq_number, status, lines, subtotal,
    discount_amount, total_qar, currency, payment_terms,
    delivery_terms, quote_deadline, vendor_notes,
    variant, payments, amount_paid,
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

  const isRfq        = variant === 'rfq'
  const showPayments = variant === 'po' || variant === 'confirmed'
  const showDiscount = !isRfq && (discount_amount ?? 0) > 0

  // ── Line-item rows ──────────────────────────────────────────────────
  // For RFQs, unit price + total cells render blank so the supplier fills them.
  const lineRows = lines.map((li) => {
    // Vendor name (item_name) wins; fall back to the catalog name so a line
    // is never printed nameless when the "Vendor Item Name" field is blank.
    const displayName = li.item_name && li.item_name.trim()
      ? li.item_name
      : (li.catalog_name && li.catalog_name.trim() ? li.catalog_name : li.item_name)

    const catHtml = li.category_path && li.category_path.trim()
      ? `<div class="item-cat">${escapeHtml(li.category_path)}</div>`
      : ''
    const nameArHtml = li.item_name_ar
      ? `<div class="item-name-ar">${escapeHtml(li.item_name_ar)}</div>`
      : ''
    const skuHtml = li.sku
      ? `<div class="item-sku">${escapeHtml(li.sku)}</div>`
      : ''
    const specHtml = li.specification && li.specification.trim()
      ? `<div class="item-spec">${escapeHtml(li.specification).replace(/\n/g, '<br>')}</div>`
      : ''

    const unitPriceCell = isRfq ? RFQ_BLANK : escapeHtml(fmtMoney(li.unit_price, currency))
    const totalCell     = isRfq ? RFQ_BLANK : escapeHtml(fmtMoney(li.total_price, currency))

    return `
      <tr>
        <td class="cell-item">
          ${catHtml}
          <div class="item-name">${escapeHtml(displayName)}</div>
          ${nameArHtml}
          ${skuHtml}
          ${specHtml}
        </td>
        <td class="cell-num">${escapeHtml(li.unit)}</td>
        <td class="cell-num">${li.qty}</td>
        <td class="cell-num">${unitPriceCell}</td>
        <td class="cell-num">${totalCell}</td>
      </tr>`
  }).join('')

  // ── Meta blocks ──────────────────────────────────────────────────────
  const metaBlocks: string[] = []

  metaBlocks.push(metaBlock(fmtDate(created_date), 'تاريخ الطلب', 'Order Date'))

  if (isRfq) {
    metaBlocks.push(metaBlock(
      expected_delivery ? fmtDate(expected_delivery) : RFQ_BLANK,
      'موعد التسليم المطلوب',
      'Required By',
    ))
    metaBlocks.push(metaBlock(
      fmtDate(quote_deadline ?? addDaysIso(created_date, 5)),
      'يرجى الرد قبل',
      'Please Quote By',
    ))
    // Supplier fields left blank for the recipient to fill in with pen.
    metaBlocks.push(metaBlock(RFQ_BLANK, 'اسم المورد', 'Supplier Name'))
    metaBlocks.push(metaBlock(RFQ_BLANK, 'هاتف المورد', 'Supplier Phone'))
  } else {
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
  }

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
  // On RFQs we show the two headings with blank values so the supplier can
  // propose their own terms in ink.
  const termsRows: string[] = []
  if (isRfq) {
    termsRows.push(`
      <div class="terms-row">
        <div class="terms-key">Payment Terms</div>
        <div class="terms-val">${RFQ_BLANK}</div>
      </div>`)
    termsRows.push(`
      <div class="terms-row">
        <div class="terms-key">Delivery Terms</div>
        <div class="terms-val">${RFQ_BLANK}</div>
      </div>`)
    termsRows.push(`
      <div class="terms-row">
        <div class="terms-key">Quote Validity</div>
        <div class="terms-val">${RFQ_BLANK}</div>
      </div>`)
  } else {
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
  }

  // ── Vendor notes (rendered on every variant when populated) ─────────
  const vendorNotesHtml = vendor_notes && vendor_notes.trim() ? `
  <div class="vendor-notes">
    <div class="vendor-notes-title">
      <span class="ar">ملاحظات للمورد</span>
      <span class="en">Vendor Notes</span>
    </div>
    <div class="vendor-notes-body">${escapeHtml(vendor_notes)}</div>
  </div>
  ` : ''

  // ── RFQ instructions (only on the RFQ variant) ──────────────────────
  const rfqInstructionsHtml = isRfq ? `
  <div class="rfq-instructions">
    <div class="rfq-instructions-title">
      <span class="ar">تعليمات لتقديم العرض</span>
      <span class="en">Instructions to Supplier</span>
    </div>
    <ul>
      <li>Please quote your best unit price and line total in the price columns above.</li>
      <li>Fill in your name, phone, payment terms, delivery terms and quote validity.</li>
      <li>Return the signed quote by the <strong>Please Quote By</strong> date shown above.</li>
      <li>Send the completed quote to <strong>purchases@alfaytri.com</strong> or WhatsApp <strong>+974 4410 6900</strong>.</li>
    </ul>
  </div>
  ` : ''

  // ── Full HTML document ──────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<title>${enTitle}</title>
<style>
  ${fontFacesCss(fonts)}
  ${BASE_CSS}

  /* ─── PO-specific: category breadcrumb above the item name ─── */
  table.lines td.cell-item .item-cat {
    font-family: 'IBMPlexSans', sans-serif; font-size: 6.5px; color: var(--muted);
    text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 1.5px;
    line-height: 1.25;
  }

  /* ─── PO-specific: item specification (Inventory + Purchasing only) ─── */
  table.lines td.cell-item .item-spec {
    font-family: 'IBMPlexSans', sans-serif; font-size: 7.5px; color: var(--muted);
    margin-top: 2px; line-height: 1.35; white-space: normal;
  }

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

  /* ─── RFQ instructions block ─── */
  .rfq-instructions {
    margin: 4mm 8mm 0 8mm;
    border: 0.7px solid var(--text);
    padding: 3mm 4mm;
  }
  .rfq-instructions-title {
    display: flex; justify-content: space-between; align-items: baseline;
    font-family: 'IBMPlexSans', sans-serif; font-weight: 600; font-size: 9px;
    color: var(--text); border-bottom: 0.7px solid var(--grey-rule);
    padding-bottom: 1.5mm; margin-bottom: 2mm;
  }
  .rfq-instructions-title .ar {
    font-family: 'IBMPlexSansArabic', sans-serif; direction: rtl;
  }
  .rfq-instructions ul {
    margin: 0; padding-left: 4mm;
    font-family: 'IBMPlexSans', sans-serif; font-size: 8px; line-height: 1.55;
    color: var(--text);
  }
  .rfq-instructions li { margin-bottom: 0.8mm; }

  /* ─── Vendor notes block ─── */
  .vendor-notes {
    margin: 4mm 8mm 0 8mm;
    border: 0.7px solid var(--grey-rule);
    padding: 3mm 4mm;
    background: var(--muted-bg, #fafafa);
  }
  .vendor-notes-title {
    display: flex; justify-content: space-between; align-items: baseline;
    font-family: 'IBMPlexSans', sans-serif; font-weight: 600; font-size: 9px;
    color: var(--text); border-bottom: 0.7px solid var(--grey-rule);
    padding-bottom: 1.5mm; margin-bottom: 2mm;
  }
  .vendor-notes-title .ar {
    font-family: 'IBMPlexSansArabic', sans-serif; direction: rtl;
  }
  .vendor-notes-body {
    font-family: 'IBMPlexSans', sans-serif; font-size: 8px; line-height: 1.5;
    color: var(--text); white-space: pre-wrap;
  }
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
        <span class="s-amount">${isRfq ? RFQ_BLANK : escapeHtml(fmtMoney(subtotal, currency))}</span>
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
        <span class="s-amount">${isRfq ? RFQ_BLANK : escapeHtml(fmtMoney(total_qar, currency))}</span>
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

  ${vendorNotesHtml}

  ${rfqInstructionsHtml}

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
