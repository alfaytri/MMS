import { promises as fs } from 'node:fs'
import path from 'node:path'

export interface PdfFonts {
  ibmPlexRegular:    string
  ibmPlexMedium:     string
  ibmPlexSemiBold:   string
  ibmPlexBold:       string
  ibmPlexArRegular:  string
  ibmPlexArSemiBold: string
  ibmPlexArBold:     string
}

export interface PdfAssets {
  logo:   string
  footer: string
}

const BRAND_DIR = path.join(process.cwd(), 'public', 'brand')
const FONT_DIR  = path.join(BRAND_DIR, 'Font')
const PLEX_DIR  = path.join(FONT_DIR, 'IBM_Plex_Sans,IBM_Plex_Sans_Arabic,Rajdhani,Tajawal,Teko')

async function readAsBase64(p: string): Promise<string> {
  const buf = await fs.readFile(p)
  return buf.toString('base64')
}

let cachedFonts: PdfFonts | null = null
export async function loadPdfFonts(): Promise<PdfFonts> {
  if (cachedFonts) return cachedFonts
  const latin = path.join(PLEX_DIR, 'IBM_Plex_Sans', 'static')
  const arabic = path.join(PLEX_DIR, 'IBM_Plex_Sans_Arabic')
  const toDataUrl = async (p: string) => {
    const b64 = await readAsBase64(p)
    return `data:font/ttf;base64,${b64}`
  }
  const [r, m, sb, b, arR, arSb, arB] = await Promise.all([
    toDataUrl(path.join(latin,  'IBMPlexSans-Regular.ttf')),
    toDataUrl(path.join(latin,  'IBMPlexSans-Medium.ttf')),
    toDataUrl(path.join(latin,  'IBMPlexSans-SemiBold.ttf')),
    toDataUrl(path.join(latin,  'IBMPlexSans-Bold.ttf')),
    toDataUrl(path.join(arabic, 'IBMPlexSansArabic-Regular.ttf')),
    toDataUrl(path.join(arabic, 'IBMPlexSansArabic-SemiBold.ttf')),
    toDataUrl(path.join(arabic, 'IBMPlexSansArabic-Bold.ttf')),
  ])
  cachedFonts = {
    ibmPlexRegular: r, ibmPlexMedium: m, ibmPlexSemiBold: sb, ibmPlexBold: b,
    ibmPlexArRegular: arR, ibmPlexArSemiBold: arSb, ibmPlexArBold: arB,
  }
  return cachedFonts
}

let cachedAssets: PdfAssets | null = null
export async function loadPdfAssets(): Promise<PdfAssets> {
  if (cachedAssets) return cachedAssets
  const [logoB64, footerB64] = await Promise.all([
    readAsBase64(path.join(BRAND_DIR, 'Company logo.png')),
    readAsBase64(path.join(BRAND_DIR, 'Footer.png')),
  ])
  cachedAssets = {
    logo:   `data:image/png;base64,${logoB64}`,
    footer: `data:image/png;base64,${footerB64}`,
  }
  return cachedAssets
}

export function fontFacesCss(fonts: PdfFonts): string {
  return `
  @font-face { font-family: 'IBMPlexSans'; src: url('${fonts.ibmPlexRegular}')  format('truetype'); font-weight: 400; }
  @font-face { font-family: 'IBMPlexSans'; src: url('${fonts.ibmPlexMedium}')   format('truetype'); font-weight: 500; }
  @font-face { font-family: 'IBMPlexSans'; src: url('${fonts.ibmPlexSemiBold}') format('truetype'); font-weight: 600; }
  @font-face { font-family: 'IBMPlexSans'; src: url('${fonts.ibmPlexBold}')     format('truetype'); font-weight: 700; }
  @font-face { font-family: 'IBMPlexAr';   src: url('${fonts.ibmPlexArRegular}')  format('truetype'); font-weight: 400; }
  @font-face { font-family: 'IBMPlexAr';   src: url('${fonts.ibmPlexArSemiBold}') format('truetype'); font-weight: 600; }
  @font-face { font-family: 'IBMPlexAr';   src: url('${fonts.ibmPlexArBold}')     format('truetype'); font-weight: 700; }
  `
}

