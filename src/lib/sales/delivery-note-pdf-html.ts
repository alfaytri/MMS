import type { PdfFonts, PdfAssets } from '@/lib/pdf/pdf-fonts'
import {
  fontFacesCss,
  brandHeaderHtml,
  contactStripHtml,
  footerHtml,
  stampSectionHtml,
  BASE_CSS,
} from '@/lib/pdf/pdf-fonts'

export interface DeliveryNoteItem {
  itemName:     string
  itemNameAr?:  string | null
  sku:          string | null
  qtyDelivered: number
}

export interface BuildDeliveryNoteHtmlInput {
  deliveryNumber: string
  soNumber:       string | null
  customerName:   string | null
  warehouseName:  string | null
  createdBy:      string | null
  date:           string | null
  type:           'standard' | 'replacement'
  items:          DeliveryNoteItem[]
  assets:         PdfAssets
  fonts:          PdfFonts
}

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}
function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c])
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

export function buildDeliveryNoteHtml(input: BuildDeliveryNoteHtmlInput): string {
  const {
    deliveryNumber, soNumber, customerName, warehouseName,
    createdBy, date, type, items, assets, fonts,
  } = input

  const totalQty = items.reduce((sum, i) => sum + i.qtyDelivered, 0)

  let rowIdx = 0
  const rowsHtml = items.map((item) => {
    rowIdx += 1
    return `
      <tr>
        <td class="cell-num">${rowIdx}</td>
        <td class="cell-item">
          <div class="item-name">${esc(item.itemName)}</div>
          ${item.itemNameAr ? `<div class="item-name-ar">${esc(item.itemNameAr)}</div>` : ''}
          ${item.sku ? `<div class="item-sku">${esc(item.sku)}</div>` : ''}
        </td>
        <td class="cell-num">${fmtQty(item.qtyDelivered)}</td>
        <td class="cell-check">☐</td>
      </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<title>Delivery Note</title>
<style>
  ${fontFacesCss(fonts)}
  ${BASE_CSS}

  table.lines td.cell-check { text-align: center; font-size: 14px; }

  .total-strip {
    margin: 4mm 14mm 0;
    padding: 2.5mm 4mm;
    border: 0.7px solid var(--text);
    display: flex; justify-content: space-between; align-items: center;
    font-family: 'IBMPlexSans', sans-serif;
  }
  .total-strip .t-label { font-size: 10px; font-weight: 600; }
  .total-strip .t-value { font-size: 11px; font-weight: 700; }

  .replacement-tag {
    margin: 2mm 14mm 0; padding: 1.5mm 3mm;
    background: #fef3c7; border: 0.7px solid #f59e0b;
    font-family: 'IBMPlexSans', sans-serif; font-size: 9px;
    font-weight: 600; color: #92400e; display: inline-block;
    border-radius: 2px;
  }

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
      <div class="ar-title">إذن تسليم</div>
      <div class="en-title">Delivery Note</div>
      <div class="doc-no">${esc(deliveryNumber)}</div>
    </div>
  </div>

  <div class="meta">
    ${metaBlock('رقم أمر البيع', 'SO Number', esc(soNumber ?? '—'))}
    ${metaBlock('التاريخ', 'Date', fmtDate(date))}
    ${metaBlock('العميل', 'Customer', esc(customerName ?? '—'))}
    ${metaBlock('المستودع', 'Warehouse', esc(warehouseName ?? '—'))}
    ${metaBlock('أنشئ بواسطة', 'Created By', esc(createdBy ?? '—'))}
    ${metaBlock('إجمالي الوحدات', 'Total Units', fmtQty(totalQty))}
  </div>

  ${type === 'replacement' ? '<div class="replacement-tag">Replacement Delivery / تسليم بديل</div>' : ''}

  <div class="lines-wrap">
    <table class="lines">
      <thead>
        <tr>
          <th style="width:6%">#<span class="en">#</span></th>
          <th style="width:56%">الصنف<span class="en">Item</span></th>
          <th style="width:22%">الكمية<span class="en">Qty</span></th>
          <th style="width:16%">✓<span class="en">Check</span></th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        ${items.length === 0 ? '<tr><td colspan="4" style="text-align:center;padding:6mm;color:var(--muted);font-size:10px;">No items</td></tr>' : ''}
      </tbody>
    </table>
  </div>

  <div class="total-strip">
    <span class="t-label">Total Delivered / إجمالي التسليم</span>
    <span class="t-value">${fmtQty(totalQty)} units</span>
  </div>

  <div class="signature-block">
    <div class="signature-slot">
      <div class="signature-line"></div>
      <div class="signature-label">Delivered by (Name &amp; Signature)</div>
    </div>
    <div class="signature-slot">
      <div class="signature-line"></div>
      <div class="signature-label">Received by (Name &amp; Signature)</div>
    </div>
  </div>

  ${stampSectionHtml(assets.stamp)}

  ${footerHtml(assets.footer)}

</body>
</html>`
}
