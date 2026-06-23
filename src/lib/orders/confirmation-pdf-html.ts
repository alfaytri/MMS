/**
 * Builds the self-contained HTML for the order-confirmation PDF.
 *
 * Caller passes pre-loaded brand assets and fonts as base64 data URLs, so the
 * HTML has no external references — `puppeteer.page.setContent(html)` renders
 * the document without any further network or filesystem access.
 *
 * Design notes:
 *  - All decorative elements (orange ribbon, dark contact bar, table headers,
 *    totals breakdown) are pure HTML/CSS — no design PNGs. Only the combined
 *    logo and the "أهلها" footer wordmark remain as images.
 *  - English text uses the Infield typeface family.
 *  - Arabic text uses Noor Bold throughout.
 */

export interface ConfirmationLineItem {
  name:      string
  qty:       number
  unitPrice: number
  subtotal:  number
}

export interface ConfirmationContactLinks {
  instagram?: string
  website?:   string
  email?:     string             // bare address — `mailto:` is added
  phone?:     string             // digits-or-plus — normalised to `tel:+...`
}

export interface ConfirmationAssets {
  /** data:image/png;base64,… */
  logo:    string                // combined Al Faytri logo (orange wrench-house + AL FAYTRI + الفيتري)
  footer:  string                // أهلها wordmark + "Bringing comfort to your space."
}

export interface ConfirmationFonts {
  /** data:font/...;base64,… */
  infieldBlock:    string         // English BOLD — headings, ribbon, totals values
  infieldRounded:  string         // English REGULAR — body, addresses, English subtitles
  noorRegular:     string         // Arabic REGULAR — body / secondary
  noorBold:        string         // Arabic BOLD — main text / headings
}

