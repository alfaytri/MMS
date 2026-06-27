/**
 * Builds the self-contained HTML for a Credit Note / Debit Note PDF.
 * Mirrors the layout of the (deprecated) `CreditDebitNotePdf.tsx`.
 */

export interface NoteOriginalLine {
  item_name:  string
  sku:        string | null
  qty:        number
  unit_price: number
  total:      number
}

export interface NoteReturnedLine extends NoteOriginalLine {
  condition?:       'defective' | 'damaged' | 'other' | null
  condition_notes?: string | null
}

export interface NoteCompany {
  name:      string
  address:   string | null
  vat_id:    string | null
  cr_number: string | null
}

export interface NoteAssets {
  /** data:image/png;base64,… */
  logo: string
}

export interface NoteFonts {
  infieldBlock:   string
  infieldRounded: string
}

export interface BuildCreditDebitNoteHtmlInput {
  noteId:          string
  noteType:        'credit' | 'debit'
  partyName:       string
  referenceNumber: string                   // invoice # for credit, PO # for debit
  returnNumber:    string
  reason:          string
  createdAt:       string
  originalLines:   NoteOriginalLine[]
  returnedLines:   NoteReturnedLine[]
  originalTotal:   number
  newTotal:        number
  company:         NoteCompany | null
  assets:          NoteAssets
  fonts:           NoteFonts
}

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c])
}

function fmtMoney(amount: number): string {
  return `QAR ${amount.toLocaleString('en-QA', {
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

export function buildCreditDebitNoteHtml(input: BuildCreditDebitNoteHtmlInput): string {
  const companyName = input.company?.name      ?? 'Al Faytri Group'
  const companyAddr = input.company?.address   ?? 'Doha, Qatar'
  const companyVat  = input.company?.vat_id    ?? null
  const companyCr   = input.company?.cr_number ?? null

  const docTitle    = input.noteType === 'credit' ? 'CREDIT NOTE' : 'DEBIT NOTE'
  const partyLabel  = input.noteType === 'credit' ? 'Customer'    : 'Supplier'
  const refLabel    = input.noteType === 'credit' ? 'Invoice #'   : 'PO #'
  const noPrefix    = input.noteType === 'credit' ? 'CN #'        : 'DN #'
  const deductedLbl = input.noteType === 'credit' ? 'Credit Amount' : 'Debit Amount'
  const deductedTotal = input.returnedLines.reduce((acc, l) => acc + l.total, 0)

  const originalRows = input.originalLines.map((line) => `
    <tr>
      <td class="col-item">${escapeHtml(line.item_name)}</td>
      <td class="col-sku">${escapeHtml(line.sku ?? '—')}</td>
      <td class="col-qty">${escapeHtml(String(line.qty))}</td>
      <td class="col-price">${escapeHtml(fmtMoney(line.unit_price))}</td>
      <td class="col-total">${escapeHtml(fmtMoney(line.total))}</td>
    </tr>
  `).join('')

  const isDebit = input.noteType === 'debit'
  const returnedRows = input.returnedLines.map((line) => {
    const condCell = isDebit
      ? `<td class="col-cond">${escapeHtml(line.condition === 'other' ? (line.condition_notes ?? 'Other') : (line.condition ?? '—'))}</td>`
      : ''
    return `
      <tr>
        <td class="col-item">${escapeHtml(line.item_name)}</td>
        <td class="col-sku">${escapeHtml(line.sku ?? '—')}</td>
        <td class="col-qty">${escapeHtml(String(line.qty))}</td>
        ${condCell}
        <td class="col-price">${escapeHtml(fmtMoney(line.unit_price))}</td>
        <td class="col-total">${escapeHtml(fmtMoney(line.total))}</td>
      </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(docTitle)} — ${escapeHtml(input.noteId)}</title>