export function brandHeaderHtml(logoDataUrl: string): string {
  return `
  <div class="top-row">
    <div class="addr-en">
      <div class="brand">ALFAYTRI</div>
      <div class="tagline">Trading and Building Maintenance</div>
      <div>Office 18, Building 19, Street 185, Zone 55</div>
      <div>Doha, Qatar | P.O. Box 45069</div>
      <div>Trading: 44214420 | Maintenance: 44190600</div>
      <div>info@alfaytri.com | www.alfaytri.com</div>
    </div>
    <img class="logo" src="${logoDataUrl}" alt="Al Faytri">
    <div class="addr-ar">
      <div class="brand">الفيتري</div>
      <div class="tagline">للتجارة وصيانة المباني</div>
      <div>مكتب ١٨ ، مبنى ١٩ ، شارع ١٨٥ ، منطقة ٥٥</div>
      <div>الدوحة ، قطر | ص.ب ٤٥٠٦٩</div>
      <div>التداول: ٤٤٢١٤٤٢٠ | الصيانة: ٤٤١٩٠٦٠٠</div>
      <div>info@alfaytri.com | www.alfaytri.com</div>
    </div>
  </div>`
}

export function contactStripHtml(): string {
  return `
  <div class="contact-strip">
    <div class="left">
      <a href="https://instagram.com/alfaytri">Instagram</a>
      <a href="https://www.alfaytri.com">www.alfaytri.com</a>
    </div>
    <div class="right">
      <a href="mailto:info@alfaytri.com">info@alfaytri.com</a>
      <a href="tel:+97444106900">+97444106900</a>
    </div>
  </div>`
}

export function footerHtml(footerDataUrl: string): string {
  return `
  <div class="footer">
    <img src="${footerDataUrl}" alt="أهلها — Bringing comfort to your space.">
  </div>`
}

