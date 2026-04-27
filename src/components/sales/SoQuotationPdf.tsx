'use client'

import {
  Document, Page, Text, View, StyleSheet, Font,
} from '@react-pdf/renderer'
import type { SaleOrder, SOLineItem } from '@/hooks/useSaleOrders'

Font.register({
  family: 'Cairo',
  fonts: [
    { src: '/fonts/Cairo-Regular.ttf', fontWeight: 400 },
    { src: '/fonts/Cairo-Regular.ttf', fontWeight: 700 },
  ],
})

const CURRENCY_SYMBOLS: Record<string, string> = {
  QAR: 'QAR ', USD: '$', EUR: '€', GBP: '£', AED: 'AED ', SAR: 'SAR ', KWD: 'KWD ',
}

function fmt(amount: number, currency = 'QAR') {
  const sym = CURRENCY_SYMBOLS[currency] ?? `${currency} `
  return `${sym}${amount.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const s = StyleSheet.create({
  page:         { fontFamily: 'Cairo', fontSize: 9, padding: 40, color: '#111827' },

  // ── Header row ─────────────────────────────────────────────────────────────
  headerRow:    { flexDirection: 'row', marginBottom: 24 },
  companyCol:   { width: '50%' },
  companyBrand: { fontSize: 16, fontFamily: 'Cairo', fontWeight: 700, color: '#1d4ed8', marginBottom: 6 },
  companyLine:  { fontSize: 8, color: '#6b7280', marginBottom: 3 },

  quotationCol: { width: '50%', alignItems: 'flex-end' },
  docTitle:     { fontSize: 26, fontFamily: 'Cairo', fontWeight: 700, color: '#1d4ed8', marginBottom: 8 },
  metaRow:      { flexDirection: 'row', marginBottom: 3 },
  metaKey:      { width: 60, fontSize: 8, color: '#6b7280' },
  metaVal:      { fontSize: 8, fontFamily: 'Cairo', fontWeight: 700, color: '#111827' },

  // ── Divider ─────────────────────────────────────────────────────────────────
  divider:      { borderBottomWidth: 0.5, borderBottomColor: '#d1d5db', marginVertical: 14 },

  // ── Bill To / Reference row ─────────────────────────────────────────────────
  billRow:      { flexDirection: 'row', marginBottom: 18 },
  billLeft:     { width: '50%' },
  billRight:    { width: '50%', alignItems: 'flex-end' },
  sectionLbl:   { fontSize: 7, fontFamily: 'Cairo', fontWeight: 700, color: '#6b7280',
                  textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 },
  billName:     { fontSize: 11, fontFamily: 'Cairo', fontWeight: 700, color: '#111827', marginBottom: 2 },
  billSub:      { fontSize: 8, color: '#6b7280' },

  // ── Line items table ─────────────────────────────────────────────────────────
  section:      { marginBottom: 14 },
  groupHeader:  { backgroundColor: '#eff6ff', paddingVertical: 4, paddingHorizontal: 6,
                  marginBottom: 2, borderRadius: 2 },
  groupLabel:   { fontSize: 8, fontFamily: 'Cairo', fontWeight: 700, color: '#1d4ed8' },
  tableRow:     { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 6,
                  borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb' },
  tableHead:    { backgroundColor: '#f3f4f6' },
  c_num:        { width: '5%',  fontSize: 8, color: '#6b7280' },
  c_item:       { width: '35%', fontSize: 8 },
  c_sku:        { width: '15%', fontSize: 8, color: '#6b7280' },
  c_qty:        { width: '8%',  fontSize: 8, textAlign: 'right' },
  c_unit:       { width: '8%',  fontSize: 8, textAlign: 'center', color: '#6b7280' },
  c_price:      { width: '14%', fontSize: 8, textAlign: 'right' },
  c_total:      { width: '15%', fontSize: 8, textAlign: 'right', fontFamily: 'Cairo', fontWeight: 700 },

  // ── Totals ───────────────────────────────────────────────────────────────────
  totRow:       { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 3 },
  totLbl:       { width: 100, fontSize: 9, color: '#6b7280', textAlign: 'right', paddingRight: 10 },
  totVal:       { width: 110, fontSize: 9, textAlign: 'right' },
  grandRow:     { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 5,
                  marginTop: 4, borderTopWidth: 0.5, borderTopColor: '#d1d5db' },
  grandLbl:     { width: 100, fontSize: 11, fontFamily: 'Cairo', fontWeight: 700,
                  textAlign: 'right', paddingRight: 10 },
  grandVal:     { width: 110, fontSize: 11, fontFamily: 'Cairo', fontWeight: 700, textAlign: 'right' },

  // ── Terms ────────────────────────────────────────────────────────────────────
  termsRow:     { flexDirection: 'row', marginBottom: 4 },
  termsKey:     { width: 120, fontSize: 8, fontFamily: 'Cairo', fontWeight: 700, color: '#374151' },
  termsVal:     { flex: 1, fontSize: 8, color: '#6b7280' },

  // ── Footer ───────────────────────────────────────────────────────────────────
  footer:       { position: 'absolute', bottom: 24, left: 40, right: 40,
                  flexDirection: 'row', justifyContent: 'space-between',
                  borderTopWidth: 0.5, borderTopColor: '#e5e7eb', paddingTop: 6 },
  footerTxt:    { fontSize: 7, color: '#9ca3af' },
})

const LINE_TYPES = ['products', 'spare-parts', 'consumables', 'tools'] as const
const TYPE_LABELS: Record<string, string> = {
  products: 'Products', 'spare-parts': 'Spare Parts', consumables: 'Consumables', tools: 'Tools & Assets',
}

interface Props {
  so:            SaleOrder
  lines:         SOLineItem[]
  customerName:  string
  customerPhone: string | null
}

export function QuotationDocument({ so, lines, customerName, customerPhone }: Props) {
  const currency     = so.currency ?? 'QAR'
  const validDays    = so.validity_days ?? 30
  const presentTypes = LINE_TYPES.filter((t) => lines.some((l) => l.line_type === t))

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Header ── */}
        <View style={s.headerRow}>

          {/* Left — company */}
          <View style={s.companyCol}>
            <Text style={s.companyBrand}>Al Faytri Group</Text>
            <Text style={s.companyLine}>Doha, Qatar</Text>
            <Text style={s.companyLine}>Tel: +974 4444 5555</Text>
            <Text style={s.companyLine}>info@alfaytri.com</Text>
          </View>

          {/* Right — quotation details */}
          <View style={s.quotationCol}>
            <Text style={s.docTitle}>QUOTATION</Text>
            <View style={s.metaRow}>
              <Text style={s.metaKey}>Quote #</Text>
              <Text style={s.metaVal}>{so.so_number}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={s.metaKey}>Date</Text>
              <Text style={s.metaVal}>{fmtDate(so.created_at)}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={s.metaKey}>Valid For</Text>
              <Text style={s.metaVal}>{validDays} days</Text>
            </View>
            {so.currency !== 'QAR' && (
              <View style={s.metaRow}>
                <Text style={s.metaKey}>Currency</Text>
                <Text style={s.metaVal}>{so.currency}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={s.divider} />

        {/* ── Bill To / Reference ── */}
        <View style={s.billRow}>
          <View style={s.billLeft}>
            <Text style={s.sectionLbl}>Bill To</Text>
            <Text style={s.billName}>{customerName}</Text>
            {customerPhone && <Text style={s.billSub}>{customerPhone}</Text>}
          </View>
          <View style={s.billRight}>
            <Text style={s.sectionLbl}>Reference</Text>
            <Text style={s.billName}>{so.so_number}</Text>
            <Text style={s.billSub}>Sale Order</Text>
          </View>
        </View>

        <View style={s.divider} />

        {/* ── Line items grouped by type ── */}
        {presentTypes.map((lineType) => {
          const rows = lines.filter((l) => l.line_type === lineType)
          return (
            <View key={lineType} style={s.section} wrap={false}>
              <View style={s.groupHeader}>
                <Text style={s.groupLabel}>{TYPE_LABELS[lineType]}</Text>
              </View>
              <View style={[s.tableRow, s.tableHead]}>
                <Text style={s.c_num}>#</Text>
                <Text style={s.c_item}>Item Name</Text>
                <Text style={s.c_sku}>SKU</Text>
                <Text style={s.c_qty}>Qty</Text>
                <Text style={s.c_unit}>Unit</Text>
                <Text style={s.c_price}>Unit Price</Text>
                <Text style={s.c_total}>Total</Text>
              </View>
              {rows.map((li, idx) => (
                <View key={li.id} style={s.tableRow}>
                  <Text style={s.c_num}>{idx + 1}</Text>
                  <Text style={s.c_item}>{li.item_name}</Text>
                  <Text style={s.c_sku}>{li.sku ?? '—'}</Text>
                  <Text style={s.c_qty}>{li.qty}</Text>
                  <Text style={s.c_unit}>{li.unit}</Text>
                  <Text style={s.c_price}>{fmt(li.unit_price, currency)}</Text>
                  <Text style={s.c_total}>{fmt(li.total, currency)}</Text>
                </View>
              ))}
            </View>
          )
        })}

        <View style={s.divider} />

        {/* ── Totals ── */}
        <View style={s.totRow}>
          <Text style={s.totLbl}>Subtotal</Text>
          <Text style={s.totVal}>{fmt(so.subtotal, currency)}</Text>
        </View>
        {so.discount_amount_resolved > 0 && (
          <View style={s.totRow}>
            <Text style={s.totLbl}>
              Discount{so.discount_label ? ` (${so.discount_label})` : ''}
            </Text>
            <Text style={[s.totVal, { color: '#dc2626' }]}>
              -{fmt(so.discount_amount_resolved, currency)}
            </Text>
          </View>
        )}
        <View style={s.grandRow}>
          <Text style={s.grandLbl}>Grand Total</Text>
          <Text style={s.grandVal}>{fmt(so.total, currency)}</Text>
        </View>

        <View style={s.divider} />

        {/* ── Terms ── */}
        <View style={s.section}>
          {so.payment_terms && (
            <View style={s.termsRow}>
              <Text style={s.termsKey}>Payment Terms:</Text>
              <Text style={s.termsVal}>
                {so.payment_terms}{so.payment_terms_notes ? ` — ${so.payment_terms_notes}` : ''}
              </Text>
            </View>
          )}
          {so.delivery_terms && (
            <View style={s.termsRow}>
              <Text style={s.termsKey}>Delivery Terms:</Text>
              <Text style={s.termsVal}>
                {so.delivery_terms}{so.delivery_terms_notes ? ` — ${so.delivery_terms_notes}` : ''}
              </Text>
            </View>
          )}
          {so.customer_notes && (
            <View style={s.termsRow}>
              <Text style={s.termsKey}>Notes:</Text>
              <Text style={s.termsVal}>{so.customer_notes}</Text>
            </View>
          )}
          <View style={s.termsRow}>
            <Text style={s.termsKey}>Validity:</Text>
            <Text style={s.termsVal}>{validDays} days from issue date</Text>
          </View>
        </View>

        {/* ── Footer ── */}
        <View style={s.footer} fixed>
          <Text style={s.footerTxt}>Al Faytri Group — Doha, Qatar</Text>
          <Text style={s.footerTxt}>{so.so_number} · {fmtDate(so.created_at)}</Text>
        </View>

      </Page>
    </Document>
  )
}
