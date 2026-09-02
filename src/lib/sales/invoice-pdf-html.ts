/**
 * Builds the self-contained HTML for the AR Invoice PDF.
 *
 * Uses the shared brand module (`@/lib/pdf/pdf-fonts`) for IBM Plex Sans /
 * Arabic fonts, company header, contact strip, footer, and base CSS.
 * Adds invoice-specific sections: bilingual meta blocks, line-items table,
 * payments table, summary column, and terms.
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
import { orderNotesTermsHtml } from '@/lib/pdf/order-notes'

export interface InvoiceLineItem {
  description:    string
  description_ar?: string | null
  brand_variant_id?: string | null
  origin?:        string | null
  /** Full category breadcrumb (root › … › leaf), printed above the item name. */
  category_path?: string | null
  qty:            number | null
  unit_price:     number | null
  total:          number | null
}

export interface InvoicePayment {
  date:      string
  amount:    number
  method:    string
  reference: string | null
}

export interface InvoiceInstallment {
  due_date:    string | null
  amount:      number
  paid_amount: number
  status:      string
}

export interface BuildInvoiceHtmlInput {
  invoice_id:      string
  invoice_type:    'cash' | 'credit'
  issued_date:     string
  due_date:        string
  customer_name:   string
  customer_phone:  string | null
  so_number:       string | null
  currency?:       string
  lines:           InvoiceLineItem[]
  subtotal:        number
  discount:        number
  total_amount:    number
  amount_paid:     number
  outstanding:     number
  payments:        InvoicePayment[]
  payment_terms:        string | null
  payment_terms_notes:  string | null
  delivery_terms:       string | null
  delivery_terms_notes: string | null
  customer_notes:       string | null
  isPaid:          boolean
  plan_type?:      'schedule' | 'adhoc' | null
  installments?:   InvoiceInstallment[]
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

// Six-domains H3: derive currency label from the invoice, not hardcoded QAR.
function fmtMoney(amount: number | null, currency: string = 'QAR'): string {
  const n = amount ?? 0
  return `${currency} ${n.toLocaleString('en-QA', {
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

export function buildInvoiceHtml(input: BuildInvoiceHtmlInput): string {
  const currency = input.currency ?? 'QAR'
  const lineRows = input.lines.map((li) => `
    <tr>
      <td class="cell-item">
        ${li.category_path ? `<div class="item-cat">${escapeHtml(li.category_path)}</div>` : ''}
        <div class="item-name">${escapeHtml(li.description)}</div>
        ${li.description_ar ? `<div class="item-name-ar">${escapeHtml(li.description_ar)}</div>` : ''}
        ${li.origin ? `<div class="item-origin">Origin: ${escapeHtml(li.origin)}</div>` : ''}
      </td>
      <td class="cell-num">${escapeHtml(li.qty == null ? '—' : String(li.qty))}</td>
      <td class="cell-num">${escapeHtml(fmtMoney(li.unit_price, currency))}</td>
      <td class="cell-num">${escapeHtml(fmtMoney(li.total, currency))}</td>
    </tr>
  `).join('')

  const paymentRows = input.payments.length > 0
    ? input.payments.map((p) => `
      <tr>
        <td>${escapeHtml(fmtDate(p.date))}</td>
        <td>${escapeHtml(fmtMoney(p.amount, currency))}</td>
        <td>${escapeHtml(p.method)}</td>
        <td>${escapeHtml(p.reference ?? '—')}</td>
      </tr>
    `).join('')
    : `<tr><td colspan="4" style="text-align:center;color:var(--muted);font-style:italic;">No payments recorded</td></tr>`

  const installments = input.installments ?? []
  const installmentSection = installments.length > 0 ? `
    <div class="plan-wrap">
      <div class="plan-title">Payment Schedule${input.plan_type ? ` — ${input.plan_type === 'schedule' ? 'Scheduled' : 'Ad-hoc'}` : ''}</div>
      <table class="plan-table">
        <thead>
          <tr>
            <th style="width:6%">#</th>
            <th style="width:30%">Due Date</th>
            <th style="width:22%">Amount</th>
            <th style="width:22%">Paid</th>
            <th style="width:20%">Status</th>
          </tr>
        </thead>
        <tbody>
          ${installments.map((inst, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${inst.due_date ? escapeHtml(fmtDate(inst.due_date)) : '—'}</td>
              <td class="cell-num">${escapeHtml(fmtMoney(inst.amount, currency))}</td>
              <td class="cell-num">${escapeHtml(fmtMoney(inst.paid_amount, currency))}</td>
              <td>${escapeHtml(inst.status)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : ''

  const termsRows: string[] = []
  if (input.so_number) {
    termsRows.push(`
      <div class="terms-row">
        <div class="terms-key">SO Reference</div>
        <div class="terms-val">${escapeHtml(input.so_number)}</div>
      </div>`)
  }
  // Notes we entered on the Sales Order (payment/delivery terms + customer notes).
  const termsInner = termsRows.join('') + orderNotesTermsHtml(input)

  const outstandingClass = input.outstanding > 0 ? ' s-outstanding' : ''

  const paidStampHtml = input.isPaid
    ? `<div class="paid-stamp">PAID</div>`
    : ''

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<title>Invoice — ${escapeHtml(input.invoice_id)}</title>
<style>
  ${fontFacesCss(input.fonts)}
  ${BASE_CSS}

  /* ─── Invoice-specific: payments table ─── */
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

  /* ─── Invoice-specific: outstanding highlight ─── */
  .summary-row .s-outstanding { color: #dc2626; font-size: 10px; }
  .summary-divider { height: 0.7px; background: var(--text); }

  .notes-block {
    margin: 3mm 14mm 0; padding: 2mm 3mm;
    font-family: 'IBMPlexSans', sans-serif; font-size: 9px;
    font-style: italic; color: var(--muted);
    border-left: 2px solid var(--orange);
  }
  .notes-block .notes-label { font-weight: 600; color: var(--text); font-style: normal; }

  /* ─── Payment Schedule (from active payment plan) ─── */
  .plan-wrap {
    margin: 4mm 14mm 0;
    font-family: 'IBMPlexSans', sans-serif;
  }
  .plan-title {
    font-size: 9px; font-weight: 600; color: var(--text);
    text-transform: uppercase; letter-spacing: 0.5px;
    margin-bottom: 1.5mm;
  }
  table.plan-table {
    width: 100%; border-collapse: collapse; font-size: 9px;
    border: 0.7px solid var(--grey-rule);
  }
  table.plan-table th {
    background: var(--grey-bg); color: var(--text); font-weight: 600;
    text-align: left; padding: 1.5mm 2.5mm;
    border-right: 0.7px solid var(--grey-rule);
    border-bottom: 0.7px solid var(--grey-rule);
  }
  table.plan-table th:last-child { border-right: 0; }
  table.plan-table td {
    padding: 1.5mm 2.5mm;
    border-right: 0.7px solid var(--grey-rule);
    border-top: 0.7px solid var(--grey-rule);
  }
  table.plan-table td:last-child { border-right: 0; }
  table.plan-table td.cell-num { text-align: right; font-variant-numeric: tabular-nums; }

  .paid-stamp {
    position: absolute; top: 45%; left: 50%;
    transform: translate(-50%, -50%) rotate(-30deg);
    font-family: 'IBMPlexSans', sans-serif; font-weight: 900;
    font-size: 80px; color: rgba(34, 197, 94, 0.12);
    letter-spacing: 8px; pointer-events: none; user-select: none;
    z-index: 10;
  }

  /* LTR line-items table for invoices */
  table.lines { direction: ltr; }
  table.lines td.cell-item { text-align: left; }
  table.lines td.cell-item .item-cat { font-family: 'IBMPlexSans', sans-serif; font-size: 6.5px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 1.5px; line-height: 1.25; }
  table.lines td.cell-item .item-origin { font-family: 'IBMPlexSans', sans-serif; font-size: 8px; color: var(--muted); margin-top: 1px; }
  table.lines th { text-align: center; }
</style>
</head>
<body>

  ${paidStampHtml}

  ${brandHeaderHtml(input.assets.brandHeader ?? input.assets.logo)}

  <div class="midbar">
    ${contactStripHtml()}
    <div class="dark-strip"></div>
    <div class="ribbon">
      <div class="ar-title">فاتورة مبيعات</div>
      <div class="en-title">Sales Invoice</div>
      <div class="doc-no">${escapeHtml(input.invoice_id)}</div>
    </div>
  </div>

  <div class="meta">
    <div class="meta-block">
      <div class="meta-value">${escapeHtml(fmtDate(input.issued_date))}</div>
      <div class="meta-label">
        <div class="ar">تاريخ الإصدار</div>
        <div class="en">(Issued Date)</div>
      </div>
    </div>
    <div class="meta-block">
      <div class="meta-value">${escapeHtml(fmtDate(input.due_date))}</div>
      <div class="meta-label">
        <div class="ar">تاريخ الاستحقاق</div>
        <div class="en">(Due Date)</div>
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
      <div class="meta-value">${escapeHtml(input.so_number ?? '—')}</div>
      <div class="meta-label">
        <div class="ar">رقم أمر البيع</div>
        <div class="en">(Sale Order #)</div>
      </div>
    </div>
    <div class="meta-block">
      <div class="meta-value">${escapeHtml(input.invoice_type === 'cash' ? 'Cash' : 'Credit')}</div>
      <div class="meta-label">
        <div class="ar">نوع الفاتورة</div>
        <div class="en">(Invoice Type)</div>
      </div>
    </div>
  </div>

  <div class="lines-wrap">
    <table class="lines">
      <thead>
        <tr>
          <th style="width:48%">الوصف<span class="en">(Description)</span></th>
          <th style="width:12%">الكمية<span class="en">(Qty)</span></th>
          <th style="width:18%">سعر الوحدة<span class="en">(Unit Price)</span></th>
          <th style="width:18%">الإجمالي<span class="en">(Total)</span></th>
        </tr>
      </thead>
      <tbody>${lineRows}</tbody>
    </table>
  </div>

  <div class="bottom-section">
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
      ${termsInner ? `<div class="terms">${termsInner}</div>` : ''}
    </div>
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
        <span class="s-amount">${escapeHtml(fmtMoney(input.total_amount, currency))}</span>
      </div>
      <div class="summary-divider"></div>
      <div class="summary-row s-bill-total">
        <span class="s-label">إجمالي الفاتورة</span>
        <span class="s-en">Invoice Total</span>
        <span class="s-sep">:</span>
        <span class="s-amount">${escapeHtml(fmtMoney(input.total_amount, currency))}</span>
      </div>
      <div class="summary-row">
        <span class="s-label">المبلغ المدفوع</span>
        <span class="s-en">Amount Paid</span>
        <span class="s-sep">:</span>
        <span class="s-amount">${escapeHtml(fmtMoney(input.amount_paid, currency))}</span>
      </div>
      <div class="summary-row">
        <span class="s-label">الرصيد المتبقي</span>
        <span class="s-en">Outstanding</span>
        <span class="s-sep">:</span>
        <span class="s-amount${outstandingClass}">${escapeHtml(fmtMoney(input.outstanding, currency))}</span>
      </div>
    </div>
  </div>

  ${installmentSection}

  ${stampSectionHtml(input.assets.stamp)}

  ${footerHtml(input.assets.footer)}

</body>
</html>`
}
