/**
 * Builds the self-contained HTML for a Credit Note / Debit Note PDF.
 * Uses the shared IBM Plex Sans font stack and compact bilingual template.
 *
 * Both credit and debit notes use orange (#ED7C2C) ribbon + table headers.
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

/* ─── Data interfaces ─────────────────────────────────────────────── */

export interface NoteOriginalLine {
  item_name:     string
  item_name_ar?: string | null
  sku:           string | null
  qty:           number
  unit_price:    number
  total:         number
}

export interface NoteReturnedLine extends NoteOriginalLine {
  condition?:       'defective' | 'damaged' | 'other' | null
  condition_notes?: string | null
}

export interface BuildCreditDebitNoteHtmlInput {
  noteId:          string
  noteType:        'credit' | 'debit'
  partyName:       string
  partyPhone:      string | null
  referenceNumber: string        // invoice # for credit, PO # for debit
  returnNumber:    string
  reason:          string
  createdAt:       string
  returnedLines:   NoteReturnedLine[]
  originalTotal:   number
  creditDebitTotal: number       // sum of returned lines
  newTotal:        number
  currency?:       string
  assets:          PdfAssets
  fonts:           PdfFonts
}

/* ─── Helpers ─────────────────────────────────────────────────────── */

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c])
}

// Six-domains H4: currency label is passed in per-call so non-QAR notes render correctly.
function fmtMoney(amount: number, currency: string = 'QAR'): string {
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

/* ─── Builder ─────────────────────────────────────────────────────── */

export function buildCreditDebitNoteHtml(input: BuildCreditDebitNoteHtmlInput): string {
  const isCredit = input.noteType === 'credit'
  const currency = input.currency ?? 'QAR'

  /* ── ribbon / header colour ────────────────────────────────────── */
  const accentColor = 'var(--orange)'

  /* ── bilingual labels ──────────────────────────────────────────── */
  const ribbonAr  = isCredit ? 'إشعار دائن' : 'إشعار مدين'
  const ribbonEn  = isCredit ? 'Credit Note' : 'Debit Note'
  const refLabelAr = isCredit ? 'رقم الفاتورة الأصلية' : 'رقم أمر الشراء'
  const refLabelEn = isCredit ? '(Original Invoice)'   : '(PO Reference)'
  const phoneLabelAr = isCredit ? 'هاتف الزبون' : 'هاتف المورد'
  const phoneLabelEn = isCredit ? '(Customer Phone)' : '(Supplier Phone)'
  const nameLabelAr  = isCredit ? 'اسم الزبون' : 'اسم المورد'
  const nameLabelEn  = isCredit ? '(Customer Name)' : '(Supplier Name)'
  const amountColAr  = isCredit ? 'المبلغ المسترد' : 'المبلغ المخصوم'
  const amountColEn  = isCredit ? '(Credit Amount)' : '(Debit Amount)'
  const totalLabelAr = isCredit ? 'إجمالي الفاتورة الأصلية' : 'إجمالي أمر الشراء الأصلي'
  const totalLabelEn = isCredit ? 'Original Invoice Total' : 'Original PO Total'
  const deductLabelAr = isCredit ? 'إجمالي المبلغ المسترد' : 'إجمالي المبلغ المخصوم'
  const deductLabelEn = isCredit ? 'Total Credit Amount' : 'Total Debit Amount'
  const reasonTitleAr = isCredit ? 'سبب الإشعار الدائن' : 'سبب الإشعار المدين'
  const reasonTitleEn = isCredit ? 'Reason for Credit Note' : 'Reason for Debit Note'

  /* ── table rows ────────────────────────────────────────────────── */
  const lineRows = input.returnedLines.map((line) => `
        <tr>
          <td class="cell-item">
            <div class="item-name">${escapeHtml(line.item_name)}</div>
            ${line.item_name_ar ? `<div class="item-name-ar">${escapeHtml(line.item_name_ar)}</div>` : ''}
            ${line.sku ? `<div class="item-sku">${escapeHtml(line.sku)}${line.condition_notes ? ` — ${escapeHtml(line.condition_notes)}` : ''}</div>` : ''}
          </td>
          <td class="cell-num">${escapeHtml(String(line.qty))}</td>
          <td class="cell-num">${escapeHtml(fmtMoney(line.unit_price, currency))}</td>
          <td class="cell-num">${escapeHtml(fmtMoney(line.total, currency))}</td>
        </tr>`).join('')

  /* ── reason section ────────────────────────────────────────────── */
  const reasonCss = `background: rgba(237, 124, 44, 0.06); border: 0.7px solid rgba(237, 124, 44, 0.3);`
  const reasonTitleColor = 'color: var(--orange);'

  /* ── summary grand row styles ──────────────────────────────────── */
  const grandBg = 'background: rgba(237, 124, 44, 0.08);'
  const grandAmountStyle = 'font-size: 10px; color: var(--orange);'

  /* ── document-specific CSS overrides ───────────────────────────── */
  const docCss = `
    .ribbon { background: ${accentColor}; }
    table.lines th { background: ${accentColor}; border-right-color: rgba(237,124,44,0.5); }

    .reason { padding: 3mm 4mm; ${reasonCss} font-size: 9px; line-height: 1.5; }
    .reason-title-ar { font-family: 'IBMPlexAr', sans-serif; font-size: ${isCredit ? '10px' : '9px'}; font-weight: 700; direction: rtl; text-align: right; ${reasonTitleColor} ${!isCredit ? 'margin-bottom: 1mm;' : ''} }
    .reason-title { font-family: 'IBMPlexSans', sans-serif; font-size: ${isCredit ? '9px' : '8px'}; font-weight: 700; ${reasonTitleColor} ${!isCredit ? 'margin-bottom: 1mm;' : ''} }
    .reason-text { font-family: 'IBMPlexSans', sans-serif; font-size: 8px; color: var(--muted); }
    .reason-wrap { flex: 1; }
    ${isCredit ? '.reason-standalone { margin: 3mm 14mm 0; }' : ''}
    .summary-row.s-invoice-total { background: rgba(237, 124, 44, 0.08); }
    .summary-row.s-grand { ${grandBg} }
    .summary-row.s-grand .s-amount { ${grandAmountStyle} }
    .summary-divider { height: 0.7px; background: var(--text); }
  `

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(ribbonEn)} — ${escapeHtml(input.noteId)}</title>
<style>
  ${fontFacesCss(input.fonts)}
  ${BASE_CSS}
  ${docCss}
</style>
</head>
<body>

  ${brandHeaderHtml(input.assets.brandHeader ?? input.assets.logo)}

  <div class="midbar">
    ${contactStripHtml()}
    <div class="dark-strip"></div>
    <div class="ribbon">
      <div class="ar-title">${escapeHtml(ribbonAr)}</div>
      <div class="en-title">${escapeHtml(ribbonEn)}</div>
      <div class="doc-no">${escapeHtml(input.noteId)}</div>
    </div>
  </div>

  <div class="meta">
    <div class="meta-block">
      <div class="meta-value">${escapeHtml(fmtDate(input.createdAt))}</div>
      <div class="meta-label">
        <div class="ar">تاريخ الإصدار</div>
        <div class="en">(Issue Date)</div>
      </div>
    </div>
    <div class="meta-block">
      <div class="meta-value">${escapeHtml(input.referenceNumber)}</div>
      <div class="meta-label">
        <div class="ar">${escapeHtml(refLabelAr)}</div>
        <div class="en">${escapeHtml(refLabelEn)}</div>
      </div>
    </div>
    <div class="meta-block">
      <div class="meta-value">${escapeHtml(input.partyPhone ?? '—')}</div>
      <div class="meta-label">
        <div class="ar">${escapeHtml(phoneLabelAr)}</div>
        <div class="en">${escapeHtml(phoneLabelEn)}</div>
      </div>
    </div>
    <div class="meta-block">
      <div class="meta-value">${escapeHtml(input.partyName)}</div>
      <div class="meta-label">
        <div class="ar">${escapeHtml(nameLabelAr)}</div>
        <div class="en">${escapeHtml(nameLabelEn)}</div>
      </div>
    </div>
  </div>

  <div class="lines-wrap">
    <table class="lines">
      <thead>
        <tr>
          <th style="width:52%">الصنف<span class="en">(Description)</span></th>
          <th style="width:12%">الكمية<span class="en">(Qty)</span></th>
          <th style="width:18%">سعر الوحدة<span class="en">(Unit Price)</span></th>
          <th style="width:18%">${escapeHtml(amountColAr)}<span class="en">${escapeHtml(amountColEn)}</span></th>
        </tr>
      </thead>
      <tbody>
        ${lineRows}
      </tbody>
    </table>
  </div>

  <div class="bottom-section">
    ${!isCredit ? `
    <div class="reason-wrap">
      <div class="reason">
        <div class="reason-title-ar">${escapeHtml(reasonTitleAr)}</div>
        <div class="reason-title">${escapeHtml(reasonTitleEn)}</div>
        <div class="reason-text">${escapeHtml(input.reason)}</div>
      </div>
    </div>` : ''}
    <div class="summary-inner">
      <div class="summary-row s-invoice-total">
        <span class="s-label">${escapeHtml(totalLabelAr)}</span>
        <span class="s-en">${escapeHtml(totalLabelEn)}</span>
        <span class="s-sep">:</span>
        <span class="s-amount">${escapeHtml(fmtMoney(input.originalTotal, currency))}</span>
      </div>
      <div class="summary-divider"></div>
      <div class="summary-row s-grand">
        <span class="s-label">${escapeHtml(deductLabelAr)}</span>
        <span class="s-en">${escapeHtml(deductLabelEn)}</span>
        <span class="s-sep">:</span>
        <span class="s-amount">${isCredit ? '- ' : ''}${escapeHtml(fmtMoney(input.creditDebitTotal, currency))}</span>
      </div>
    </div>
  </div>

  ${isCredit ? `
  <div class="reason reason-standalone">
    <div class="reason-title-ar">${escapeHtml(reasonTitleAr)}</div>
    <div class="reason-title">${escapeHtml(reasonTitleEn)}</div>
    <div class="reason-text">${escapeHtml(input.reason)}</div>
  </div>` : ''}

  ${stampSectionHtml(input.assets.stamp)}

  ${footerHtml(input.assets.footer)}

</body>
</html>`
}
