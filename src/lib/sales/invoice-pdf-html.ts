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

export interface InvoiceLineItem {
  description:    string
  description_ar?: string | null
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
  payment_terms:   string | null
  notes:           string | null
  isPaid:          boolean
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
        <div class="item-name">${escapeHtml(li.description)}</div>
        ${li.description_ar ? `<div class="item-name-ar">${escapeHtml(li.description_ar)}</div>` : ''}
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

  const termsRows: string[] = []
  if (input.payment_terms) {
    termsRows.push(`
      <div class="terms-row">
        <div class="terms-key">Payment Terms</div>
        <div class="terms-val">${escapeHtml(input.payment_terms)}</div>
      </div>`)
  }
  if (input.so_number) {
    termsRows.push(`
      <div class="terms-row">
        <div class="terms-key">SO Reference</div>
        <div class="terms-val">${escapeHtml(input.so_number)}</div>
      </div>`)
  }

  const outstandingClass = input.outstanding > 0 ? ' s-outstanding' : ''

  const paidStampHtml = input.isPaid
    ? `<div class="paid-stamp">PAID</div>`
    : ''

  const notesHtml = input.notes
    ? `<div class="notes-block"><span class="notes-label">Notes:</span> ${escapeHtml(input.notes)}</div>`
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
      ${termsRows.length > 0 ? `<div class="terms">${termsRows.join('')}</div>` : ''}
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

  ${notesHtml}

  ${stampSectionHtml(input.assets.stamp)}

  ${footerHtml(input.assets.footer)}

</body>
</html>`
}
