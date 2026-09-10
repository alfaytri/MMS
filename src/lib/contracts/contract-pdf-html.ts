/**
 * Builds the self-contained HTML for a contract / quotation document PDF —
 * customer + contract details, the priced services, the payment schedule
 * summary, terms and notes. Style mirrors the invoice/confirmation PDFs
 * (shared brand header/footer + BASE_CSS) so the whole document set reads alike.
 */

import type { PdfFonts, PdfAssets } from '@/lib/pdf/pdf-fonts'
import {
  fontFacesCss, brandHeaderHtml, contactStripHtml, footerHtml, stampSectionHtml, BASE_CSS,
} from '@/lib/pdf/pdf-fonts'

export interface ContractPdfServiceInput {
  name:      string
  location:  string      // building-tree path leaf, or 'General'
  frequency: string      // human label e.g. "Monthly"
  qty:       number
  unitPrice: number
  visits:    number      // visits over the term (for the line total)
  lineTotal: number      // unitPrice-derived total over the term
}

export interface ContractPdfMilestoneInput {
  name:       string
  percentage: number
  amount:     number
  dueDate:    string | null
}

export interface BuildContractPdfInput {
  docKind:        'quotation' | 'contract'
  docNumber:      string
  issuingDate:    string
  statusLabel:    string
  customerName:   string
  customerPhone:  string
  siteName:       string
  agentName:      string
  startDate:      string
  endDate:        string
  durationLabel:  string    // e.g. "12 months"
  paymentLabel:   string    // e.g. "Monthly" / "On milestones"
  services:       ContractPdfServiceInput[]
  subtotal:       number
  discount:       number
  netTotal:       number
  periodValue:    number
  periodLabel:    string    // e.g. "Monthly Value"
  milestones:     ContractPdfMilestoneInput[]
  termsText:      string | null
  notes:          string | null
  currency?:      string
  assets:         PdfAssets
  fonts:          PdfFonts
}

const HTML_ESCAPE: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
function esc(v: string): string { return (v ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPE[c]) }

