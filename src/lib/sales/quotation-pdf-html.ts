/**
 * Builds the self-contained HTML for the SO Quotation PDF.
 *
 * Visual twin of `confirmation-pdf-html.ts` — same brand header, dark mid-bar,
 * orange ribbon, bilingual meta blocks, bilingual line table, and bilingual
 * totals strip. The only divergence is the ribbon label ("QUOTATION" / "عرض سعر")
 * and the table columns (line items rather than services).
 */

export interface QuotationLineItem {
  item_name:  string
  sku:        string | null
  qty:        number
  unit:       string
  unit_price: number
  total:      number
  line_type:  string
}

export interface QuotationAssets {
  /** data:image/png;base64,… combined Al Faytri logo (orange wrench-house + wordmark) */
  logo:   string
  /** data:image/png;base64,… 'أهلها — Bringing comfort to your space.' wordmark */
  footer: string
}

export interface QuotationFonts {
  infieldBlock:   string
  infieldRounded: string
  noorRegular:    string
  noorBold:       string
}

export interface QuotationContactLinks {
  instagram?: string
  website?:   string
  email?:     string
  phone?:     string
}

export interface BuildQuotationHtmlInput {
  so_number:        string
  created_at:       string                       // ISO
  validity_days:    number
  currency:         string
  customer_name:    string
  customer_phone:   string | null
  lines:            QuotationLineItem[]
  subtotal:                 number
  discount_amount_resolved: number
  discount_label:           string | null
  total:                    number
  payment_terms:        string | null
  payment_terms_notes:  string | null
  delivery_terms:       string | null
  delivery_terms_notes: string | null
  customer_notes:       string | null
  assets: QuotationAssets
  fonts:  QuotationFonts
  links?: QuotationContactLinks
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c])
}

