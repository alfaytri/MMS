'use client'

import {
  Document, Page, Text, View, StyleSheet, Image, Font,
} from '@react-pdf/renderer'
import type { SaleOrder, SOLineItem } from '@/hooks/useSaleOrders'

// Register Cairo for Arabic + Latin support.
// Font files are in /public/fonts/ (downloaded in Task 3).
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const s = StyleSheet.create({
  page:        { fontFamily: 'Cairo', fontSize: 9, padding: 36, color: '#111827' },
  header:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  logo:        { width: 80, height: 40, objectFit: 'contain' },
  docTitle:    { fontSize: 20, fontFamily: 'Cairo', fontWeight: 700, color: '#1d4ed8', marginBottom: 4 },
  docMeta:     { fontSize: 8, color: '#6b7280', marginBottom: 2 },
  section:     { marginBottom: 14 },
  sectionLbl:  { fontSize: 7, fontFamily: 'Cairo', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: '#6b7280', marginBottom: 4 },
  billTo:      { fontSize: 9, color: '#111827', lineHeight: 1.5 },
  groupHeader: { backgroundColor: '#eff6ff', paddingVertical: 4, paddingHorizontal: 6, marginBottom: 2, borderRadius: 2 },
  groupLabel:  { fontSize: 8, fontFamily: 'Cairo', fontWeight: 700, color: '#1d4ed8' },
  tableRow:    { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb' },
  tableHead:   { backgroundColor: '#f9fafb' },
  c_num:       { width: '5%',  fontSize: 8, color: '#6b7280' },
  c_item:      { width: '35%', fontSize: 8 },
  c_sku:       { width: '15%', fontSize: 8, color: '#6b7280' },
  c_qty:       { width: '8%',  fontSize: 8, textAlign: 'right' },
  c_unit:      { width: '8%',  fontSize: 8, textAlign: 'center', color: '#6b7280' },
  c_price:     { width: '14%', fontSize: 8, textAlign: 'right' },
  c_total:     { width: '15%', fontSize: 8, textAlign: 'right', fontFamily: 'Cairo', fontWeight: 700 },
  divider:     { borderBottomWidth: 0.5, borderBottomColor: '#d1d5db', marginVertical: 10 },
  totRow:      { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 2 },
  totLbl:      { width: 110, fontSize: 9, color: '#6b7280', textAlign: 'right', paddingRight: 8 },
  totVal:      { width: 110, fontSize: 9, textAlign: 'right' },
  grandRow:    { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  grandLbl:    { width: 110, fontSize: 11, fontFamily: 'Cairo', fontWeight: 700, textAlign: 'right', paddingRight: 8 },
  grandVal:    { width: 110, fontSize: 11, fontFamily: 'Cairo', fontWeight: 700, textAlign: 'right' },
  termsRow:    { flexDirection: 'row', marginBottom: 3 },
  termsKey:    { width: 120, fontSize: 8, fontFamily: 'Cairo', fontWeight: 700, color: '#374151' },
  termsVal:    { flex: 1, fontSize: 8, color: '#6b7280' },
  footer:      { position: 'absolute', bottom: 24, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: '#e5e7eb', paddingTop: 6 },
  footerTxt:   { fontSize: 7, color: '#9ca3af' },
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
  const currency    = so.currency ?? 'QAR'
  const validDays   = so.validity_days ?? 30
  const presentTypes = LINE_TYPES.filter((t) => lines.some((l) => l.line_type === t))

  return (
    <Document>
      <Page size="A4" style={s.page}>

        <View style={s.header}>
          <Image style={s.logo} src="/logo.png" />
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.docTitle}>QUOTATION</Text>
            <Text style={s.docMeta}>No: {so.so_number}</Text>
            <Text style={s.docMeta}>Date: {formatDate(so.created_at)}</Text>
          </View>
        </View>

        <View style={s.divider} />

        <View style={s.section}>
          <Text style={s.sectionLbl}>Bill To</Text>
          <Text style={s.billTo}>{customerName}</Text>
          {customerPhone && <Text style={s.billTo}>{customerPhone}</Text>}
        </View>

        {presentTypes.map((lineType) => {
          const rows = lines.filter((l) => l.line_type === lineType)
          return (
            <View key={lineType} style={s.section} wrap={false}>
              <View style={s.groupHeader}><Text style={s.groupLabel}>{TYPE_LABELS[lineType]}</Text></View>
              <View style={[s.tableRow, s.tableHead]}>
                <Text style={s.c_num}>#</Text><Text style={s.c_item}>Item Name</Text>
                <Text style={s.c_sku}>SKU</Text><Text style={s.c_qty}>Qty</Text>
                <Text style={s.c_unit}>Unit</Text><Text style={s.c_price}>Unit Price</Text>
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

        <View style={s.totRow}>
          <Text style={s.totLbl}>Subtotal</Text>
          <Text style={s.totVal}>{fmt(so.subtotal, currency)}</Text>
        </View>
        {so.discount_amount_resolved > 0 && (
          <View style={s.totRow}>
            <Text style={s.totLbl}>Discount{so.discount_label ? ` (${so.discount_label})` : ''}</Text>
            <Text style={[s.totVal, { color: '#dc2626' }]}>-{fmt(so.discount_amount_resolved, currency)}</Text>
          </View>
        )}
        <View style={s.grandRow}>
          <Text style={s.grandLbl}>Grand Total</Text>
          <Text style={s.grandVal}>{fmt(so.total, currency)}</Text>
        </View>

        <View style={s.divider} />

        <View style={s.section}>
          {so.payment_terms && (
            <View style={s.termsRow}>
              <Text style={s.termsKey}>Payment Terms:</Text>
              <Text style={s.termsVal}>{so.payment_terms}{so.payment_terms_notes ? ` — ${so.payment_terms_notes}` : ''}</Text>
            </View>
          )}
          {so.delivery_terms && (
            <View style={s.termsRow}>
              <Text style={s.termsKey}>Delivery Terms:</Text>
              <Text style={s.termsVal}>{so.delivery_terms}{so.delivery_terms_notes ? ` — ${so.delivery_terms_notes}` : ''}</Text>
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

        <View style={s.footer} fixed>
          <Text style={s.footerTxt}>Al Faytri Group</Text>
          <Text style={s.footerTxt}>{so.so_number} — {formatDate(so.created_at)}</Text>
        </View>

      </Page>
    </Document>
  )
}
