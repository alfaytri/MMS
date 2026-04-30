import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'
import type { NotePdfData, NoteLineItem, NoteDebitLineItem } from '@/hooks/useCreditNotes'
import type { PdfCompanyInfo } from './InvoicePdf'

Font.register({
  family: 'Cairo',
  fonts: [
    { src: '/fonts/Cairo-Regular.ttf', fontWeight: 400 },
    { src: '/fonts/Cairo-Regular.ttf', fontWeight: 700 },
  ],
})

function fmt(amount: number) {
  return `QAR ${amount.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const s = StyleSheet.create({
  page:        { fontFamily: 'Cairo', fontSize: 9, padding: 40, color: '#111827' },
  headerRow:   { flexDirection: 'row', marginBottom: 24 },
  companyCol:  { width: '50%' },
  companyBrand:{ fontSize: 16, fontFamily: 'Cairo', fontWeight: 700, color: '#1d4ed8', marginBottom: 6 },
  companyLine: { fontSize: 8, color: '#6b7280', marginBottom: 3 },
  noteCol:     { width: '50%', alignItems: 'flex-end' },
  docTitle:    { fontSize: 22, fontFamily: 'Cairo', fontWeight: 700, color: '#1d4ed8', marginBottom: 8 },
  metaRow:     { flexDirection: 'row', marginBottom: 3 },
  metaKey:     { width: 70, fontSize: 8, color: '#6b7280' },
  metaVal:     { fontSize: 8, fontFamily: 'Cairo', fontWeight: 700 },
  divider:     { borderBottomWidth: 0.5, borderBottomColor: '#d1d5db', marginVertical: 14 },
  billRow:     { flexDirection: 'row', marginBottom: 18 },
  billLeft:    { width: '50%' },
  billRight:   { width: '50%', alignItems: 'flex-end' },
  sectionLbl:  { fontSize: 7, fontFamily: 'Cairo', fontWeight: 700, color: '#6b7280',
                 textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 },
  billName:    { fontSize: 11, fontFamily: 'Cairo', fontWeight: 700, marginBottom: 2 },
  billSub:     { fontSize: 8, color: '#6b7280' },
  tableHead:   { flexDirection: 'row', backgroundColor: '#f3f4f6', paddingVertical: 5,
                 paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb' },
  tableRow:    { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 6,
                 borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb' },
  c_item:      { width: '35%', fontSize: 8 },
  c_sku:       { width: '15%', fontSize: 8, color: '#6b7280' },
  c_qty:       { width: '10%', fontSize: 8, textAlign: 'right' },
  c_cond:      { width: '15%', fontSize: 8, color: '#6b7280' },
  c_price:     { width: '12%', fontSize: 8, textAlign: 'right' },
  c_total:     { width: '13%', fontSize: 8, textAlign: 'right', fontFamily: 'Cairo', fontWeight: 700 },
  sectionTitle:{ fontSize: 9, fontFamily: 'Cairo', fontWeight: 700, color: '#374151',
                 marginBottom: 4, marginTop: 8 },
  totRow:      { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 3 },
  totLbl:      { width: 110, fontSize: 9, color: '#6b7280', textAlign: 'right', paddingRight: 10 },
  totVal:      { width: 110, fontSize: 9, textAlign: 'right' },
  newTotLbl:   { width: 110, fontSize: 11, fontFamily: 'Cairo', fontWeight: 700,
                 textAlign: 'right', paddingRight: 10 },
  newTotVal:   { width: 110, fontSize: 11, fontFamily: 'Cairo', fontWeight: 700, textAlign: 'right' },
  newTotRow:   { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 5,
                 marginTop: 4, borderTopWidth: 0.5, borderTopColor: '#d1d5db' },
  footer:      { position: 'absolute', bottom: 24, left: 40, right: 40,
                 flexDirection: 'row', justifyContent: 'space-between',
                 borderTopWidth: 0.5, borderTopColor: '#e5e7eb', paddingTop: 6 },
  footerTxt:   { fontSize: 7, color: '#9ca3af' },
})

export interface CreditDebitNotePdfProps {
  noteId: string
  noteType: 'credit' | 'debit'
  partyName: string
  referenceNumber: string
  returnNumber: string
  reason: string
  createdAt: string
  pdfData: NotePdfData
  originalTotal: number
  newTotal: number
  company?: PdfCompanyInfo
}

export function CreditDebitNoteDocument({
  noteId, noteType, partyName, referenceNumber, returnNumber,
  reason, createdAt, pdfData, originalTotal, newTotal, company,
}: CreditDebitNotePdfProps) {
  const companyName    = company?.name      ?? 'Al Faytri Group'
  const companyAddress = company?.address   ?? 'Doha, Qatar'
  const companyVat     = company?.vat_id    ?? null
  const companyCr      = company?.cr_number ?? null
  const docTitle       = noteType === 'credit' ? 'CREDIT NOTE' : 'DEBIT NOTE'
  const partyLabel     = noteType === 'credit' ? 'Customer' : 'Supplier'
  const refLabel       = noteType === 'credit' ? 'Invoice #' : 'PO #'
  const deductedTotal  = pdfData.returned_lines.reduce((acc, l) => acc + l.total, 0)

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Header */}
        <View style={s.headerRow}>
          <View style={s.companyCol}>
            <Text style={s.companyBrand}>{companyName}</Text>
            {companyAddress && <Text style={s.companyLine}>{companyAddress}</Text>}
            {companyCr      && <Text style={s.companyLine}>CR: {companyCr}</Text>}
            {companyVat     && <Text style={s.companyLine}>VAT: {companyVat}</Text>}
          </View>
          <View style={s.noteCol}>
            <Text style={s.docTitle}>{docTitle}</Text>
            <View style={s.metaRow}>
              <Text style={s.metaKey}>{noteType === 'credit' ? 'CN #' : 'DN #'}</Text>
              <Text style={s.metaVal}>{noteId}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={s.metaKey}>Date</Text>
              <Text style={s.metaVal}>{fmtDate(createdAt)}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={s.metaKey}>Return #</Text>
              <Text style={s.metaVal}>{returnNumber}</Text>
            </View>
          </View>
        </View>

        <View style={s.divider} />

        {/* Party / Reference */}
        <View style={s.billRow}>
          <View style={s.billLeft}>
            <Text style={s.sectionLbl}>{partyLabel}</Text>
            <Text style={s.billName}>{partyName}</Text>
          </View>
          <View style={s.billRight}>
            <Text style={s.sectionLbl}>{refLabel}</Text>
            <Text style={s.billName}>{referenceNumber}</Text>
            <Text style={s.billSub}>Reason: {reason}</Text>
          </View>
        </View>

        <View style={s.divider} />

        {/* Original Items */}
        <Text style={s.sectionTitle}>Original Items</Text>
        <View style={s.tableHead}>
          <Text style={s.c_item}>Item</Text>
          <Text style={s.c_sku}>SKU</Text>
          <Text style={s.c_qty}>Qty</Text>
          <Text style={s.c_price}>Unit Price</Text>
          <Text style={s.c_total}>Total</Text>
        </View>
        {pdfData.original_lines.map((line: NoteLineItem, idx: number) => (
          <View key={idx} style={s.tableRow}>
            <Text style={s.c_item}>{line.item_name}</Text>
            <Text style={s.c_sku}>{line.sku ?? '—'}</Text>
            <Text style={s.c_qty}>{line.qty}</Text>
            <Text style={s.c_price}>{fmt(line.unit_price)}</Text>
            <Text style={s.c_total}>{fmt(line.total)}</Text>
          </View>
        ))}

        <View style={s.divider} />

        {/* Returned Items */}
        <Text style={s.sectionTitle}>Returned Items</Text>
        <View style={s.tableHead}>
          <Text style={s.c_item}>Item</Text>
          <Text style={s.c_sku}>SKU</Text>
          <Text style={s.c_qty}>Qty</Text>
          {noteType === 'debit' && <Text style={s.c_cond}>Condition</Text>}
          <Text style={s.c_price}>Unit Price</Text>
          <Text style={s.c_total}>Value</Text>
        </View>
        {pdfData.returned_lines.map((line: NoteDebitLineItem, idx: number) => (
          <View key={idx} style={s.tableRow}>
            <Text style={s.c_item}>{line.item_name}</Text>
            <Text style={s.c_sku}>{line.sku ?? '—'}</Text>
            <Text style={s.c_qty}>{line.qty}</Text>
            {noteType === 'debit' && (
              <Text style={s.c_cond}>
                {line.condition === 'other' ? (line.condition_notes ?? 'Other') : (line.condition ?? '—')}
              </Text>
            )}
            <Text style={s.c_price}>{fmt(line.unit_price)}</Text>
            <Text style={s.c_total}>{fmt(line.total)}</Text>
          </View>
        ))}

        <View style={s.divider} />

        {/* Summary Totals */}
        <View style={s.totRow}>
          <Text style={s.totLbl}>Original Total</Text>
          <Text style={s.totVal}>{fmt(originalTotal)}</Text>
        </View>
        <View style={s.totRow}>
          <Text style={s.totLbl}>{noteType === 'credit' ? 'Credit Amount' : 'Debit Amount'}</Text>
          <Text style={s.totVal}>- {fmt(deductedTotal)}</Text>
        </View>
        <View style={s.newTotRow}>
          <Text style={s.newTotLbl}>New Total</Text>
          <Text style={s.newTotVal}>{fmt(newTotal)}</Text>
        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerTxt}>{companyName} — {docTitle} {noteId}</Text>
          <Text
            style={s.footerTxt}
            render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>

      </Page>
    </Document>
  )
}
