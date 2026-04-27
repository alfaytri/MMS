'use client'

import {
  Document, Page, Text, View, StyleSheet, Image, Font,
} from '@react-pdf/renderer'
import type { ArInvoice } from '@/types/invoice'

Font.register({
  family: 'Cairo',
  fonts: [
    { src: '/fonts/Cairo-Regular.ttf', fontWeight: 400 },
    { src: '/fonts/Cairo-Regular.ttf', fontWeight: 700 },
  ],
})

function fmt(amount: number | null) {
  const n = amount ?? 0
  return `QAR ${n.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const s = StyleSheet.create({
  page:        { fontFamily: 'Cairo', fontSize: 9, padding: 36, color: '#111827' },

  // ── Top header row ──────────────────────────────────────────────────────────
  headerRow:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },

  // Left: company block
  companyCol:  { flexDirection: 'column', gap: 3 },
  logo:        { width: 90, height: 44, objectFit: 'contain', marginBottom: 6 },
  companyName: { fontSize: 11, fontFamily: 'Cairo', fontWeight: 700, color: '#111827' },
  companyMeta: { fontSize: 8, color: '#6b7280', marginTop: 1 },

  // Right: invoice title block
  invoiceCol:  { alignItems: 'flex-end' },
  docTitle:    { fontSize: 22, fontFamily: 'Cairo', fontWeight: 700, color: '#1d4ed8', marginBottom: 6 },
  metaRow:     { flexDirection: 'row', marginBottom: 2 },
  metaKey:     { fontSize: 8, color: '#6b7280', width: 52 },
  metaVal:     { fontSize: 8, color: '#111827', fontFamily: 'Cairo', fontWeight: 700 },
  typeBadge:   { fontSize: 7, fontFamily: 'Cairo', fontWeight: 700, marginTop: 6,
                 paddingHorizontal: 7, paddingVertical: 3, borderRadius: 3, alignSelf: 'flex-end' },
  cashBadge:   { backgroundColor: '#fff7ed', color: '#c2410c' },
  creditBadge: { backgroundColor: '#f5f3ff', color: '#6d28d9' },

  divider:     { borderBottomWidth: 0.5, borderBottomColor: '#d1d5db', marginVertical: 12 },

  // ── Customer + Order reference row ──────────────────────────────────────────
  billRow:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  billBox:     { flexDirection: 'column' },
  sectionLbl:  { fontSize: 7, fontFamily: 'Cairo', fontWeight: 700, textTransform: 'uppercase',
                 letterSpacing: 0.8, color: '#6b7280', marginBottom: 4 },
  billName:    { fontSize: 10, fontFamily: 'Cairo', fontWeight: 700, color: '#111827' },
  billMeta:    { fontSize: 8, color: '#6b7280', marginTop: 2 },

  // ── Line items table ─────────────────────────────────────────────────────────
  section:     { marginBottom: 14 },
  tableRow:    { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6,
                 borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb' },
  tableHead:   { backgroundColor: '#f9fafb' },
  c_num:       { width: '5%',  fontSize: 8, color: '#6b7280' },
  c_desc:      { width: '50%', fontSize: 8 },
  c_qty:       { width: '10%', fontSize: 8, textAlign: 'right' },
  c_price:     { width: '17%', fontSize: 8, textAlign: 'right' },
  c_total:     { width: '18%', fontSize: 8, textAlign: 'right', fontFamily: 'Cairo', fontWeight: 700 },

  // ── Totals ───────────────────────────────────────────────────────────────────
  totRow:      { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 2 },
  totLbl:      { width: 110, fontSize: 9, color: '#6b7280', textAlign: 'right', paddingRight: 8 },
  totVal:      { width: 110, fontSize: 9, textAlign: 'right' },
  paidLbl:     { width: 110, fontSize: 9, color: '#16a34a', textAlign: 'right', paddingRight: 8 },
  paidVal:     { width: 110, fontSize: 9, color: '#16a34a', textAlign: 'right' },
  outRow:      { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6,
                 borderTopWidth: 0.5, borderTopColor: '#d1d5db', paddingTop: 4 },
  outLbl:      { width: 110, fontSize: 11, fontFamily: 'Cairo', fontWeight: 700,
                 textAlign: 'right', paddingRight: 8 },
  outVal:      { width: 110, fontSize: 11, fontFamily: 'Cairo', fontWeight: 700, textAlign: 'right' },

  // ── Footer ───────────────────────────────────────────────────────────────────
  footer:      { position: 'absolute', bottom: 24, left: 36, right: 36,
                 flexDirection: 'row', justifyContent: 'space-between',
                 borderTopWidth: 0.5, borderTopColor: '#e5e7eb', paddingTop: 6 },
  footerTxt:   { fontSize: 7, color: '#9ca3af' },
})

interface Props {
  invoice:     ArInvoice
  amountPaid:  number
  outstanding: number
}

export function InvoiceDocument({ invoice, amountPaid, outstanding }: Props) {
  const lines = invoice.invoice_line_items ?? []

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Header: company left | invoice title right ── */}
        <View style={s.headerRow}>

          {/* Left — company */}
          <View style={s.companyCol}>
            <Image style={s.logo} src="/logo.png" />
            <Text style={s.companyName}>Al Faytri Group</Text>
            <Text style={s.companyMeta}>Doha, Qatar</Text>
            <Text style={s.companyMeta}>Tel: +974 4444 5555</Text>
            <Text style={s.companyMeta}>info@alfaytri.com</Text>
          </View>

          {/* Right — invoice details */}
          <View style={s.invoiceCol}>
            <Text style={s.docTitle}>INVOICE</Text>
            <View style={s.metaRow}>
              <Text style={s.metaKey}>Invoice #</Text>
              <Text style={s.metaVal}>{invoice.invoice_id}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={s.metaKey}>Issued</Text>
              <Text style={s.metaVal}>{formatDate(invoice.issued_date)}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={s.metaKey}>Due</Text>
              <Text style={s.metaVal}>{formatDate(invoice.due_date)}</Text>
            </View>
            <Text style={[s.typeBadge, invoice.invoice_type === 'cash' ? s.cashBadge : s.creditBadge]}>
              {invoice.invoice_type === 'cash' ? 'Cash Invoice' : 'Credit Invoice'}
            </Text>
          </View>
        </View>

        <View style={s.divider} />

        {/* ── Customer + Order reference ── */}
        <View style={s.billRow}>
          <View style={s.billBox}>
            <Text style={s.sectionLbl}>Bill To</Text>
            <Text style={s.billName}>{invoice.customer_name ?? '—'}</Text>
          </View>
          {invoice.so_number && (
            <View style={[s.billBox, { alignItems: 'flex-end' }]}>
              <Text style={s.sectionLbl}>Order Reference</Text>
              <Text style={s.billName}>{invoice.so_number}</Text>
              <Text style={s.billMeta}>Sale Order</Text>
            </View>
          )}
        </View>

        <View style={s.divider} />

        {/* ── Line items ── */}
        <View style={s.section}>
          <View style={[s.tableRow, s.tableHead]}>
            <Text style={s.c_num}>#</Text>
            <Text style={s.c_desc}>Description</Text>
            <Text style={s.c_qty}>Qty</Text>
            <Text style={s.c_price}>Unit Price</Text>
            <Text style={s.c_total}>Total</Text>
          </View>
          {lines.map((li, idx) => (
            <View key={li.id} style={s.tableRow}>
              <Text style={s.c_num}>{idx + 1}</Text>
              <Text style={s.c_desc}>{li.description}</Text>
              <Text style={s.c_qty}>{li.qty ?? '—'}</Text>
              <Text style={s.c_price}>{fmt(li.unit_price)}</Text>
              <Text style={s.c_total}>{fmt(li.total)}</Text>
            </View>
          ))}
        </View>

        <View style={s.divider} />

        {/* ── Totals ── */}
        {(invoice.subtotal ?? 0) !== (invoice.total_amount ?? 0) && (
          <View style={s.totRow}>
            <Text style={s.totLbl}>Subtotal</Text>
            <Text style={s.totVal}>{fmt(invoice.subtotal)}</Text>
          </View>
        )}
        <View style={s.totRow}>
          <Text style={s.totLbl}>Total</Text>
          <Text style={s.totVal}>{fmt(invoice.total_amount)}</Text>
        </View>
        {amountPaid > 0 && (
          <View style={s.totRow}>
            <Text style={s.paidLbl}>Paid</Text>
            <Text style={s.paidVal}>{fmt(amountPaid)}</Text>
          </View>
        )}
        <View style={s.outRow}>
          <Text style={s.outLbl}>Outstanding</Text>
          <Text style={[s.outVal, { color: outstanding > 0 ? '#d97706' : '#16a34a' }]}>
            {fmt(outstanding)}
          </Text>
        </View>

        {/* ── Footer ── */}
        <View style={s.footer} fixed>
          <Text style={s.footerTxt}>Al Faytri Group — Doha, Qatar</Text>
          <Text style={s.footerTxt}>{invoice.invoice_id} · {formatDate(invoice.issued_date)}</Text>
        </View>

      </Page>
    </Document>
  )
}
