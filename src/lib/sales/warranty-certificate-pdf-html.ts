import type { PdfFonts, PdfAssets } from '@/lib/pdf/pdf-fonts'
import {
  fontFacesCss,
  brandHeaderHtml,
  contactStripHtml,
  footerHtml,
  BASE_CSS,
} from '@/lib/pdf/pdf-fonts'

export interface WarrantyCertificateItem {
  warrantyNumber:   string
  itemName:         string
  itemNameAr?:      string | null
  sku:              string | null
  qty:              number
  policyId:         string
  policyName:       string
  coverageType:     'none' | 'parts_only' | 'parts_and_labor' | 'replacement_only'
  durationMonths:   number
  startDate:        string
  endDate:          string
}

export interface WarrantyPolicyBlock {
  policyId:         string
  policyName:       string
  termsEn:          string | null
  termsAr:          string | null
  voidConditions:   string[]
}

export interface BuildWarrantyCertificateHtmlInput {
  deliveryNumber: string
  soNumber:       string | null
  customerName:   string | null
  customerPhone:  string | null
  deliveryDate:   string | null
  items:          WarrantyCertificateItem[]
  /** One block per unique policy_id across the items (order preserved). */
  policyBlocks:   WarrantyPolicyBlock[]
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

const COVERAGE_LABEL_EN: Record<WarrantyCertificateItem['coverageType'], string> = {
  none:             'No Coverage',
  parts_only:       'Parts Only',
  parts_and_labor:  'Parts & Labor',
  replacement_only: 'Replacement Only',
}
const COVERAGE_LABEL_AR: Record<WarrantyCertificateItem['coverageType'], string> = {
  none:             'لا يوجد',
  parts_only:       'قطع الغيار فقط',
  parts_and_labor:  'قطع الغيار واليد العاملة',
  replacement_only: 'الاستبدال فقط',
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

export function buildWarrantyCertificateHtml(input: BuildWarrantyCertificateHtmlInput): string {
  const {
    deliveryNumber, soNumber, customerName, customerPhone,
    deliveryDate, items, policyBlocks, assets, fonts,
  } = input

  const rowsHtml = items.map((item, idx) => `
      <tr>
        <td class="cell-num">${idx + 1}</td>
        <td class="cell-code">${esc(item.warrantyNumber)}</td>
        <td class="cell-item">
          <div class="item-name">${esc(item.itemName)}</div>
          ${item.itemNameAr ? `<div class="item-name-ar">${esc(item.itemNameAr)}</div>` : ''}
          ${item.sku ? `<div class="item-sku">${esc(item.sku)}</div>` : ''}
        </td>
        <td class="cell-num">${fmtQty(item.qty)}</td>
        <td class="cell-policy">
          <div class="policy-name">${esc(item.policyName)}</div>
          <div class="policy-cov">${COVERAGE_LABEL_EN[item.coverageType]}</div>
          <div class="policy-cov-ar">${COVERAGE_LABEL_AR[item.coverageType]}</div>
        </td>
        <td class="cell-dates">
          <div>${fmtDate(item.startDate)}</div>
          <div class="date-arrow">→</div>
          <div class="date-end">${fmtDate(item.endDate)}</div>
        </td>
      </tr>`).join('')

  const policyBlocksHtml = policyBlocks.map((p) => `
    <div class="policy-block">
      <div class="policy-block-title">${esc(p.policyName)}</div>
      ${p.termsEn ? `<div class="policy-terms-en">${esc(p.termsEn)}</div>` : ''}
      ${p.termsAr ? `<div class="policy-terms-ar" dir="rtl">${esc(p.termsAr)}</div>` : ''}
      ${p.voidConditions.length > 0 ? `
        <div class="policy-void">
          <div class="policy-void-title">Void Conditions <span class="ar-inline">/ حالات إبطال الضمان</span></div>
          <ul class="policy-void-list">
            ${p.voidConditions.map((v) => `<li>${esc(v)}</li>`).join('')}
          </ul>
        </div>` : ''}
    </div>`).join('')

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<title>Warranty Certificate</title>
<style>
  ${fontFacesCss(fonts)}
  ${BASE_CSS}

  table.lines td.cell-code {
    font-family: 'IBMPlexSans', monospace;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.3px;
  }
  table.lines td.cell-policy {
    font-family: 'IBMPlexSans', sans-serif;
    font-size: 9px;
    line-height: 1.35;
  }
  table.lines td.cell-policy .policy-name { font-weight: 600; }
  table.lines td.cell-policy .policy-cov { color: var(--muted); }
  table.lines td.cell-policy .policy-cov-ar {
    font-family: 'NotoNaskh', 'IBMPlexSans', sans-serif;
    direction: rtl; color: var(--muted); font-size: 8.5px;
  }
  table.lines td.cell-dates {
    font-family: 'IBMPlexSans', sans-serif;
    font-size: 9px;
    line-height: 1.35;
    text-align: center;
  }
  table.lines td.cell-dates .date-arrow { color: var(--muted); margin: 1px 0; }
  table.lines td.cell-dates .date-end { font-weight: 600; }

  .policy-block {
    margin: 4mm 14mm 0;
    padding: 3mm 4mm;
    border: 0.7px solid var(--text);
    font-family: 'IBMPlexSans', sans-serif;
    page-break-inside: avoid;
  }
  .policy-block-title {
    font-size: 11px;
    font-weight: 700;
    margin-bottom: 2mm;
    border-bottom: 0.4px solid var(--muted);
    padding-bottom: 1.5mm;
  }
  .policy-terms-en {
    font-size: 9.5px;
    line-height: 1.5;
    white-space: pre-wrap;
    margin-bottom: 2mm;
  }
  .policy-terms-ar {
    font-family: 'NotoNaskh', 'IBMPlexSans', sans-serif;
    font-size: 10px;
    line-height: 1.7;
    white-space: pre-wrap;
    text-align: right;
    margin-bottom: 2mm;
    border-top: 0.3px dashed var(--muted);
    padding-top: 2mm;
  }
  .policy-void {
    margin-top: 2mm;
    border-top: 0.3px dashed var(--muted);
    padding-top: 2mm;
  }
  .policy-void-title {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    margin-bottom: 1.5mm;
  }
  .policy-void-title .ar-inline {
    font-family: 'NotoNaskh', 'IBMPlexSans', sans-serif;
    font-weight: 400;
  }
  .policy-void-list {
    margin: 0; padding-left: 4mm;
    font-size: 9px; line-height: 1.5;
  }

  .signature-block {
    margin: 10mm 14mm 0;
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
      <div class="ar-title">شهادة ضمان</div>
      <div class="en-title">Warranty Certificate</div>
      <div class="doc-no">${esc(deliveryNumber)}</div>
    </div>
  </div>

  <div class="meta">
    ${metaBlock('رقم التسليم', 'Delivery #', esc(deliveryNumber))}
    ${metaBlock('رقم أمر البيع', 'SO #', esc(soNumber ?? '—'))}
    ${metaBlock('التاريخ', 'Date', fmtDate(deliveryDate))}
    ${metaBlock('العميل', 'Customer', esc(customerName ?? '—'))}
    ${metaBlock('الهاتف', 'Phone', esc(customerPhone ?? '—'))}
    ${metaBlock('عدد الأصناف', 'Items', String(items.length))}
  </div>

  <div class="lines-wrap">
    <table class="lines">
      <thead>
        <tr>
          <th style="width:5%">#<span class="en">#</span></th>
          <th style="width:14%">رقم الضمان<span class="en">Warranty #</span></th>
          <th style="width:34%">الصنف<span class="en">Item</span></th>
          <th style="width:9%">الكمية<span class="en">Qty</span></th>
          <th style="width:22%">السياسة<span class="en">Policy</span></th>
          <th style="width:16%">المدة<span class="en">Period</span></th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        ${items.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:6mm;color:var(--muted);font-size:10px;">No warranty coverage on this delivery</td></tr>' : ''}
      </tbody>
    </table>
  </div>

  ${policyBlocksHtml}

  <div class="signature-block">
    <div class="signature-slot">
      <div class="signature-line"></div>
      <div class="signature-label">Issued by (Name &amp; Signature)</div>
    </div>
    <div class="signature-slot">
      <div class="signature-line"></div>
      <div class="signature-label">Received by (Name &amp; Signature)</div>
    </div>
  </div>

  ${footerHtml(assets.footer)}

</body>
</html>`
}
