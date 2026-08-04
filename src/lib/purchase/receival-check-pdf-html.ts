/**
 * Builds the self-contained HTML for the Receival Check PDF.
 *
 * Two modes:
 *  - per_receival: shows Prev Received / This Receival / Remaining After columns.
 *  - blank: shows Already Received / Remaining / Actual (blank) columns for
 *    handwritten field verification.
 *
 * Same brand template (header, contact strip, orange ribbon, footer) as the
 * PO PDFs. Ribbon text is "Receival Check / تدقيق الاستلام" for both modes.
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

export type ReceivalCheckMode = 'per_receival' | 'blank'

export interface ReceivalCheckRow {
  itemName:              string
  itemNameAr?:           string | null
  brandVariantId?:       string | null
  sku:                   string | null
  ordered:               number | null   // null for loose (non-PO-line) items
  orderedFree:           number
  prevReceived:          number
  prevReceivedFree:      number
  thisReceival:          number          // 0 for blank mode
  thisReceivalFree:      number          // 0 for blank mode
  remainingAfter:        number
  remainingAfterFree:    number
  isLoose:               boolean         // true if PO line link is missing
}

export interface BuildReceivalCheckHtmlInput {
  mode:            ReceivalCheckMode
  docNo:           string     // "RCV-{receival_number}" or "RCV-CHECK-{po_number}"
  poNumber:        string
  supplierName:    string
  division:        string | null
  receivalNumber:  string | null   // present when mode='per_receival'
  receivalNotes:   string | null   // present when mode='per_receival'
  rows:            ReceivalCheckRow[]
  assets:          PdfAssets
  fonts:           PdfFonts
}

// ── Helpers ────────────────────────────────────────────────────────────────

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c])
}

function fmtQty(n: number): string {
  return n.toLocaleString('en-QA', { maximumFractionDigits: 3 })
}

// ── Template ───────────────────────────────────────────────────────────────

export function buildReceivalCheckHtml(input: BuildReceivalCheckHtmlInput): string {
  const {
    mode, docNo, poNumber, supplierName, division,
    receivalNumber, receivalNotes, rows, assets, fonts,
  } = input

  const isPerReceival = mode === 'per_receival'

  const linkedRows = rows.filter((r) => !r.isLoose)
  const looseRows  = rows.filter((r) =>  r.isLoose)

  function renderRow(r: ReceivalCheckRow, idx: number, isFreeSubRow = false): string {
    const orderedCell = r.ordered === null
      ? '<span class="muted">—</span>'
      : (isFreeSubRow ? fmtQty(r.orderedFree) : fmtQty(r.ordered))

    const itemCell = isFreeSubRow
      ? `<div class="item-name" style="padding-left:14px">↳ <span class="free-tag">Free</span></div>`
      : `
        <div class="item-name">${escapeHtml(r.itemName)}</div>
        ${r.itemNameAr ? `<div class="item-name-ar">${escapeHtml(r.itemNameAr)}</div>` : ''}
        ${r.sku ? `<div class="item-sku">${escapeHtml(r.sku)}</div>` : ''}`

    if (isPerReceival) {
      const prev  = isFreeSubRow ? r.prevReceivedFree   : r.prevReceived
      const thisR = isFreeSubRow ? r.thisReceivalFree   : r.thisReceival
      const rem   = isFreeSubRow ? r.remainingAfterFree : r.remainingAfter
      return `
        <tr>
          <td class="cell-num">${idx}</td>
          <td class="cell-item">${itemCell}</td>
          <td class="cell-num">${orderedCell}</td>
          <td class="cell-num">${fmtQty(prev)}</td>
          <td class="cell-num">${fmtQty(thisR)}</td>
          <td class="cell-num">${fmtQty(rem)}</td>
          <td class="cell-check">☐</td>
        </tr>`
    }
    const already = isFreeSubRow ? r.prevReceivedFree   : r.prevReceived
    const rem     = isFreeSubRow ? r.remainingAfterFree : r.remainingAfter
    return `
      <tr>
        <td class="cell-num">${idx}</td>
        <td class="cell-item">${itemCell}</td>
        <td class="cell-num">${orderedCell}</td>
        <td class="cell-num">${fmtQty(already)}</td>
        <td class="cell-num">${fmtQty(rem)}</td>
        <td class="cell-actual"></td>
        <td class="cell-check">☐</td>
      </tr>`
  }

  let rowIdx = 0
  const linkedHtml = linkedRows.map((r) => {
    rowIdx += 1
    const parent = renderRow(r, rowIdx, false)
    const hasFree = r.orderedFree > 0 || r.prevReceivedFree > 0 || r.thisReceivalFree > 0
    const child = hasFree ? renderRow(r, rowIdx, true) : ''
    return parent + child
  }).join('')

  const looseHtml = looseRows.length > 0
    ? `
      <tr><td colspan="7" class="subheader">Additional items (not linked to a PO line)</td></tr>
      ${looseRows.map((r) => { rowIdx += 1; return renderRow(r, rowIdx, false) }).join('')}
    `
    : ''

  const BLANK_ROWS = 8
  const blankRowHtml = Array.from({ length: BLANK_ROWS }, (_, i) => {
    const n = rowIdx + i + 1
    const cols = isPerReceival
      ? `<td class="cell-num">${n}</td><td class="cell-item cell-writable"></td><td class="cell-num cell-writable"></td><td class="cell-num cell-writable"></td><td class="cell-num cell-writable"></td><td class="cell-num cell-writable"></td><td class="cell-check">☐</td>`
      : `<td class="cell-num">${n}</td><td class="cell-item cell-writable"></td><td class="cell-num cell-writable"></td><td class="cell-num cell-writable"></td><td class="cell-num cell-writable"></td><td class="cell-actual"></td><td class="cell-check">☐</td>`
    return `<tr>${cols}</tr>`
  }).join('')

  const notesHtml = (isPerReceival && receivalNotes && receivalNotes.trim())
    ? `<div class="notes-block"><span class="notes-label">Notes:</span> ${escapeHtml(receivalNotes)}</div>`
    : ''

  const headerColsPerReceival = `
    <th style="width:5%">#</th>
    <th style="width:37%">Item</th>
    <th style="width:10%">Ordered</th>
    <th style="width:11%">Prev Received</th>
    <th style="width:12%">This Receival</th>
    <th style="width:13%">Remaining After</th>
    <th style="width:12%">✓</th>`
  const headerColsBlank = `
    <th style="width:5%">#</th>
    <th style="width:32%">Item</th>
    <th style="width:11%">Ordered</th>
    <th style="width:14%">Already Received</th>
    <th style="width:12%">Remaining</th>
    <th style="width:14%">Actual</th>
    <th style="width:12%">✓</th>`

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<title>Receival Check</title>
<style>
  ${fontFacesCss(fonts)}
  ${BASE_CSS}

  /* ── Receival-check specific ─── */
  .rcv-header-block {
    margin: 4mm 0 3mm 0;
    padding: 3mm 4mm;
    border: 0.7px solid var(--text);
    font-family: 'IBMPlexSans', sans-serif;
    font-size: 10px;
    line-height: 1.9;
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 6mm;
  }
  .rcv-header-block .field { display: flex; }
  .rcv-header-block .label { font-weight: 600; margin-right: 4px; white-space: nowrap; }
  .rcv-header-block .value { border-bottom: 0.7px solid var(--text); flex: 1; padding-left: 4px; min-height: 4mm; }
  .rcv-header-block .value.blank { border-bottom: 0.7px solid var(--text); }

  table.lines td.cell-writable { height: 7mm; }
  table.lines td.cell-check { text-align: center; font-size: 14px; }
  table.lines td.cell-actual { border: 0.7px solid var(--text); background: #fafafa; height: 7mm; }
  table.lines td.subheader {
    background: #f3f4f6; font-weight: 600; font-size: 9px;
    padding: 2mm 3mm; color: var(--text);
  }
  .free-tag {
    display: inline-block; font-size: 9px; padding: 0.5mm 1.5mm;
    background: #dcfce7; color: #166534; border-radius: 2px; margin-left: 2mm;
  }
  .notes-block {
    margin: 3mm 0 4mm 0; padding: 2mm 3mm; font-family: 'IBMPlexSans', sans-serif;
    font-size: 9px; font-style: italic; color: var(--muted);
    border-left: 2px solid var(--orange);
  }
  .notes-block .notes-label { font-weight: 600; color: var(--text); font-style: normal; }

  .signature-block {
    margin-top: 12mm;
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
      <div class="ar-title">تدقيق الاستلام</div>
      <div class="en-title">Receival Check</div>
      <div class="doc-no">${escapeHtml(docNo)}</div>
    </div>
  </div>

  <div class="rcv-header-block">
    <div class="field">
      <span class="label">Date:</span>
      <span class="value blank"></span>
    </div>
    <div class="field">
      <span class="label">PO #:</span>
      <span class="value">${escapeHtml(poNumber)}</span>
    </div>
    <div class="field">
      <span class="label">Vendor:</span>
      <span class="value">${escapeHtml(supplierName)}</span>
    </div>
    ${division ? `
    <div class="field">
      <span class="label">Division:</span>
      <span class="value">${escapeHtml(division)}</span>
    </div>` : ''}
    ${isPerReceival && receivalNumber ? `
    <div class="field">
      <span class="label">Receival #:</span>
      <span class="value">${escapeHtml(receivalNumber)}</span>
    </div>` : ''}
  </div>

  <div class="lines-wrap">
    <table class="lines">
      <thead>
        <tr>
          ${isPerReceival ? headerColsPerReceival : headerColsBlank}
        </tr>
      </thead>
      <tbody>
        ${linkedHtml}
        ${looseHtml}
        ${blankRowHtml}
      </tbody>
    </table>
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