const CURRENCY_PREFIXES: Record<string, string> = { QAR: 'QAR ', USD: '$', EUR: '€', GBP: '£', AED: 'AED ', SAR: 'SAR ', KWD: 'KWD ' }
function fmtMoney(amount: number, currency: string): string {
  const prefix = CURRENCY_PREFIXES[currency] ?? `${currency} `
  return `${prefix}${amount.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function buildContractPdfHtml(input: BuildContractPdfInput): string {
  const currency = input.currency ?? 'QAR'
  const isQuote = input.docKind === 'quotation'
  const titleAr = isQuote ? 'عرض سعر' : 'عقد'
  const titleEn = isQuote ? 'Quotation' : 'Contract'

  const serviceRows = input.services.length === 0
    ? `<tr><td colspan="5" class="cell-empty">No services</td></tr>`
    : input.services.map((s) => `
      <tr>
        <td class="cell-num">${esc(fmtMoney(s.lineTotal, currency))}</td>
        <td class="cell-num">${esc(fmtMoney(s.unitPrice, currency))}</td>
        <td class="cell-unit"><div>${esc(s.frequency)}</div><div class="ar">× ${esc(String(s.visits))} ${isQuote ? 'visits' : 'visits'}</div></td>
        <td class="cell-num">${esc(String(s.qty))}</td>
        <td class="cell-desc">
          <div class="en-line">${esc(s.name)}</div>
          ${s.location ? `<div class="ar-line">${esc(s.location)}</div>` : ''}
        </td>
      </tr>`).join('')

  const milestoneRows = input.milestones.length === 0
    ? ''
    : `
    <div class="section-heading">Payment Milestones · دفعات العقد</div>
    <table class="lines">
      <thead><tr>
        <th style="width:22%">المبلغ<span class="en">(Amount)</span></th>
        <th style="width:18%">النسبة<span class="en">(%)</span></th>
        <th style="width:25%">تاريخ الاستحقاق<span class="en">(Due)</span></th>
        <th style="width:35%">الدفعة<span class="en">(Milestone)</span></th>
      </tr></thead>
      <tbody>
        ${input.milestones.map((m) => `
        <tr>
          <td class="cell-num">${esc(fmtMoney(m.amount, currency))}</td>
          <td class="cell-num">${esc(String(m.percentage))}%</td>
          <td class="cell-num">${esc(m.dueDate ?? '—')}</td>
          <td class="cell-desc"><div class="en-line">${esc(m.name)}</div></td>
        </tr>`).join('')}
      </tbody>
    </table>`

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<title>${titleEn} — ${esc(input.docNumber)}</title>
<style>
  ${fontFacesCss(input.fonts)}
  ${BASE_CSS}
  table.lines { direction: ltr; }
  table.lines th { text-align: center; }
  table.lines td.cell-desc { text-align: center; padding: 6px 8px; word-break: break-word; overflow-wrap: anywhere; white-space: normal; }
  table.lines td.cell-desc .en-line { font-family: 'IBMPlexSans', sans-serif; font-size: 10px; line-height: 1.4; color: #222; }
  table.lines td.cell-desc .ar-line { font-size: 9px; color: #777; margin-top: 2px; }
  table.lines td.cell-unit { text-align: center; font-size: 10px; line-height: 1.3; }
  table.lines td.cell-unit .ar { color: #666; font-size: 9px; margin-top: 1px; }
  .cell-empty { text-align: center; color: #888; font-style: italic; padding: 8px 4px; font-size: 10px; }
  table.totals-bar { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 10px; }
  table.totals-bar th, table.totals-bar td { border: 1px solid #d4d4d4; padding: 6px 8px; text-align: center; vertical-align: middle; }
  table.totals-bar th { background: #f3f3f3; color: #333; font-weight: 600; font-family: 'IBMPlexAr','IBMPlexSans',sans-serif; line-height: 1.35; }
  table.totals-bar th .en { display: block; font-family: 'IBMPlexSans',sans-serif; font-size: 9px; font-weight: 500; color: #666; margin-top: 1px; }
  table.totals-bar td { background: #fafafa; font-family: 'IBMPlexSans',sans-serif; font-size: 11px; font-weight: 500; }
  table.totals-bar th.grand, table.totals-bar td.grand { background: #fff2e6; color: #b45309; font-weight: 700; }
  .section-heading { margin-top: 18px; margin-bottom: 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #4a4a4a; border-bottom: 1px solid #ddd; padding-bottom: 3px; }
  .terms-box { margin-top: 12px; font-size: 9.5px; line-height: 1.5; color: #444; white-space: pre-wrap; border: 1px solid #eee; border-radius: 4px; padding: 8px 10px; background: #fcfcfc; }
</style>
</head>
<body>
  ${brandHeaderHtml(input.assets.brandHeader ?? input.assets.logo)}

  <div class="midbar">
    ${contactStripHtml()}
    <div class="dark-strip"></div>
    <div class="ribbon">
      <div class="ar-title">${titleAr}</div>
      <div class="en-title">${titleEn}</div>
      <div class="doc-no">${esc(input.docNumber)}</div>
    </div>
  </div>

  <div class="meta">
    <div class="meta-block"><div class="meta-value">${esc(input.statusLabel)}</div><div class="meta-label"><div class="ar">الحالة</div><div class="en">(Status)</div></div></div>
    <div class="meta-block"><div class="meta-value">${esc(input.agentName || '—')}</div><div class="meta-label"><div class="ar">المندوب</div><div class="en">(Agent)</div></div></div>
    <div class="meta-block"><div class="meta-value">${esc(input.siteName || '—')}</div><div class="meta-label"><div class="ar">الموقع</div><div class="en">(Site)</div></div></div>
    <div class="meta-block"><div class="meta-value">${esc(input.customerPhone || '—')}</div><div class="meta-label"><div class="ar">هاتف الزبون</div><div class="en">(Phone)</div></div></div>
    <div class="meta-block"><div class="meta-value">${esc(input.customerName)}</div><div class="meta-label"><div class="ar">اسم الزبون</div><div class="en">(Customer)</div></div></div>
    <div class="meta-block"><div class="meta-value">${esc(input.issuingDate)}</div><div class="meta-label"><div class="ar">التاريخ</div><div class="en">(Date)</div></div></div>
  </div>

  <table class="totals-bar" style="margin-top:10px">
    <thead><tr>
      <th>مدة العقد<span class="en">(Duration)</span></th>
      <th>تاريخ الانتهاء<span class="en">(End Date)</span></th>
      <th>تاريخ البدء<span class="en">(Start Date)</span></th>
      <th>نظام الدفع<span class="en">(Payment)</span></th>
    </tr></thead>
    <tbody><tr>
      <td>${esc(input.durationLabel)}</td>
      <td>${esc(input.endDate)}</td>
      <td>${esc(input.startDate)}</td>
      <td>${esc(input.paymentLabel)}</td>
    </tr></tbody>
  </table>

  <div class="section-heading">Services · الخدمات</div>
  <div class="lines-wrap">
    <table class="lines">
      <thead><tr>
        <th class="th-bilingual" style="width:18%"><span class="ar-header">الإجمالي</span><span class="en-header">(Total in QAR)</span></th>
        <th class="th-bilingual" style="width:16%"><span class="ar-header">سعر الوحدة</span><span class="en-header">(Unit Price)</span></th>
        <th class="th-bilingual" style="width:18%"><span class="ar-header">التكرار</span><span class="en-header">(Frequency)</span></th>
        <th class="th-bilingual" style="width:10%"><span class="ar-header">العدد</span><span class="en-header">(Qty)</span></th>
        <th class="th-bilingual" style="width:38%"><span class="ar-header">الخدمة</span><span class="en-header">(Service)</span></th>
      </tr></thead>
      <tbody>${serviceRows}</tbody>
    </table>
  </div>

  <table class="totals-bar">
    <thead><tr>
      <th class="grand">${esc(input.periodLabel)}<span class="en">(per period)</span></th>
      <th class="grand">القيمة الصافية<span class="en">(Net Total)</span></th>
      <th>الخصم<span class="en">(Discount)</span></th>
      <th>المجموع الفرعي<span class="en">(Subtotal)</span></th>
    </tr></thead>
    <tbody><tr>
      <td class="grand">${esc(fmtMoney(input.periodValue, currency))}</td>
      <td class="grand">${esc(fmtMoney(input.netTotal, currency))}</td>
      <td>${esc(fmtMoney(input.discount, currency))}</td>
      <td>${esc(fmtMoney(input.subtotal, currency))}</td>
    </tr></tbody>
  </table>

  ${milestoneRows}

  ${input.termsText ? `<div class="section-heading">Terms &amp; Conditions · الشروط والأحكام</div><div class="terms-box">${esc(input.termsText)}</div>` : ''}
  ${input.notes ? `<div class="section-heading">Notes · ملاحظات</div><div class="terms-box">${esc(input.notes)}</div>` : ''}

  ${stampSectionHtml(input.assets.stamp)}
  ${footerHtml(input.assets.footer)}
</body>
</html>`
}