<style>
  @page { size: A4; margin: 14mm 14mm 16mm; }

  @font-face { font-family: 'Infield'; src: url('${input.fonts.infieldRounded}') format('truetype'); font-weight: 400; }
  @font-face { font-family: 'Infield'; src: url('${input.fonts.infieldBlock}')   format('truetype'); font-weight: 700; }

  :root {
    --brand: #1d4ed8;
    --text:  #111827;
    --muted: #6b7280;
    --rule:  #d1d5db;
    --row:   #e5e7eb;
    --head:  #f3f4f6;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    background: #fff; color: var(--text);
    font-family: 'Infield', system-ui, -apple-system, 'Segoe UI', sans-serif;
    font-size: 9pt;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }

  /* ───── Header ───── */
  .header {
    display: grid; grid-template-columns: 1fr 1fr;
    align-items: start; gap: 16mm;
    padding-bottom: 6mm; border-bottom: 0.7px solid var(--rule);
    margin-bottom: 6mm;
  }
  .header .logo-wrap { display: flex; align-items: center; gap: 8mm; }
  .header .logo { width: 70px; height: auto; display: block; }
  .header .company .name {
    font-weight: 700; font-size: 16pt; color: var(--brand);
    letter-spacing: 0.2px; margin-bottom: 3px;
  }
  .header .company .line { font-size: 8pt; color: var(--muted); line-height: 1.5; }
  .doc { text-align: right; }
  .doc .title {
    font-weight: 700; font-size: 22pt; color: var(--brand);
    letter-spacing: 1px; margin-bottom: 6mm;
  }
  .doc .meta-row {
    display: flex; justify-content: flex-end; gap: 12mm;
    margin-bottom: 2mm; font-size: 8pt;
  }
  .doc .meta-key { color: var(--muted); }
  .doc .meta-val { color: var(--text); font-weight: 700; }

  /* ───── Bill row ───── */
  .bill {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 16mm; margin-bottom: 6mm;
  }
  .bill-right { text-align: right; }
  .section-lbl {
    font-size: 7.5pt; font-weight: 700; color: var(--muted);
    text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 2mm;
  }
  .bill .name { font-weight: 700; font-size: 11pt; color: var(--text); margin-bottom: 1mm; }
  .bill .sub  { font-size: 8pt; color: var(--muted); }

  /* ───── Tables ───── */
  .section-title {
    font-weight: 700; font-size: 9pt; color: #374151;
    margin-top: 4mm; margin-bottom: 2mm;
  }
  table.lt-table { width: 100%; border-collapse: collapse; font-size: 8pt; margin-bottom: 3mm; }
  table.lt-table th {
    background: var(--head); padding: 2mm 3mm;
    text-align: left; font-weight: 700; color: var(--text);
    border-bottom: 0.5px solid var(--row);
  }
  table.lt-table td {
    padding: 2mm 3mm; border-bottom: 0.5px solid var(--row); vertical-align: top;
  }
  .col-item  { width: 35%; }
  .col-sku   { width: 16%; color: var(--muted); }
  .col-qty   { width: 10%; text-align: right; }
  .col-cond  { width: 14%; color: var(--muted); }
  .col-price { width: 14%; text-align: right; }
  .col-total { width: 15%; text-align: right; font-weight: 700; }

  /* ───── Totals ───── */
  .totals {
    margin-top: 4mm; padding-top: 4mm;
    border-top: 0.5px solid var(--rule);
    display: flex; flex-direction: column; align-items: flex-end; gap: 1.5mm;
  }
  .tot-row { display: flex; justify-content: flex-end; gap: 6mm; width: 100%; }
  .tot-lbl { color: var(--muted); font-size: 9pt; text-align: right; }
  .tot-val { width: 38mm; text-align: right; font-size: 9pt; }
  .grand { margin-top: 2mm; padding-top: 2mm; border-top: 0.5px solid var(--rule); }
  .grand .tot-lbl, .grand .tot-val {
    font-size: 11pt; font-weight: 700; color: var(--text);
  }

  /* ───── Footer ───── */
  .footer {
    position: fixed;
    bottom: 8mm; left: 14mm; right: 14mm;
    display: flex; justify-content: space-between;
    font-size: 7pt; color: var(--muted);
    border-top: 0.5px solid var(--rule); padding-top: 2mm;
  }