export const BASE_CSS = `
  @page { size: A4; margin: 0; }

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
    font-family: 'IBMPlexSans', sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  body { width: 210mm; height: 297mm; position: relative; overflow: hidden; padding: 6mm 0 10mm; }

  .top-row {
    display: grid; grid-template-columns: 1fr auto 1fr;
    align-items: start; padding: 0 14mm; margin-bottom: 0;
  }
  .top-row .logo { width: 55px; height: auto; display: block; align-self: center; margin: 0 4mm; }
  .addr-en { font-family: 'IBMPlexSans', sans-serif; font-size: 7px; line-height: 1.4; color: #111; text-align: left; }
  .addr-en .brand { font-family: 'IBMPlexSans', sans-serif; font-weight: 700; font-size: 14px; letter-spacing: 0.5px; margin-bottom: 1px; line-height: 1; }
  .addr-en .tagline { font-weight: 400; font-size: 7px; margin-bottom: 1px; letter-spacing: 0.1px; line-height: 1.2; }
  .addr-ar { font-family: 'IBMPlexAr', sans-serif; direction: rtl; text-align: right; font-size: 7px; line-height: 1.4; color: #111; font-weight: 400; }
  .addr-ar .brand { font-weight: 700; font-size: 14px; margin-bottom: 1px; line-height: 1; }
  .addr-ar .tagline { font-weight: 400; font-size: 7px; margin-bottom: 1px; line-height: 1.2; }

  .midbar { position: relative; margin-top: 1mm; }
  .contact-strip { display: flex; justify-content: space-between; align-items: center; padding: 6mm 14mm; }
  .contact-strip .left, .contact-strip .right { display: flex; gap: 10mm; align-items: center; }
  .contact-strip a { color: var(--link-blue); text-decoration: none; font-family: 'IBMPlexSans', sans-serif; font-size: 11px; }
  .dark-strip { background: var(--dark); height: 9mm; }
  .ribbon {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: var(--orange); color: #fff; padding: 3.5mm 8mm 3mm;
    text-align: center; line-height: 1.2; width: 58mm;
  }
  .ribbon .ar-title { font-family: 'IBMPlexAr', sans-serif; font-weight: 700; font-size: 15px; margin-bottom: 0.8mm; }
  .ribbon .en-title { font-family: 'IBMPlexSans', sans-serif; font-weight: 700; font-size: 11px; letter-spacing: 0.4px; }
  .ribbon .doc-no { font-family: 'IBMPlexSans', sans-serif; font-size: 9px; margin-top: 1mm; letter-spacing: 0.3px; opacity: 0.95; }

  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12mm; padding: 1.5mm 14mm 1mm; }
  .meta-block {
    display: flex; justify-content: space-between; align-items: center;
    border-bottom: 0.5px solid var(--grey-rule); padding: 1.5mm 0;
  }
  .meta-value { font-family: 'IBMPlexSans', sans-serif; font-size: 8px; color: var(--text); }
  .meta-label { text-align: right; }
  .meta-label .ar { font-family: 'IBMPlexAr', sans-serif; font-weight: 700; font-size: 9px; }
  .meta-label .en { font-family: 'IBMPlexSans', sans-serif; font-size: 7px; color: var(--muted); margin-top: 0; }

  .lines-wrap { padding: 4mm 14mm 0; }
  table.lines {
    width: 100%; border-collapse: collapse; direction: rtl; border: 0.7px solid var(--text);
  }
  table.lines th {
    background: var(--orange); color: #fff; padding: 3.5mm 3mm;
    text-align: center; vertical-align: middle;
    font-family: 'IBMPlexAr', sans-serif; font-weight: 700; font-size: 13.5px;
    border-right: 0.7px solid var(--text);
  }
  table.lines th:first-child { border-right: 0; }
  table.lines th .en { display: block; font-family: 'IBMPlexSans', sans-serif; font-size: 9.5px; margin-top: 1px; opacity: 0.95; }
  table.lines td { border-top: 0.7px solid var(--text); padding: 2mm 3mm; vertical-align: middle; }
  table.lines td.cell-num { text-align: center; font-family: 'IBMPlexSans', sans-serif; font-size: 11px; }
  table.lines td.cell-item { text-align: right; }
  table.lines td.cell-item .item-name { font-family: 'IBMPlexSans', sans-serif; font-size: 11px; color: var(--text); line-height: 1.3; }
  table.lines td.cell-item .item-name-ar { font-family: 'IBMPlexAr', sans-serif; font-size: 10px; color: var(--text); direction: rtl; line-height: 1.3; }
  table.lines td.cell-item .item-sku { font-family: 'IBMPlexSans', sans-serif; font-size: 8px; color: var(--muted); margin-top: 1px; }

  .bottom-section { display: flex; gap: 4mm; padding: 0 14mm; align-items: flex-start; }
  .terms-wrap { flex: 1; }
  .terms { padding: 3mm 0 0; }
  .terms-row { display: grid; grid-template-columns: 38mm 1fr; gap: 3mm; margin-bottom: 1mm; font-size: 9px; }
  .terms-key { font-family: 'IBMPlexSans', sans-serif; font-weight: 700; color: var(--text); }
  .terms-val { font-family: 'IBMPlexSans', sans-serif; color: var(--muted); }

  .summary-inner { border: 0.7px solid var(--text); white-space: nowrap; }
  .summary-row {
    display: flex; align-items: baseline; padding: 1.5mm 3mm;
    border-bottom: 0.7px solid var(--grey-rule); direction: rtl; gap: 1.5mm;
  }
  .summary-row:last-child { border-bottom: none; }
  .summary-row .s-label { font-family: 'IBMPlexAr', sans-serif; font-weight: 700; font-size: 9px; }
  .summary-row .s-en { font-family: 'IBMPlexSans', sans-serif; font-size: 7px; color: var(--muted); }
  .summary-row .s-sep { font-size: 8px; color: var(--muted); }
  .summary-row .s-amount { font-family: 'IBMPlexSans', sans-serif; font-weight: 700; font-size: 9px; direction: ltr; margin-inline-start: auto; }
  .summary-row.s-grand { background: rgba(237, 124, 44, 0.12); }
  .summary-row.s-grand .s-amount { font-size: 10px; }
  .summary-row.s-bill-total { background: rgba(47, 47, 51, 0.08); }

  .footer { position: absolute; bottom: 10mm; left: 0; right: 0; text-align: center; }
  .footer img { height: 45px; width: auto; }

  @media print { body { background: #fff; padding: 6mm 0 10mm; } }
`
