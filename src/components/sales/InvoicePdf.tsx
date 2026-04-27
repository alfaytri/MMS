'use client'

import {
  Document, Page, Text, View, StyleSheet, Font,
} from '@react-pdf/renderer'
import type { ArInvoice } from '@/types/invoice'

export type PdfCompanyInfo = {
  name:       string
  address:    string | null
  vat_id:     string | null
  cr_number:  string | null
}

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

  invoiceCol:   { width: '50%', alignItems: 'flex-end' },
  docTitle:     { fontSize: 26, fontFamily: 'Cairo', fontWeight: 700, color: '#1d4ed8', marginBottom: 8 },
  metaRow:      { flexDirection: 'row', marginBottom: 3 },
  metaKey:      { width: 56, fontSize: 8, color: '#6b7280' },
  metaVal:      { fontSize: 8, fontFamily: 'Cairo', fontWeight: 700, color: '#111827' },
  typeBadge:    { marginTop: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 3,
                  fontSize: 7, fontFamily: 'Cairo', fontWeight: 700 },
  cashBadge:    { backgroundColor: '#fff7ed', color: '#c2410c' },
  creditBadge:  { backgroundColor: '#f5f3ff', color: '#6d28d9' },

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

  // ── Line items ───────────────────────────────────────────────────────────────
  tableRow:     { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 6,
                  borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb' },
  tableHead:    { backgroundColor: '#f3f4f6' },
  c_num:        { width: '5%',  fontSize: 8, color: '#6b7280' },
  c_desc:       { width: '50%', fontSize: 8 },
  c_qty:        { width: '10%', fontSize: 8, textAlign: 'right' },
  c_price:      { width: '18%', fontSize: 8, textAlign: 'right' },
  c_total:      { width: '17%', fontSize: 8, textAlign: 'right', fontFamily: 'Cairo', fontWeight: 700 },

  // ── Totals ───────────────────────────────────────────────────────────────────
  totRow:       { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 3 },
  totLbl:       { width: 100, fontSize: 9, color: '#6b7280', textAlign: 'right', paddingRight: 10 },
  totVal:       { width: 110, fontSize: 9, textAlign: 'right' },
  paidLbl:      { width: 100, fontSize: 9, color: '#16a34a', textAlign: 'right', paddingRight: 10 },
  paidVal:      { width: 110, fontSize: 9, color: '#16a34a', textAlign: 'right' },
  outRow:       { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 5,
                  marginTop: 4, borderTopWidth: 0.5, borderTopColor: '#d1d5db' },
  outLbl:       { width: 100, fontSize: 11, fontFamily: 'Cairo', fontWeight: 700,
                  textAlign: 'right', paddingRight: 10 },
  outVal:       { width: 110, fontSize: 11, fontFamily: 'Cairo', fontWeight: 700, textAlign: 'right' },

  // ── Footer ───────────────────────────────────────────────────────────────────
  footer:       { position: 'absolute', bottom: 24, left: 40, right: 40,
                  flexDirection: 'row', justifyContent: 'space-between',
                  borderTopWidth: 0.5, borderTopColor: '#e5e7eb', paddingTop: 6 },
  footerTxt:    { fontSize: 7, color: '#9ca3af' },
})

interface Props {
  invoice:     ArInvoice
  amountPaid:  number
  outstanding: number
  company?:    PdfCompanyInfo
}

export function InvoiceDocument({ invoice, amountPaid, outstanding, company }: Props) {
  const companyName    = company?.name      ?? 'Al Faytri Group'
  const companyAddress = company?.address   ?? 'Doha, Qatar'
  const companyVat     = company?.vat_id    ?? null
  const companyCr      = company?.cr_number ?? null
  const lines = invoice.invoice_line_items ?? []

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Header ── */}
        <View style={s.headerRow}>

          {/* Left — company */}
          <View style={s.companyCol}>
            <Text style={s.companyBrand}>{companyName}</Text>
            {companyAddress && <Text style={s.companyLine}>{companyAddress}</Text>}
            {companyCr      && <Text style={s.companyLine}>CR: {companyCr}</Text>}
            {companyVat     && <Text style={s.companyLine}>VAT: {companyVat}</Text>}
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
              <Text style={s.metaVal}>{fmtDate(invoice.issued_date)}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={s.metaKey}>Due</Text>
              <Text style={s.metaVal}>{fmtDate(invoice.due_date)}</Text>
            </View>
            <Text style={[s.typeBadge, invoice.invoice_type === 'cash' ? s.cashBadge : s.creditBadge]}>
              {invoice.invoice_type === 'cash' ? 'Cash Invoice' : 'Credit Invoice'}
            </Text>
          </View>
        </View>

        <View style={s.divider} />

        {/* ── Bill To / Order Reference ── */}
        <View style={s.billRow}>
          <View style={s.billLeft}>
            <Text style={s.sectionLbl}>Bill To</Text>
            <Text style={s.billName}>{invoice.customer_name ?? '—'}</Text>
          </View>
          {invoice.so_number && (
            <View style={s.billRight}>
              <Text style={s.sectionLbl}>Order Reference</Text>
              <Text style={s.billName}>{invoice.so_number}</Text>
              <Text style={s.billSub}>Sale Order</Text>
            </View>
          )}
        </View>

        <View style={s.divider} />

        {/* ── Line items ── */}
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
          <Text style={s.footerTxt}>{invoice.invoice_id} · {fmtDate(invoice.issued_date)}</Text>
        </View>

      </Page>
    </Document>
  )
}
