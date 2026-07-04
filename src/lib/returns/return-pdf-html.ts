import type { PdfFonts, PdfAssets } from '@/lib/pdf/pdf-fonts'
import {
  fontFacesCss,
  brandHeaderHtml,
  contactStripHtml,
  footerHtml,
  BASE_CSS,
} from '@/lib/pdf/pdf-fonts'

export interface ReturnPdfItem {
  itemName: string
  sku: string | null
  qty: number
  condition: string
  unitPrice: number | null
}

export interface BuildReturnPdfHtmlInput {
  returnNumber: string
  sourceType: 'sale_order' | 'purchase_order'
  sourceNumber: string | null
  counterpartyLabel: string
  counterpartyName: string | null
  warehouseName: string | null
  createdBy: string | null
  date: string | null
  reason: string
  items: ReturnPdfItem[]
  notes: string | null
  assets: PdfAssets
  fonts: PdfFonts
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

function fmtMoney(n: number): string {
  return n.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

function conditionBadge(condition: string): string {
  const colorMap: Record<string, { bg: string; color: string }> = {
    good:      { bg: '#dcfce7', color: '#166534' },
    damaged:   { bg: '#fee2e2', color: '#991b1b' },
    defective: { bg: '#fef3c7', color: '#92400e' },
    other:     { bg: '#f3f4f6', color: '#374151' },
  }
  const c = colorMap[condition] ?? colorMap.other
  return `<span style="display:inline-block;padding:1px 6px;border-radius:3px;font-size:8px;font-weight:600;background:${c.bg};color:${c.color};text-transform:capitalize;">${esc(condition)}</span>`
}

export function buildReturnPdfHtml(input: BuildReturnPdfHtmlInput): string {
  const {
    returnNumber, sourceType, sourceNumber, counterpartyLabel, counterpartyName,
    warehouseName, createdBy, date, reason, items, notes, assets, fonts,
  } = input

  const isSale = sourceType === 'sale_order'
  const arTitle = isSale ? 'مذكرة إرجاع مبيعات' : 'مذكرة إرجاع مشتريات'
  const enTitle = isSale ? 'Sale Return Note' : 'Purchase Return Note'
  const sourceLabel = isSale ? 'SO Number' : 'PO Number'
  const arSourceLabel = isSale ? 'رقم أمر البيع' : 'رقم أمر الشراء'
  const arCounterparty = isSale ? 'العميل' : 'المورد'

  const totalQty = items.reduce((sum, i) => sum + i.qty, 0)
  const hasPrice = items.some(i => i.unitPrice != null && i.unitPrice > 0)
  const grandTotal = hasPrice ? items.reduce((sum, i) => sum + i.qty * (i.unitPrice ?? 0), 0) : null

  let rowIdx = 0
  const rowsHtml = items.map((item) => {
    rowIdx += 1
    return `
      <tr>
        <td class="cell-num">${rowIdx}</td>
        <td class="cell-item">
          <div class="item-name">${esc(item.itemName)}</div>
          ${item.sku ? `<div class="item-sku">${esc(item.sku)}</div>` : ''}
        </td>
        <td class="cell-num">${fmtQty(item.qty)}</td>
        <td style="text-align:center">${conditionBadge(item.condition)}</td>
        ${hasPrice ? `<td class="cell-num">${item.unitPrice ? fmtMoney(item.unitPrice) : '—'}</td>` : ''}
        ${hasPrice ? `<td class="cell-num">${item.unitPrice ? fmtMoney(item.qty * item.unitPrice) : '—'}</td>` : ''}
      </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<title>Al Faytri — ${enTitle}</title>
<style>
  ${fontFacesCss(fonts)}
  ${BASE_CSS}

  .reason-block {
    margin: 3mm 14mm 0;
    padding: 2.5mm 4mm;
    border-left: 3px solid #f97316;
    background: #fff7ed;
    font-family: 'IBMPlexSans', sans-serif;
  }
  .reason-block .r-label { font-size: 8px; font-weight: 600; color: #9a3412; text-transform: uppercase; letter-spacing: 0.5px; }
  .reason-block .r-value { font-size: 10px; font-weight: 500; color: #1e293b; margin-top: 1mm; }

  .total-strip {
    margin: 4mm 14mm 0;
    padding: 2.5mm 4mm;
    border: 0.7px solid var(--text);
    display: flex; justify-content: space-between; align-items: center;
    font-family: 'IBMPlexSans', sans-serif;
  }
  .total-strip .t-label { font-size: 10px; font-weight: 600; }
  .total-strip .t-value { font-size: 11px; font-weight: 700; }

  .notes-block {
    margin: 3mm 14mm 0;
    padding: 2.5mm 4mm;
    border-left: 3px solid #3b82f6;
    background: #eff6ff;
    font-family: 'IBMPlexSans', sans-serif;
  }
  .notes-block .n-label { font-size: 8px; font-weight: 600; color: #1e40af; text-transform: uppercase; letter-spacing: 0.5px; }
  .notes-block .n-value { font-size: 10px; color: #1e293b; margin-top: 1mm; }

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

  ${brandHeaderHtml(assets.logo)}

  <div class="midbar">
    ${contactStripHtml()}
    <div class="dark-strip"></div>
    <div class="ribbon">
      <div class="ar-title">${arTitle}</div>
      <div class="en-title">${enTitle}</div>
      <div class="doc-no">${esc(returnNumber)}</div>
    </div>
  </div>

  <div class="meta">
    ${metaBlock(arSourceLabel, sourceLabel, esc(sourceNumber ?? '—'))}
    ${metaBlock('التاريخ', 'Date', fmtDate(date))}
    ${metaBlock(arCounterparty, counterpartyLabel, esc(counterpartyName ?? '—'))}
    ${metaBlock('المستودع', 'Warehouse', esc(warehouseName ?? '—'))}
    ${metaBlock('أنشئ بواسطة', 'Created By', esc(createdBy ?? '—'))}
    ${metaBlock('إجمالي الوحدات', 'Total Units', fmtQty(totalQty))}
  </div>

  <div class="reason-block">
    <div class="r-label">Return Reason / سبب الإرجاع</div>
    <div class="r-value">${esc(reason)}</div>
  </div>

  <div class="lines-wrap">
    <table class="lines">
      <thead>
        <tr>
          <th style="width:5%">#<span class="en">#</span></th>
          <th style="width:${hasPrice ? '36' : '56'}%">الصنف<span class="en">Item</span></th>
          <th style="width:12%">الكمية<span class="en">Qty</span></th>
          <th style="width:15%">الحالة<span class="en">Condition</span></th>
          ${hasPrice ? '<th style="width:16%">سعر الوحدة<span class="en">Unit Price</span></th>' : ''}
          ${hasPrice ? '<th style="width:16%">الإجمالي<span class="en">Total</span></th>' : ''}
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        ${items.length === 0 ? `<tr><td colspan="${hasPrice ? 6 : 4}" style="text-align:center;padding:6mm;color:var(--muted);font-size:10px;">No items</td></tr>` : ''}
      </tbody>
    </table>
  </div>

  <div class="total-strip">
    <span class="t-label">Total Returned / إجمالي المرتجع</span>
    <span class="t-value">${fmtQty(totalQty)} units${grandTotal != null ? ` · QAR ${fmtMoney(grandTotal)}` : ''}</span>
  </div>

  ${notes ? `
  <div class="notes-block">
    <div class="n-label">Notes / ملاحظات</div>
    <div class="n-value">${esc(notes)}</div>
  </div>` : ''}

  <div class="signature-block">
    <div class="signature-slot">
      <div class="signature-line"></div>
      <div class="signature-label">${isSale ? 'Returned by (Customer)' : 'Dispatched by (Name & Signature)'}</div>
    </div>
    <div class="signature-slot">
      <div class="signature-line"></div>
      <div class="signature-label">${isSale ? 'Received by (Warehouse)' : 'Authorized by (Name & Signature)'}</div>
    </div>
  </div>

  ${footerHtml(assets.footer)}

</body>
</html>`
}