export interface BuildConfirmationHtmlInput {
  orderNumber:   string
  issuingDate:   string
  scheduledDate: string
  customerName:  string
  customerPhone: string
  services:      ConfirmationLineItem[]
  subtotal:      number
  discount:      number
  total:         number
  currency?:     string                        // default 'QAR'
  assets:        ConfirmationAssets
  fonts:         ConfirmationFonts
  links?:        ConfirmationContactLinks
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
  return `${prefix}${amount.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function safeMail(email: string | undefined): string {
  return `mailto:${(email ?? 'info@alfaytri.com').trim()}`
}
function safeTel(phone: string | undefined): string {
  const digits = (phone ?? '97444190600').replace(/\D/g, '')
  return `tel:+${digits}`
}

// ── Template ────────────────────────────────────────────────────────────────

export function buildConfirmationHtml(input: BuildConfirmationHtmlInput): string {
  const currency  = input.currency ?? 'QAR'
  const igHref    = input.links?.instagram ?? 'https://instagram.com/alfaytri'
  const webHref   = input.links?.website   ?? 'https://www.alfaytri.com'
  const mailHref  = safeMail(input.links?.email)
  const phoneHref = safeTel(input.links?.phone)
  const igLabel    = 'Instagram'
  const webLabel   = (input.links?.website   ?? 'www.alfaytri.com').replace(/^https?:\/\//, '')
  const emailLabel = input.links?.email      ?? 'info@alfaytri.com'
  const phoneLabel = `+${(input.links?.phone ?? '97444106900').replace(/\D/g, '')}`

  const servicesRows = input.services.map((li) => `
    <tr>
      <td class="cell-num">${escapeHtml(fmtMoney(li.subtotal,  currency))}</td>
      <td class="cell-num">${escapeHtml(fmtMoney(li.unitPrice, currency))}</td>
      <td class="cell-num">${escapeHtml(String(li.qty))}</td>
      <td class="cell-service">${escapeHtml(li.name).replace(/\n/g, '<br>')}</td>
    </tr>
  `).join('')

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<title>Booking Confirmation — ${escapeHtml(input.orderNumber)}</title>
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
    background: #fff;
    color: var(--text);
    font-family: 'InfieldRound', sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body {
    width: 210mm;
    padding: 14mm 0 10mm;
  }

  /* ─────────── Top: logo + addresses ─────────── */
  .top-row {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: start;
    column-gap: 0;
    padding: 0 14mm;
    margin-bottom: 6mm;
  }
  .top-row .logo {
    width: 130px;
    height: auto;
    display: block;
    align-self: center;
    margin: 0 8mm;
  }
  .addr-en {
    font-family: 'InfieldRound', sans-serif;
    font-size: 16.5px;
    line-height: 1.7;
    color: #111;
    text-align: left;
  }
  .addr-en .brand {
    font-family: 'InfieldBlock', sans-serif;
    font-size: 27px;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
    line-height: 1;
  }
  .addr-en .tagline {
    font-family: 'InfieldRound', sans-serif;
    font-weight: 400;
    font-size: 17px;
    margin-bottom: 8px;
    letter-spacing: 0.1px;
    line-height: 1.35;
  }
  .addr-ar {
    font-family: 'Noor', sans-serif;
    direction: rtl;
    text-align: right;
    font-size: 17px;
    line-height: 1.7;
    color: #111;
    font-weight: 400;
  }
  .addr-ar .brand {
    font-weight: 700;
    font-size: 29px;
    margin-bottom: 6px;
    line-height: 1;
  }
  .addr-ar .tagline {
    font-weight: 400;
    font-size: 18px;
    margin-bottom: 8px;
    line-height: 1.35;
  }

  /* ─────────── Mid bar: dark strip + contact + orange ribbon ─────────── */
  .midbar { position: relative; margin-top: 4mm; }
  .contact-strip {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6mm 14mm 6mm;
  }
  .contact-strip .left, .contact-strip .right {
    display: flex;
    gap: 10mm;
    align-items: center;
  }
  .contact-strip a {
    color: var(--link-blue);
    text-decoration: none;
    font-family: 'InfieldRound', sans-serif;
    font-size: 11px;
  }
  .dark-strip { background: var(--dark); height: 9mm; }
  .ribbon {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--orange);
    color: #fff;
    padding: 3.5mm 8mm 3mm;
    text-align: center;
    line-height: 1.2;
    width: 58mm;
  }
  .ribbon .ar-title { font-family: 'Noor', sans-serif; font-weight: 700; font-size: 15px; margin-bottom: 0.8mm; }
  .ribbon .en-title { font-family: 'InfieldBlock', sans-serif; font-size: 11px; letter-spacing: 0.4px; }
  .ribbon .order-no { font-family: 'InfieldRound', sans-serif; font-size: 9px; margin-top: 1mm; letter-spacing: 0.3px; opacity: 0.95; }

  /* ─────────── Customer details ─────────── */
  .meta {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 18mm;
    padding: 7mm 14mm 4mm;
  }
  .meta-block {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 0.7px solid var(--grey-rule);
    padding: 3.5mm 0 3.5mm;
  }
  .meta-value {
    font-family: 'InfieldRound', sans-serif;
    font-size: 12px;
    color: var(--text);
  }
  .meta-label { text-align: right; }
  .meta-label .ar { font-family: 'Noor', sans-serif; font-weight: 700; font-size: 13px; }
  .meta-label .en { font-family: 'InfieldRound', sans-serif; font-size: 9.5px; color: var(--muted); margin-top: 1px; }

  /* ─────────── Services table ─────────── */
  .services-wrap { padding: 4mm 14mm 0; }
  table.services {
    width: 100%;
    border-collapse: collapse;
    direction: rtl;
    border: 0.7px solid var(--text);
  }
  table.services th {
    background: var(--orange);
    color: #fff;
    padding: 3.5mm 3mm;
    text-align: center;
    vertical-align: middle;
    font-family: 'Noor', sans-serif;
    font-weight: 700;
    font-size: 13.5px;
    border-right: 0.7px solid var(--text);
  }
  table.services th:first-child { border-right: 0; }
  table.services th .en {
    display: block;
    font-family: 'InfieldRound', sans-serif;
    font-size: 9.5px;
    margin-top: 1px;
    opacity: 0.95;
  }
  table.services td {
    border-top: 0.7px solid var(--text);
    padding: 4mm 3mm;
    vertical-align: middle;
  }
  table.services td.cell-num {
    text-align: center;
    font-family: 'InfieldRound', sans-serif;
    font-size: 11px;
  }
  table.services td.cell-service {
    text-align: right;
    font-family: 'Noor', sans-serif;
    font-weight: 400;
    font-size: 11.5px;
    line-height: 1.55;
  }

  /* ─────────── Totals (horizontal 3-column row) ─────────── */
  .totals-wrap { padding: 0 14mm; }
  table.totals {
    width: 100%;
    border-collapse: collapse;
    direction: rtl;
    border: 0.7px solid var(--text);
    border-top: 0;
  }
  table.totals th {
    background: var(--orange);
    color: #fff;
    padding: 3.5mm 3mm;
    text-align: center;
    vertical-align: middle;
    font-family: 'Noor', sans-serif;
    font-weight: 700;
    font-size: 12.5px;
    border-right: 0.7px solid var(--text);
    width: 33.33%;
  }
  table.totals th:first-child { border-right: 0; }
  table.totals th .en {
    display: block;
    font-family: 'InfieldRound', sans-serif;
    font-size: 9px;
    margin-top: 1px;
    opacity: 0.95;
  }
  table.totals td {
    padding: 4mm 3mm;
    text-align: center;
    vertical-align: middle;
    background: var(--grey-bg);
    font-family: 'InfieldBlock', sans-serif;
    font-size: 13px;
    border-right: 0.7px solid var(--text);
    border-top: 0.7px solid var(--text);
  }
  table.totals td:first-child { border-right: 0; }

  /* ─────────── Footer ─────────── */
  .footer {
    padding-top: 6mm;
    text-align: center;
  }
  .footer img { height: 55px; width: auto; }

</style>
</head>
<body>

  <!-- ─────────── Top: company logo + addresses ─────────── -->
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

  <!-- ─────────── Mid bar: contact strip + dark strip + ribbon ─────────── -->
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
      <div class="ar-title">الخدمات المحجوزة</div>
      <div class="en-title">Requested Service</div>
      <div class="order-no">${escapeHtml(input.orderNumber)}</div>
    </div>
  </div>

  <!-- ─────────── Customer details ─────────── -->
  <div class="meta">
    <div class="meta-block">
      <div class="meta-value">${escapeHtml(input.issuingDate)}</div>
      <div class="meta-label">
        <div class="ar">تاريخ الإصدار</div>
        <div class="en">(Issuing Date)</div>
      </div>
    </div>
    <div class="meta-block">
      <div class="meta-value">${escapeHtml(input.scheduledDate)}</div>
      <div class="meta-label">
        <div class="ar">تاريخ موعد الخدمة</div>
        <div class="en">(Service Schedule Date)</div>
      </div>
    </div>
    <div class="meta-block">
      <div class="meta-value">${escapeHtml(input.customerPhone)}</div>
      <div class="meta-label">
        <div class="ar">هاتف الزبون</div>
        <div class="en">(Customer Phone)</div>
      </div>
    </div>
    <div class="meta-block">
      <div class="meta-value">${escapeHtml(input.customerName)}</div>
      <div class="meta-label">
        <div class="ar">اسم الزبون</div>
        <div class="en">(Customer Name)</div>
      </div>
    </div>
  </div>

  <!-- ─────────── Services table ─────────── -->
  <div class="services-wrap">
    <table class="services">
      <thead>
        <tr>
          <th style="width:18%">إجمالي الخدمات<span class="en">(Service Subtotal)</span></th>
          <th style="width:18%">قيمة الوحدة<span class="en">(Unit Price)</span></th>
          <th style="width:12%">الكمية<span class="en">(QTY)</span></th>
          <th style="width:52%">الخدمات المحجوزة<span class="en">(Requested Service)</span></th>
        </tr>
      </thead>
      <tbody>
        ${servicesRows}
      </tbody>
    </table>
  </div>

  <!-- ─────────── Totals: horizontal 3-column row ─────────── -->
  <div class="totals-wrap">
    <table class="totals">
      <thead>
        <tr>
          <th>قيمة الخدمات المحجوزة بعد الخصم<span class="en">(Total After Discount)</span></th>
          <th>قيمة الخصم<span class="en">(Discount)</span></th>
          <th>قيمة الخدمات<span class="en">(Services Subtotal)</span></th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${escapeHtml(fmtMoney(input.total,    currency))}</td>
          <td>${escapeHtml(fmtMoney(input.discount, currency))}</td>
          <td>${escapeHtml(fmtMoney(input.subtotal, currency))}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- ─────────── Footer ─────────── -->
  <div class="footer">
    <img src="${input.assets.footer}" alt="أهلها — Bringing comfort to your space.">
  </div>

</body>
</html>`
}
