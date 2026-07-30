import type { PdfFonts, PdfAssets } from '@/lib/pdf/pdf-fonts'
import {
  fontFacesCss,
  brandHeaderHtml,
  contactStripHtml,
  footerHtml,
  stampSectionHtml,
  BASE_CSS,
} from '@/lib/pdf/pdf-fonts'

export interface ReceivalReceiptItem {
  itemName:    string
  itemNameAr?: string | null
  sku:         string | null
  qtyReceived: number
  unitCost:    number
  isFree:      boolean
}

export interface BuildReceivalReceiptHtmlInput {
  receivalNumber: string
  poNumber:       string
  supplierName:   string
  warehouseName:  string | null
  receivedBy:     string | null
  date:           string | null
  notes:          string | null
  items:          ReceivalReceiptItem[]
  assets:         PdfAssets
  fonts:          PdfFonts
}

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}
function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c])
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtQty(n: number): string {
  return n.toLocaleString('en-QA', { maximumFractionDigits: 3 })
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function metaBlock(arLabel: string, enLabel: string, value: string): string {
  return `
    <div class="meta-block">
      <div class="meta-value">${value}</div>
      <div class="meta-label">
        <div class="ar">${arLabel}</div>
        <div class="en">${enLabel}</div>
      </div>
    </div>`
}

export function buildReceivalReceiptHtml(input: BuildReceivalReceiptHtmlInput): string {
  const {
    receivalNumber, poNumber, supplierName, warehouseName,
    receivedBy, date, notes, items, assets, fonts,
  } = input

  const purchasedItems = items.filter(i => !i.isFree)
  const freeItems = items.filter(i => i.isFree)
  const subtotal = purchasedItems.reduce((sum, i) => sum + i.qtyReceived * i.unitCost, 0)
  const freeQty = freeItems.reduce((sum, i) => sum + i.qtyReceived, 0)
  const totalQty = items.reduce((sum, i) => sum + i.qtyReceived, 0)

  let rowIdx = 0
  const rowsHtml = items.map((item) => {
    rowIdx += 1
    const lineTotal = item.isFree ? 0 : item.qtyReceived * item.unitCost
    return `
      <tr>
        <td class="cell-num">${rowIdx}</td>
        <td class="cell-item">
          <div class="item-name">${esc(item.itemName)}</div>
          ${item.itemNameAr ? `<div class="item-name-ar">${esc(item.itemNameAr)}</div>` : ''}
          ${item.sku ? `<div class="item-sku">${esc(item.sku)}</div>` : ''}
        </td>
        <td class="cell-num">${fmtQty(item.qtyReceived)}</td>
        <td class="cell-num">${item.isFree ? '<span class="muted">—</span>' : fmtMoney(item.unitCost)}</td>
        <td class="cell-num">${item.isFree ? '<span class="muted">—</span>' : fmtMoney(lineTotal)}</td>
        <td class="cell-num">${item.isFree
          ? '<span class="free-tag">Free</span>'
          : '<span class="purchased-tag">Purchased</span>'}</td>
      </tr>`
  }).join('')

  const notesHtml = (notes && notes.trim())
    ? `<div class="notes-block"><span class="notes-label">Notes:</span> ${esc(notes)}</div>`
    : ''

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<title>Al Faytri — Goods Receipt</title>
<style>
  ${fontFacesCss(fonts)}
  ${BASE_CSS}

  .free-tag {
    display: inline-block; font-size: 8px; padding: 0.5mm 2mm;
    background: #dcfce7; color: #166534; border-radius: 2px;
  }
  .purchased-tag {
    display: inline-block; font-size: 8px; padding: 0.5mm 2mm;
    background: #f3f4f6; color: #6b7280; border-radius: 2px;
  }

  .notes-block {
    margin: 3mm 14mm 0; padding: 2mm 3mm; font-family: 'IBMPlexSans', sans-serif;
    font-size: 9px; font-style: italic; color: var(--muted);
    border-left: 2px solid var(--orange);
  }
  .notes-block .notes-label { font-weight: 600; color: var(--text); font-style: normal; }

  .signature-block {
    margin: 12mm 14mm 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 12mm;
    font-family: 'IBMPlexSans', sans-serif;
  }
  .signature-slot { display: flex; flex-direction: column; align-items: center; }
  .signature-line { width: 100%; border-top: 0.7px solid var(--text); height: 18mm; }
  .signature-label { font-size: 9px; text-align: center; margin-top: 2mm; }
</style>
</head>
<body>

  ${brandHeaderHtml(assets.brandHeader ?? assets.logo)}

  <div class="midbar">
    ${contactStripHtml()}
    <div class="dark-strip"></div>
    <div class="ribbon">
      <div class="ar-title">إيصال البضائع</div>
      <div class="en-title">Goods Receipt</div>
      <div class="doc-no">${esc(receivalNumber)}</div>
    </div>
  </div>

  <div class="meta">
    ${metaBlock('رقم الطلب', 'PO Number', esc(poNumber))}
    ${metaBlock('التاريخ', 'Date', fmtDate(date))}
    ${metaBlock('المورد', 'Supplier', esc(supplierName))}
    ${metaBlock('المستودع', 'Warehouse', esc(warehouseName ?? '—'))}
    ${metaBlock('استلم بواسطة', 'Received By', esc(receivedBy ?? '—'))}
    ${metaBlock('إجمالي الوحدات', 'Total Units', fmtQty(totalQty))}
  </div>

  <div class="lines-wrap">
    <table class="lines">
      <thead>
        <tr>
          <th style="width:5%">#<span class="en">#</span></th>
          <th style="width:33%">الصنف<span class="en">Item</span></th>
          <th style="width:12%">الكمية<span class="en">Qty</span></th>
          <th style="width:15%">سعر الوحدة<span class="en">Unit Cost</span></th>
          <th style="width:17%">الإجمالي<span class="en">Total</span></th>
          <th style="width:13%">النوع<span class="en">Type</span></th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        ${items.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:6mm;color:var(--muted);font-size:10px;">No items</td></tr>' : ''}
      </tbody>
    </table>
  </div>

  <!-- Cost Summary -->
  <div class="bottom-section" style="padding-top:3mm;">
    <div class="terms-wrap"></div>
    <div>
      <div class="summary-inner">
        <div class="summary-row">
          <span class="s-label">المشتريات</span>
          <span class="s-en">Purchased (${purchasedItems.length} items)</span>
          <span class="s-sep">—</span>
          <span class="s-amount">QAR ${fmtMoney(subtotal)}</span>
        </div>
        ${freeItems.length > 0 ? `
        <div class="summary-row">
          <span class="s-label">مجاني</span>
          <span class="s-en">Free (${freeItems.length} items, ${fmtQty(freeQty)} units)</span>
          <span class="s-sep">—</span>
          <span class="s-amount" style="color:var(--muted);">—</span>
        </div>` : ''}
        <div class="summary-row s-grand">
          <span class="s-label">الإجمالي الكلي</span>
          <span class="s-en">Grand Total</span>
          <span class="s-sep">—</span>
          <span class="s-amount">QAR ${fmtMoney(subtotal)}</span>
        </div>
      </div>
    </div>
  </div>

  ${notesHtml}

  <div class="signature-block">
    <div class="signature-slot">
      <div class="signature-line"></div>
      <div class="signature-label">Received by (Name &amp; Signature)</div>
    </div>
    <div class="signature-slot">
      <div class="signature-line"></div>
      <div class="signature-label">Verified by (Name &amp; Signature)</div>
    </div>
  </div>

  ${stampSectionHtml(assets.stamp)}

  ${footerHtml(assets.footer)}

</body>
</html>`
}
