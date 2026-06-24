// src/components/quotations/QuotationPdfPreview.tsx
'use client'
import { forwardRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import type { QuotationDraft } from '@/types/quotations'

// Admin-configurable validity duration (days). Falls back to 30 if the setting
// row is missing or malformed. Cached for 5 min so every keystroke on the
// quotation form doesn't refetch.
function useQuotationValidityDays() {
  return useQuery<number>({
    queryKey: ['app_settings', 'order_quotation_validity_days'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'order_quotation_validity_days')
        .maybeSingle()
      const days = Number((data?.value as { days?: number } | null)?.days)
      return Number.isFinite(days) && days > 0 ? days : 30
    },
  })
}

// ─── Brand asset URLs (served from /public/brand) ──────────────────────────
// IMPORTANT: html2canvas needs same-origin fonts, so we serve them from /public.
const BRAND = {
  logo:   '/brand/Company logo.png',
  footer: '/brand/Footer.png',
  fonts: {
    infieldBlock:   '/brand/Font/Infield/Infield-Block.ttf',
    infieldRounded: '/brand/Font/Infield/Infield-Rounded.ttf',
    noorRegular:    '/brand/Font/Noor/Noor Regular.ttf',
    noorBold:       '/brand/Font/Noor/Noor Bold.ttf',
  },
}

// Inline once per render — html2canvas reads computed styles from the DOM, so
// the @font-face must live in a real <style> element it can crawl.
const FONT_FACE_CSS = `
@font-face { font-family: 'InfieldBlock';   src: url('${BRAND.fonts.infieldBlock}')   format('truetype'); }
@font-face { font-family: 'InfieldRound';   src: url('${BRAND.fonts.infieldRounded}') format('truetype'); }
@font-face { font-family: 'Noor';           src: url('${BRAND.fonts.noorRegular}')    format('truetype'); font-weight: 400; }
@font-face { font-family: 'Noor';           src: url('${BRAND.fonts.noorBold}')       format('truetype'); font-weight: 700; }
`