</style>
</head>
<body>

  <!-- ───── Header ───── -->
  <header class="header">
    <div class="logo-wrap">
      <img class="logo" src="${input.assets.logo}" alt="${escapeHtml(companyName)}">
      <div class="company">
        <div class="name">${escapeHtml(companyName)}</div>
        ${companyAddr ? `<div class="line">${escapeHtml(companyAddr)}</div>` : ''}
        ${companyCr  ? `<div class="line">CR: ${escapeHtml(companyCr)}</div>`  : ''}
        ${companyVat ? `<div class="line">VAT: ${escapeHtml(companyVat)}</div>` : ''}
      </div>
    </div>
    <div class="doc">
      <div class="title">${escapeHtml(docTitle)}</div>
      <div class="meta-row"><span class="meta-key">${escapeHtml(noPrefix)}</span><span class="meta-val">${escapeHtml(input.noteId)}</span></div>
      <div class="meta-row"><span class="meta-key">Date</span><span class="meta-val">${escapeHtml(fmtDate(input.createdAt))}</span></div>
      <div class="meta-row"><span class="meta-key">Return #</span><span class="meta-val">${escapeHtml(input.returnNumber)}</span></div>
    </div>
  </header>

  <!-- ───── Party / Reference ───── -->
  <section class="bill">
    <div class="bill-left">
      <div class="section-lbl">${escapeHtml(partyLabel)}</div>
      <div class="name">${escapeHtml(input.partyName)}</div>
    </div>
    <div class="bill-right">
      <div class="section-lbl">${escapeHtml(refLabel)}</div>
      <div class="name">${escapeHtml(input.referenceNumber)}</div>
      <div class="sub">Reason: ${escapeHtml(input.reason)}</div>
    </div>
  </section>

  <!-- ───── Original Items ───── -->
  <div class="section-title">Original Items</div>
  <table class="lt-table">
    <thead>
      <tr>
        <th class="col-item">Item</th>
        <th class="col-sku">SKU</th>
        <th class="col-qty">Qty</th>
        <th class="col-price">Unit Price</th>
        <th class="col-total">Total</th>
      </tr>
    </thead>
    <tbody>${originalRows}</tbody>
  </table>

  <!-- ───── Returned Items ───── -->
  <div class="section-title">Returned Items</div>
  <table class="lt-table">
    <thead>
      <tr>
        <th class="col-item">Item</th>
        <th class="col-sku">SKU</th>
        <th class="col-qty">Qty</th>
        ${isDebit ? '<th class="col-cond">Condition</th>' : ''}
        <th class="col-price">Unit Price</th>
        <th class="col-total">Value</th>
      </tr>
    </thead>
    <tbody>${returnedRows}</tbody>
  </table>

  <!-- ───── Totals ───── -->
  <section class="totals">
    <div class="tot-row">
      <div class="tot-lbl">Original Total</div>
      <div class="tot-val">${escapeHtml(fmtMoney(input.originalTotal))}</div>
    </div>
    <div class="tot-row">
      <div class="tot-lbl">${escapeHtml(deductedLbl)}</div>
      <div class="tot-val">- ${escapeHtml(fmtMoney(deductedTotal))}</div>
    </div>
    <div class="tot-row grand">
      <div class="tot-lbl">New Total</div>
      <div class="tot-val">${escapeHtml(fmtMoney(input.newTotal))}</div>
    </div>
  </section>

  <!-- ───── Footer ───── -->
  <footer class="footer">
    <span>${escapeHtml(companyName)} — ${escapeHtml(docTitle)} ${escapeHtml(input.noteId)}</span>
    <span>${escapeHtml(fmtDate(input.createdAt))}</span>
  </footer>

</body>
</html>`
}
