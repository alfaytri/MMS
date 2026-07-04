import type { PdfFonts, PdfAssets } from '@/lib/pdf/pdf-fonts'
import {
  fontFacesCss,
  brandHeaderHtml,
  contactStripHtml,
  footerHtml,
  BASE_CSS,
} from '@/lib/pdf/pdf-fonts'

export interface BillLineItem {
  description:  string
  qty:          number | null
  unit_price:   number
  total:        number
}

export interface BillPaymentRow {
  date:      string
  amount:    number
  method:    string
  reference: string | null
}

export interface BuildBillHtmlInput {
  billId:          string
  poNumber:        string | null
  poDate:          string | null
  supplierName:    string
  supplierPhone:   string | null
  supplierEmail:   string | null
  supplierAddress: string | null
  supplierRef:     string | null
  dueDate:         string
  lines:           BillLineItem[]
  subtotal:        number
  discountAmount:  number
  discountLabel:   string | null
  totalAmount:     number
  currency:        string
  payments:        BillPaymentRow[]
  amountPaid:      number
  outstanding:     number
  isPaid:          boolean
  notes:           string | null
  assets:          PdfAssets
  fonts:           PdfFonts
}

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
  const day = String(d.getUTCDate()).padStart(2, '0')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${day} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

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

export function buildBillHtml(input: BuildBillHtmlInput): string {
  const {
    billId, poNumber, poDate, supplierName, supplierPhone,
    supplierRef, dueDate, lines, subtotal, discountAmount,
    discountLabel, totalAmount, currency, payments, amountPaid,
    outstanding, isPaid, notes, assets, fonts,
  } = input

  const showDiscount = (discountAmount ?? 0) > 0

  const lineRows = lines.map((li, i) => `
    <tr>
      <td class="cell-num">${i + 1}</td>
      <td class="cell-item">
        <div class="item-name">${escapeHtml(li.description)}</div>
      </td>
      <td class="cell-num">${li.qty ?? '—'}</td>
      <td class="cell-num">${escapeHtml(fmtMoney(li.unit_price, currency))}</td>
      <td class="cell-num">${escapeHtml(fmtMoney(li.total, currency))}</td>
    </tr>`).join('')

  const metaBlocks: string[] = []
  if (poNumber) {
    metaBlocks.push(metaBlock(escapeHtml(poNumber), 'رقم أمر الشراء', 'PO Number'))
  }
  if (poDate) {
    metaBlocks.push(metaBlock(fmtDate(poDate), 'تاريخ الطلب', 'Order Date'))
  }
  metaBlocks.push(metaBlock(escapeHtml(supplierName), 'اسم المورد', 'Supplier Name'))
  if (supplierPhone) {
    metaBlocks.push(metaBlock(escapeHtml(supplierPhone), 'هاتف المورد', 'Supplier Phone'))
  }
  if (supplierRef) {
    metaBlocks.push(metaBlock(escapeHtml(supplierRef), 'مرجع المورد', 'Supplier Ref'))
  }
  const dueDateObj = new Date(dueDate)
  const now = new Date()
  now.setUTCHours(0, 0, 0, 0)
  dueDateObj.setUTCHours(0, 0, 0, 0)
  const diffDays = Math.round((dueDateObj.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  let dueSuffix = ''
  if (!Number.isNaN(diffDays)) {
    if (diffDays > 0) dueSuffix = ` (${diffDays} day${diffDays > 1 ? 's' : ''} left)`
    else if (diffDays === 0) dueSuffix = ' (today)'
    else dueSuffix = ` (overdue ${Math.abs(diffDays)} day${Math.abs(diffDays) > 1 ? 's' : ''})`
  }
  metaBlocks.push(metaBlock(fmtDate(dueDate) + dueSuffix, 'تاريخ الاستحقاق', 'Due Date'))

  const paymentRows = payments.length > 0
    ? payments.map((p) => `
      <tr>
        <td>${escapeHtml(fmtDate(p.date))}</td>
        <td>${escapeHtml(fmtMoney(p.amount, currency))}</td>
        <td>${escapeHtml(p.method.replace(/_/g, ' '))}</td>
        <td>${escapeHtml(p.reference ?? '—')}</td>
      </tr>`).join('')
    : `<tr><td colspan="4" style="text-align:center;color:var(--muted);font-style:italic;">No payments recorded</td></tr>`

  const outstandingClass = outstanding > 0 ? ' s-outstanding' : ''

  const notesHtml = notes
    ? `<div class="notes-block"><span class="notes-label">Notes:</span> ${escapeHtml(notes)}</div>`
    : ''

  const paidStampHtml = isPaid
    ? `<div class="paid-stamp">PAID</div>`
    : ''

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<title>Al Faytri — Purchase Bill</title>
<style>
  ${fontFacesCss(fonts)}
  ${BASE_CSS}

  /* ─── Bill-specific ─── */
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

  /* LTR line-items table for bills (PO uses RTL) */
  table.lines { direction: ltr; }
  table.lines td.cell-item { text-align: left; }
  table.lines th { text-align: center; }
</style>
</head>
<body>

  ${paidStampHtml}

  ${brandHeaderHtml(assets.logo)}

  <div class="midbar">
    ${contactStripHtml()}
    <div class="dark-strip"></div>
    <div class="ribbon">
      <div class="ar-title">فاتورة مشتريات</div>
      <div class="en-title">Purchase Bill</div>
      <div class="doc-no">${escapeHtml(billId)}</div>
    </div>
  </div>

  <div class="meta">
    ${metaBlocks.join('\n    ')}
  </div>

  <div class="lines-wrap">
    <table class="lines">
      <thead>
        <tr>
          <th style="width:5%">#</th>
          <th style="width:43%">الصنف<span class="en">(Item)</span></th>
          <th style="width:10%">الكمية<span class="en">(Qty)</span></th>
          <th style="width:21%">سعر الوحدة<span class="en">(Unit Price)</span></th>
          <th style="width:21%">الإجمالي<span class="en">(Total)</span></th>
        </tr>
      </thead>
      <tbody>
        ${lineRows}
      </tbody>
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
    </div>
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
        <span class="s-en">${discountLabel ? `Discount (${escapeHtml(discountLabel)})` : 'Discount'}</span>
        <span class="s-sep">:</span>
        <span class="s-amount">${escapeHtml(fmtMoney(discountAmount, currency))}</span>
      </div>
      ` : ''}
      <div class="summary-row s-grand">
        <span class="s-label">الإجمالي النهائي</span>
        <span class="s-en">Grand Total</span>
        <span class="s-sep">:</span>
        <span class="s-amount">${escapeHtml(fmtMoney(totalAmount, currency))}</span>
      </div>
      <div class="summary-divider"></div>
      <div class="summary-row">
        <span class="s-label">المبلغ المدفوع</span>
        <span class="s-en">Amount Paid</span>
        <span class="s-sep">:</span>
        <span class="s-amount">${escapeHtml(fmtMoney(amountPaid, currency))}</span>
      </div>
      <div class="summary-row">
        <span class="s-label">الرصيد المتبقي</span>
        <span class="s-en">Outstanding</span>
        <span class="s-sep">:</span>
        <span class="s-amount${outstandingClass}">${escapeHtml(fmtMoney(outstanding, currency))}</span>
      </div>
    </div>
  </div>

  ${notesHtml}

  ${footerHtml(assets.footer)}

</body>
</html>`
}