const CURRENCY_PREFIXES: Record<string, string> = {
  QAR: 'QAR ', USD: '$', EUR: '€', GBP: '£', AED: 'AED ', SAR: 'SAR ', KWD: 'KWD ',
}
function fmtMoney(amount: number, currency: string): string {
  const prefix = CURRENCY_PREFIXES[currency] ?? `${currency} `
  return `${prefix}${amount.toLocaleString('en-QA', {
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

function safeMail(email: string | undefined): string {
  return `mailto:${(email ?? 'info@alfaytri.com').trim()}`
}
function safeTel(phone: string | undefined): string {
  const digits = (phone ?? '97444106900').replace(/\D/g, '')
  return `tel:+${digits}`
}

// ── Template ────────────────────────────────────────────────────────────────

export function buildQuotationHtml(input: BuildQuotationHtmlInput): string {
  const currency  = input.currency || 'QAR'
  const igHref    = input.links?.instagram ?? 'https://instagram.com/alfaytri'
  const webHref   = input.links?.website   ?? 'https://www.alfaytri.com'
  const mailHref  = safeMail(input.links?.email)
  const phoneHref = safeTel(input.links?.phone)
  const igLabel    = 'Instagram'
  const webLabel   = (input.links?.website   ?? 'www.alfaytri.com').replace(/^https?:\/\//, '')
  const emailLabel = input.links?.email      ?? 'info@alfaytri.com'
  const phoneLabel = `+${(input.links?.phone ?? '97444106900').replace(/\D/g, '')}`

  const quoteDate = fmtDate(input.created_at)
  const validity  = `${input.validity_days} days`

  const lineRows = input.lines.map((li) => `
    <tr>
      <td class="cell-num">${escapeHtml(fmtMoney(li.total,      currency))}</td>
      <td class="cell-num">${escapeHtml(fmtMoney(li.unit_price, currency))}</td>
      <td class="cell-num">${escapeHtml(String(li.qty))}</td>
      <td class="cell-item">
        <div class="item-name">${escapeHtml(li.item_name)}</div>
        ${li.sku ? `<div class="item-sku">${escapeHtml(li.sku)}</div>` : ''}
      </td>
    </tr>
  `).join('')

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<title>Quotation — ${escapeHtml(input.so_number)}</title>
<style>
  @page { size: A4; margin: 0; }

  @font-face { font-family: 'InfieldRound'; src: url('${input.fonts.infieldRounded}') format('truetype'); }
  @font-face { font-family: 'InfieldBlock'; src: url('${input.fonts.infieldBlock}')   format('truetype'); }
  @font-face { font-family: 'Noor'; src: url('${input.fonts.noorRegular}') format('truetype'); font-weight: 400; }
  @font-face { font-family: 'Noor'; src: url('${input.fonts.noorBold}')    format('truetype'); font-weight: 700; }

  :root {
    --orange:    #ED7C2C;
    --dark:      #2f2f33;
    --grey-bg:   #efefef;
    --grey-rule: #d0d0d0;
    --link-blue: #1d63d8;
    --text:      #111;
    --muted:     #6b7280;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    background: #fff; color: var(--text);
    font-family: 'InfieldRound', sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  body { width: 210mm; padding: 14mm 0 10mm; }

  /* ─────────── Top: logo + addresses ─────────── */
  .top-row {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: start;
    padding: 0 14mm;
    margin-bottom: 6mm;
  }
  .top-row .logo {
    width: 130px; height: auto; display: block;
    align-self: center; margin: 0 8mm;
  }
  .addr-en {
    font-family: 'InfieldRound', sans-serif;
    font-size: 16.5px; line-height: 1.7; color: #111; text-align: left;
  }
  .addr-en .brand {
    font-family: 'InfieldBlock', sans-serif;
    font-size: 27px; letter-spacing: 0.5px; margin-bottom: 6px; line-height: 1;
  }
  .addr-en .tagline {
    font-family: 'InfieldRound', sans-serif; font-weight: 400;
    font-size: 17px; margin-bottom: 8px; letter-spacing: 0.1px; line-height: 1.35;
  }
  .addr-ar {
    font-family: 'Noor', sans-serif; direction: rtl; text-align: right;
    font-size: 17px; line-height: 1.7; color: #111; font-weight: 400;
  }
  .addr-ar .brand { font-weight: 700; font-size: 29px; margin-bottom: 6px; line-height: 1; }
  .addr-ar .tagline { font-weight: 400; font-size: 18px; margin-bottom: 8px; line-height: 1.35; }

  /* ─────────── Mid bar: contact strip + dark strip + orange ribbon ─────────── */
  .midbar { position: relative; margin-top: 4mm; }
  .contact-strip {
    display: flex; justify-content: space-between; align-items: center;
    padding: 6mm 14mm;
  }
  .contact-strip .left, .contact-strip .right {
    display: flex; gap: 10mm; align-items: center;
  }
  .contact-strip a {
    color: var(--link-blue); text-decoration: none;
    font-family: 'InfieldRound', sans-serif; font-size: 11px;
  }
  .dark-strip { background: var(--dark); height: 9mm; }
  .ribbon {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    background: var(--orange); color: #fff;
    padding: 3.5mm 8mm 3mm; text-align: center;
    line-height: 1.2; width: 58mm;
  }
  .ribbon .ar-title { font-family: 'Noor', sans-serif; font-weight: 700; font-size: 15px; margin-bottom: 0.8mm; }
  .ribbon .en-title { font-family: 'InfieldBlock', sans-serif; font-size: 11px; letter-spacing: 0.4px; }
  .ribbon .order-no { font-family: 'InfieldRound', sans-serif; font-size: 9px; margin-top: 1mm; letter-spacing: 0.3px; opacity: 0.95; }

  /* ─────────── Meta blocks ─────────── */
  .meta {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 0 18mm; padding: 7mm 14mm 4mm;
  }
  .meta-block {
    display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 0.7px solid var(--grey-rule);
    padding: 3.5mm 0;
  }
  .meta-value { font-family: 'InfieldRound', sans-serif; font-size: 12px; color: var(--text); }
  .meta-label { text-align: right; }
  .meta-label .ar { font-family: 'Noor', sans-serif; font-weight: 700; font-size: 13px; }
  .meta-label .en { font-family: 'InfieldRound', sans-serif; font-size: 9.5px; color: var(--muted); margin-top: 1px; }

  /* ─────────── Line items table ─────────── */
  .lines-wrap { padding: 4mm 14mm 0; }
  table.lines {
    width: 100%; border-collapse: collapse;
    direction: rtl; border: 0.7px solid var(--text);
  }
  table.lines th {
    background: var(--orange); color: #fff;
    padding: 3.5mm 3mm; text-align: center; vertical-align: middle;
    font-family: 'Noor', sans-serif; font-weight: 700; font-size: 13.5px;
    border-right: 0.7px solid var(--text);
  }
  table.lines th:first-child { border-right: 0; }
  table.lines th .en {
    display: block;
    font-family: 'InfieldRound', sans-serif; font-size: 9.5px;
    margin-top: 1px; opacity: 0.95;
  }
  table.lines td {
    border-top: 0.7px solid var(--text);
    padding: 4mm 3mm; vertical-align: middle;
  }
  table.lines td.cell-num {
    text-align: center;
    font-family: 'InfieldRound', sans-serif; font-size: 11px;
  }
  table.lines td.cell-item { text-align: right; }
  table.lines td.cell-item .item-name {
    font-family: 'InfieldRound', sans-serif; font-size: 11.5px;
    color: var(--text); line-height: 1.4;
  }
  table.lines td.cell-item .item-sku {
    font-family: 'InfieldRound', sans-serif; font-size: 9px;
    color: var(--muted); margin-top: 1px;
  }

  /* ─────────── Totals strip ─────────── */
  .totals-wrap { padding: 0 14mm; }
  table.totals {
    width: 100%; border-collapse: collapse; direction: rtl;
    border: 0.7px solid var(--text); border-top: 0;
  }
  table.totals th {
    background: var(--orange); color: #fff;
    padding: 3.5mm 3mm; text-align: center; vertical-align: middle;
    font-family: 'Noor', sans-serif; font-weight: 700; font-size: 12.5px;
    border-right: 0.7px solid var(--text); width: 33.33%;
  }
  table.totals th:first-child { border-right: 0; }
  table.totals th .en {
    display: block; font-family: 'InfieldRound', sans-serif;
    font-size: 9px; margin-top: 1px; opacity: 0.95;
  }
  table.totals td {
    padding: 4mm 3mm; text-align: center; vertical-align: middle;
    background: var(--grey-bg);
    font-family: 'InfieldBlock', sans-serif; font-size: 13px;
    border-right: 0.7px solid var(--text);
    border-top: 0.7px solid var(--text);
  }
  table.totals td:first-child { border-right: 0; }

  /* ─────────── Terms ─────────── */
  .terms { padding: 6mm 14mm 0; }
  .terms-row {
    display: grid; grid-template-columns: 50mm 1fr;
    gap: 4mm; margin-bottom: 1.5mm; font-size: 11px;
  }
  .terms-key {
    font-family: 'InfieldBlock', sans-serif; color: var(--text);
  }
  .terms-val {
    font-family: 'InfieldRound', sans-serif; color: var(--muted);
  }

  /* ─────────── Footer ─────────── */
  .footer { padding-top: 6mm; text-align: center; }
  .footer img { height: 55px; width: auto; }

</style>
</head>
<body>

  <!-- ─────────── Top: company logo + bilingual addresses ─────────── -->
  <div class="top-row">
    <div class="addr-en">
      <div class="brand">ALFAYTRI</div>
      <div class="tagline">For trading and building maintenance W.L.L</div>
      <div>Office 14, Building 54, Street 185, Zone 55 Doha,</div>
      <div>Qatar | P.O. Box 45069</div>
    </div>
    <img class="logo" src="${input.assets.logo}" alt="Al Faytri">
    <div class="addr-ar">
      <div class="brand">الفيتري</div>
      <div class="tagline">للتجارة وصيانة المباني ذ.م.م</div>
      <div>مكتب 14 مبنى 54 شارع 185 منطقة 55 الدوحة قطر</div>
      <div>ص.ب 45069</div>
    </div>
  </div>

  <!-- ─────────── Mid bar: contact strip + dark strip + orange ribbon ─────────── -->
  <div class="midbar">
    <div class="contact-strip">
      <div class="left">
        <a href="${escapeHtml(igHref)}">${escapeHtml(igLabel)}</a>
        <a href="${escapeHtml(webHref)}">${escapeHtml(webLabel)}</a>
      </div>
      <div class="right">
        <a href="${escapeHtml(mailHref)}">${escapeHtml(emailLabel)}</a>
        <a href="${escapeHtml(phoneHref)}">${escapeHtml(phoneLabel)}</a>
      </div>
    </div>
    <div class="dark-strip"></div>
    <div class="ribbon">
      <div class="ar-title">عرض سعر</div>
      <div class="en-title">Quotation</div>
      <div class="order-no">${escapeHtml(input.so_number)}</div>
    </div>
  </div>

  <!-- ─────────── Meta blocks (4: Quote Date / Validity / Customer Name / Customer Phone) ─────────── -->
  <div class="meta">
    <div class="meta-block">
      <div class="meta-value">${escapeHtml(quoteDate)}</div>
      <div class="meta-label">
        <div class="ar">تاريخ عرض السعر</div>
        <div class="en">(Quote Date)</div>
      </div>
    </div>
    <div class="meta-block">
      <div class="meta-value">${escapeHtml(validity)}</div>
      <div class="meta-label">
        <div class="ar">مدة الصلاحية</div>
        <div class="en">(Validity)</div>
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
      <div class="meta-value">${escapeHtml(input.customer_name)}</div>
      <div class="meta-label">
        <div class="ar">اسم الزبون</div>
        <div class="en">(Customer Name)</div>
      </div>
    </div>
  </div>

  <!-- ─────────── Line items ─────────── -->
  <div class="lines-wrap">
    <table class="lines">
      <thead>
        <tr>
          <th style="width:18%">الإجمالي<span class="en">(Total)</span></th>
          <th style="width:18%">سعر الوحدة<span class="en">(Unit Price)</span></th>
          <th style="width:12%">الكمية<span class="en">(Qty)</span></th>
          <th style="width:52%">العنصر<span class="en">(Item)</span></th>
        </tr>
      </thead>
      <tbody>
        ${lineRows}
      </tbody>
    </table>
  </div>

  <!-- ─────────── Totals strip ─────────── -->
  <div class="totals-wrap">
    <table class="totals">
      <thead>
        <tr>
          <th>الإجمالي النهائي<span class="en">(Grand Total)</span></th>
          <th>قيمة الخصم<span class="en">(Discount)</span></th>
          <th>المجموع الفرعي<span class="en">(Subtotal)</span></th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${escapeHtml(fmtMoney(input.total,                    currency))}</td>
          <td>${escapeHtml(fmtMoney(input.discount_amount_resolved, currency))}</td>
          <td>${escapeHtml(fmtMoney(input.subtotal,                 currency))}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- ─────────── Terms (if any) ─────────── -->
  ${(input.payment_terms || input.delivery_terms || input.customer_notes) ? `
  <div class="terms">
    ${input.payment_terms ? `
      <div class="terms-row">
        <div class="terms-key">Payment Terms</div>
        <div class="terms-val">${escapeHtml(input.payment_terms)}${input.payment_terms_notes ? ` — ${escapeHtml(input.payment_terms_notes)}` : ''}</div>
      </div>` : ''}
    ${input.delivery_terms ? `
      <div class="terms-row">
        <div class="terms-key">Delivery Terms</div>
        <div class="terms-val">${escapeHtml(input.delivery_terms)}${input.delivery_terms_notes ? ` — ${escapeHtml(input.delivery_terms_notes)}` : ''}</div>
      </div>` : ''}
    ${input.customer_notes ? `
      <div class="terms-row">
        <div class="terms-key">Notes</div>
        <div class="terms-val">${escapeHtml(input.customer_notes)}</div>
      </div>` : ''}
  </div>` : ''}

  <!-- ─────────── Footer ─────────── -->
  <div class="footer">
    <img src="${input.assets.footer}" alt="أهلها — Bringing comfort to your space.">
  </div>

</body>
</html>`
}