// ─── Money formatting — match the confirmation PDF ─────────────────────────
const CURRENCY_PREFIXES: Record<string, string> = {
  QAR: 'QAR ', USD: '$', EUR: '€', GBP: '£', AED: 'AED ', SAR: 'SAR ', KWD: 'KWD ',
}
function fmtMoney(amount: number, currency: string): string {
  const prefix = CURRENCY_PREFIXES[currency] ?? `${currency} `
  return `${prefix}${amount.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface Props {
  draft: QuotationDraft
  total: number
  discountType: 'flat' | 'percent'
  discountValue: number
  subtotal: number
  discountAmount: number
  creatorName: string | null
}

export const QuotationPdfPreview = forwardRef<HTMLDivElement, Props>(
  function QuotationPdfPreview(
    { draft, total, subtotal, discountAmount, creatorName },
    ref,
  ) {
  const { data: validityDays = 30 } = useQuotationValidityDays()
  const currency = 'QAR'
  const today    = format(new Date(), 'dd MMM yyyy')
  const expiryDate = (() => {
    const d = new Date()
    d.setDate(d.getDate() + validityDays)
    return format(d, 'dd MMM yyyy')
  })()

  return (
    <div className="flex h-full items-start justify-center overflow-y-auto bg-slate-100 p-6">
      <style>{FONT_FACE_CSS}</style>
      <div
        ref={ref}
        className="bg-white shadow-xl"
        style={{
          width: '210mm',
          minHeight: '297mm',
          color: '#111',
          fontFamily: "'InfieldRound', sans-serif",
          paddingTop: '14mm',
          paddingBottom: '10mm',
          boxSizing: 'border-box',
          // flex column so the footer can sit at the bottom of the page
          // (marginTop: 'auto' on the footer pushes it down) instead of
          // floating up under the totals when the services list is short.
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* ─────────── Top: company info + central logo ─────────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            alignItems: 'start',
            padding: '0 14mm',
            marginBottom: '6mm',
          }}
        >
          <div style={{ fontFamily: "'InfieldRound', sans-serif", fontSize: 13, lineHeight: 1.7, textAlign: 'left' }}>
            <div style={{ fontFamily: "'InfieldBlock', sans-serif", fontSize: 24, letterSpacing: 0.5, marginBottom: 6, lineHeight: 1 }}>ALFAYTRI</div>
            <div style={{ fontSize: 14, marginBottom: 8, letterSpacing: 0.1, lineHeight: 1.35 }}>For trading and building maintenance W.L.L</div>
            <div>Office 14, Building 54, Street 185, Zone 55 Doha,</div>
            <div>Qatar | P.O. Box 45069</div>
          </div>

          <img
            src={BRAND.logo}
            alt="Al Faytri"
            style={{ width: 110, height: 'auto', display: 'block', alignSelf: 'center', margin: '0 8mm' }}
            crossOrigin="anonymous"
          />

          <div style={{ fontFamily: "'Noor', sans-serif", direction: 'rtl', textAlign: 'right', fontSize: 14, lineHeight: 1.7, fontWeight: 400 }}>
            <div style={{ fontWeight: 700, fontSize: 26, marginBottom: 6, lineHeight: 1 }}>الفيتري</div>
            <div style={{ fontSize: 16, marginBottom: 8, lineHeight: 1.35 }}>للتجارة وصيانة المباني ذ.م.م</div>
            <div>مكتب 14 مبنى 54 شارع 185 منطقة 55 الدوحة قطر</div>
            <div>ص.ب 45069</div>
          </div>
        </div>

        {/* ─────────── Mid bar: contact strip + dark strip + orange ribbon ─────────── */}
        <div style={{ position: 'relative', marginTop: '4mm' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '6mm 14mm',
            }}
          >
            <div style={{ display: 'flex', gap: '10mm', alignItems: 'center' }}>
              <span style={{ color: '#1d63d8', fontSize: 10 }}>Instagram</span>
              <span style={{ color: '#1d63d8', fontSize: 10 }}>www.alfaytri.com</span>
            </div>
            <div style={{ display: 'flex', gap: '10mm', alignItems: 'center' }}>
              <span style={{ color: '#1d63d8', fontSize: 10 }}>info@alfaytri.com</span>
              <span style={{ color: '#1d63d8', fontSize: 10 }}>+97444106900</span>
            </div>
          </div>

          <div style={{ background: '#2f2f33', height: '9mm' }} />

          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: '#ED7C2C',
              color: '#fff',
              padding: '3.5mm 8mm 3mm',
              textAlign: 'center',
              lineHeight: 1.2,
              width: '58mm',
            }}
          >
            <div style={{ fontFamily: "'Noor', sans-serif", fontWeight: 700, fontSize: 15, marginBottom: '0.8mm' }}>عرض السعر</div>
            <div style={{ fontFamily: "'InfieldBlock', sans-serif", fontSize: 11, letterSpacing: 0.4 }}>ORDER QUOTATION</div>
            <div style={{ fontFamily: "'InfieldRound', sans-serif", fontSize: 9, marginTop: '1mm', letterSpacing: 0.3, opacity: 0.95 }}>
              {draft.quotationId || '—'}
            </div>
          </div>
        </div>

        {/* ─────────── Bilingual meta grid ─────────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0 18mm',
            padding: '7mm 14mm 4mm',
          }}
        >
          <MetaBlock value={today}                       arLabel="تاريخ الإصدار"       enLabel="(Issuing Date)" />
          <MetaBlock value={expiryDate}                  arLabel="صالح حتى"            enLabel="(Valid Until)" />
          <MetaBlock value={draft.phone || '—'}          arLabel="هاتف الزبون"         enLabel="(Customer Phone)" />
          <MetaBlock value={draft.customerName || '—'}   arLabel="اسم الزبون"          enLabel="(Customer Name)" />
        </div>

        {/* ─────────── Services table (RTL, orange headers) ─────────── */}
        <div style={{ padding: '4mm 14mm 0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', direction: 'rtl', border: '0.7px solid #111' }}>
            <thead>
              <tr>
                <Th width="18%" ar="إجمالي الخدمات" en="(Service Subtotal)" />
                <Th width="18%" ar="قيمة الوحدة"    en="(Unit Price)" />
                <Th width="12%" ar="الكمية"          en="(QTY)" />
                <Th width="52%" ar="الخدمات المعروضة" en="(Quoted Services)" first />
              </tr>
            </thead>
            <tbody>
              {draft.services.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ borderTop: '0.7px solid #111', padding: '10mm 3mm', textAlign: 'center', color: '#999', fontStyle: 'italic', fontSize: 11 }}>
                    Add services from the left panel
                  </td>
                </tr>
              ) : (
                draft.services.map((s, i) => (
                  <tr key={`${s.serviceId}-${i}`}>
                    <Td num>{fmtMoney(s.price * s.qty, currency)}</Td>
                    <Td num>{fmtMoney(s.price, currency)}</Td>
                    <Td num>{s.qty}</Td>
                    <td
                      style={{
                        borderTop: '0.7px solid #111',
                        padding: '4mm 3mm',
                        textAlign: 'right',
                        fontFamily: "'Noor', sans-serif",
                        fontSize: 11.5,
                        lineHeight: 1.55,
                      }}
                    >
                      <div>{s.name}</div>
                      {s.path.length > 1 && (
                        <div style={{ fontSize: 9.5, color: '#555', marginTop: 2 }}>{s.path.slice(0, -1).join(' › ')}</div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ─────────── Totals (3-column, RTL) ─────────── */}
        <div style={{ padding: '0 14mm' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', direction: 'rtl', border: '0.7px solid #111', borderTop: 0 }}>
            <thead>
              <tr>
                <Th width="33.33%" ar="قيمة الخدمات بعد الخصم" en="(Total After Discount)" small />
                <Th width="33.33%" ar="قيمة الخصم"             en="(Discount)"             small />
                <Th width="33.33%" ar="قيمة الخدمات"           en="(Services Subtotal)"    small first />
              </tr>
            </thead>
            <tbody>
              <tr>
                <TotalsTd>{fmtMoney(total,          currency)}</TotalsTd>
                <TotalsTd>{fmtMoney(discountAmount, currency)}</TotalsTd>
                <TotalsTd last>{fmtMoney(subtotal,  currency)}</TotalsTd>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ─────────── Notes (between totals and footer) ─────────── */}
        {(draft.notes || creatorName) && (
          <div style={{ padding: '6mm 14mm 0' }}>
            {draft.notes && (
              <div style={{ marginBottom: '3mm' }}>
                <div style={{ fontFamily: "'Noor', sans-serif", fontWeight: 700, fontSize: 11, color: '#6b7280', marginBottom: '1mm' }}>
                  ملاحظات · NOTES
                </div>
                <div style={{ fontSize: 11, color: '#333', whiteSpace: 'pre-wrap' }}>{draft.notes}</div>
              </div>
            )}
            <div style={{ fontSize: 10, color: '#6b7280', fontStyle: 'italic' }}>
              Valid for {validityDays} days from issue date.
              {creatorName && <> · Prepared by {creatorName}</>}
            </div>
          </div>
        )}

        {/* ─────────── Footer ─────────── */}
        {/* marginTop: 'auto' pins the footer to the bottom of the A4 page
            when the content above is shorter than the minHeight. */}
        <div style={{ marginTop: 'auto', paddingTop: '6mm', textAlign: 'center' }}>
          <img
            src={BRAND.footer}
            alt="أهلها — Bringing comfort to your space."
            style={{ height: 55, width: 'auto', display: 'inline-block' }}
            crossOrigin="anonymous"
          />
        </div>
      </div>
    </div>
  )
})

// ─── Cell helpers ───────────────────────────────────────────────────────────

function MetaBlock({ value, arLabel, enLabel }: { value: string; arLabel: string; enLabel: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        borderBottom: '0.7px solid #d0d0d0',
        padding: '3.5mm 0',
      }}
    >
      <div style={{ fontFamily: "'InfieldRound', sans-serif", fontSize: 12 }}>{value}</div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontFamily: "'Noor', sans-serif", fontWeight: 700, fontSize: 13 }}>{arLabel}</div>
        <div style={{ fontFamily: "'InfieldRound', sans-serif", fontSize: 9.5, color: '#6b7280', marginTop: 1 }}>{enLabel}</div>
      </div>
    </div>
  )
}

function Th({ width, ar, en, first = false, small = false }: { width: string; ar: string; en: string; first?: boolean; small?: boolean }) {
  return (
    <th
      style={{
        width,
        background: '#ED7C2C',
        color: '#fff',
        padding: '3.5mm 3mm',
        textAlign: 'center',
        verticalAlign: 'middle',
        fontFamily: "'Noor', sans-serif",
        fontWeight: 700,
        fontSize: small ? 12.5 : 13.5,
        borderRight: first ? 0 : '0.7px solid #111',
      }}
    >
      {ar}
      <div style={{ fontFamily: "'InfieldRound', sans-serif", fontSize: 9.5, marginTop: 1, opacity: 0.95, fontWeight: 400 }}>{en}</div>
    </th>
  )
}

function Td({ children, num }: { children: React.ReactNode; num?: boolean }) {
  return (
    <td
      style={{
        borderTop: '0.7px solid #111',
        padding: '4mm 3mm',
        verticalAlign: 'middle',
        textAlign: num ? 'center' : 'right',
        fontFamily: "'InfieldRound', sans-serif",
        fontSize: 11,
      }}
    >
      {children}
    </td>
  )
}

function TotalsTd({ children, last = false }: { children: React.ReactNode; last?: boolean }) {
  return (
    <td
      style={{
        padding: '4mm 3mm',
        textAlign: 'center',
        verticalAlign: 'middle',
        background: '#efefef',
        fontFamily: "'InfieldBlock', sans-serif",
        fontSize: 13,
        borderRight: last ? 0 : '0.7px solid #111',
        borderTop: '0.7px solid #111',
      }}
    >
      {children}
    </td>
  )
}
