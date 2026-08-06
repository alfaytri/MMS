/**
 * Generates the Credit Note / Debit Note PDF for one note row, uploads it to
 * the `credit-note-pdfs` Storage bucket, persists `credit_notes.pdf_url` via
 * the service-role RPC (which bypasses the cache-invalidation trigger), and
 * returns the URL.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildCreditDebitNoteHtml,
  type NoteReturnedLine,
} from '@/lib/sales/credit-debit-note-pdf-html'
import { loadPdfFonts } from '@/lib/pdf/pdf-fonts'
import { resolveBrand, brandDataToAssets } from '@/lib/pdf/brand-resolver'
import { htmlToPdfBuffer } from '@/lib/pdf/html-to-pdf'
import { fetchArabicNamesByEnglishName } from '@/lib/pdf/arabic-names'

function storageKeyFor(noteDisplayId: string): string {
  return `${noteDisplayId.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`
}

interface CreditNoteLineRow {
  description:      string | null
  sku:              string | null
  qty:              number
  unit_price:       number
  total:            number
  line_type:        string
  condition:        string | null
  condition_notes:  string | null
}

interface CreditNoteRow {
  id:               string
  credit_note_id:   string
  invoice_id:       string | null
  customer_id:      string | null
  customer_name:    string | null
  reason:           string
  created_at:       string
  original_total:   number | null
  new_total:        number | null
  credit_note_lines: CreditNoteLineRow[]
  source_return_id: string | null
  pdf_url:          string | null
  customers:        { customer_phones: { phone: string; is_primary: boolean }[] | null } | null
}

interface DebitNoteRow {
  id:               string
  debit_note_id:    string
  bill_id:          string | null
  supplier_id:      string | null
  supplier_name:    string | null
  reason:           string
  created_at:       string
  original_total:   number | null
  new_total:        number | null
  debit_note_lines: CreditNoteLineRow[]
  source_return_id: string | null
  pdf_url:          string | null
  suppliers:        { phone: string | null } | null
}

export interface GenerateCreditDebitNotePdfResult {
  url:         string
  storageKey:  string
  noteId:      string
  bytes:       number
  regenerated: boolean
}

export async function generateCreditDebitNotePdf(
  noteUuid:  string,
  supabase:  SupabaseClient,
  opts?:     { force?: boolean; divisionId?: string; noteType?: 'credit' | 'debit' },
): Promise<GenerateCreditDebitNotePdfResult> {

  const isDebit = opts?.noteType === 'debit'

  // ── 1. Fetch note row ────────────────────────────────────────────────
  let noteDisplayId: string
  let invoiceOrBillId: string | null
  let customerName: string | null = null
  let supplierName: string | null = null
  let phone: string | null = null
  let reason: string
  let createdAt: string
  let originalTotal: number | null
  let newTotal: number | null
  let sourceReturnId: string | null
  let pdfUrl: string | null
  let allLines: CreditNoteLineRow[] = []
  let noteId: string

  if (isDebit) {
    const { data: note, error: fetchErr } = await supabase
      .from('debit_notes')
      .select(`
        id, debit_note_id, bill_id, supplier_id,
        supplier_name, reason, created_at,
        original_total, new_total, debit_note_lines(*), source_return_id, pdf_url,
        suppliers(phone)
      `)
      .eq('id', noteUuid)
      .single<DebitNoteRow>()

    if (fetchErr || !note) {
      throw new Error(`Debit Note not found: ${noteUuid} (${fetchErr?.message ?? 'no row'})`)
    }

    noteId = note.id
    noteDisplayId = note.debit_note_id
    invoiceOrBillId = note.bill_id
    supplierName = note.supplier_name
    phone = note.suppliers?.phone ?? null
    reason = note.reason
    createdAt = note.created_at
    originalTotal = note.original_total
    newTotal = note.new_total
    sourceReturnId = note.source_return_id
    pdfUrl = note.pdf_url
    allLines = note.debit_note_lines ?? []
  } else {
    const { data: note, error: fetchErr } = await supabase
      .from('credit_notes')
      .select(`
        id, credit_note_id, invoice_id, customer_id,
        customer_name, reason, created_at,
        original_total, new_total, credit_note_lines(*), source_return_id, pdf_url,
        customers(customer_phones(phone, is_primary))
      `)
      .eq('id', noteUuid)
      .single<CreditNoteRow>()

    if (fetchErr || !note) {
      throw new Error(`Credit Note not found: ${noteUuid} (${fetchErr?.message ?? 'no row'})`)
    }

    noteId = note.id
    noteDisplayId = note.credit_note_id
    invoiceOrBillId = note.invoice_id
    customerName = note.customer_name
    // Derive phone from the customer's phone list — primary first, else the first entry.
    {
      const phones = note.customers?.customer_phones ?? []
      const primary = phones.find((p) => p.is_primary)
      phone = primary?.phone ?? phones[0]?.phone ?? null
    }
    reason = note.reason
    createdAt = note.created_at
    originalTotal = note.original_total
    newTotal = note.new_total
    sourceReturnId = note.source_return_id
    pdfUrl = note.pdf_url
    allLines = note.credit_note_lines ?? []
  }

  if (!opts?.force && pdfUrl) {
    return {
      url:         pdfUrl,
      storageKey:  storageKeyFor(noteDisplayId),
      noteId:      noteDisplayId,
      bytes:       0,
      regenerated: false,
    }
  }

  // ── 2. Resolve reference & return numbers ────────────────────────────
  let referenceNumber = '—'
  let noteCurrency = 'QAR'
  let returnNumber    = '—'
  let partyPhone      = phone
  let divisionId: string | null = null

  if (sourceReturnId) {
    const { data: ret } = await supabase
      .from('so_po_returns')
      .select('return_number, source_type, source_id')
      .eq('id', sourceReturnId)
      .maybeSingle<{ return_number: string; source_type: string; source_id: string }>()
    if (ret) {
      returnNumber = ret.return_number
      if (isDebit && ret.source_type === 'purchase' && ret.source_id) {
        const { data: po } = await supabase
          .from('purchase_orders')
          .select('po_number, supplier_id, division_id, currency')
          .eq('id', ret.source_id)
          .maybeSingle<{ po_number: string; supplier_id: string | null; division_id: string | null; currency: string | null }>()
        if (po?.po_number) referenceNumber = po.po_number
        if (po?.division_id) divisionId = po.division_id
        if (po?.currency) noteCurrency = po.currency
        if (!partyPhone && po?.supplier_id) {
          const { data: sup } = await supabase
            .from('suppliers')
            .select('phone')
            .eq('id', po.supplier_id)
            .maybeSingle<{ phone: string | null }>()
          if (sup?.phone) partyPhone = sup.phone
        }
      }
    }
  }

  if (!isDebit && invoiceOrBillId) {
    const { data: inv } = await supabase
      .from('so_invoices')
      .select('invoice_id, customers(customer_phones(phone, is_primary)), sale_orders(division_id, currency)')
      .eq('id', invoiceOrBillId)
      .maybeSingle<{
        invoice_id: string
        customers: { customer_phones: { phone: string; is_primary: boolean }[] } | null
        sale_orders: { division_id: string | null; currency: string | null } | null
      }>()
    if (inv?.invoice_id) referenceNumber = inv.invoice_id
    if (inv?.sale_orders?.division_id) divisionId = inv.sale_orders.division_id
    if (inv?.sale_orders?.currency) noteCurrency = inv.sale_orders.currency
    if (!partyPhone) {
      const phones = inv?.customers?.customer_phones ?? []
      const primary = phones.find((p) => p.is_primary) ?? phones[0]
      if (primary?.phone) partyPhone = primary.phone
    }
  }

  // ── 3. Branding ──────────────────────────────────────────────────────
  const [brand, fonts] = await Promise.all([
    resolveBrand(opts?.divisionId ?? divisionId, supabase),
    loadPdfFonts(),
  ])
  const { assets } = brandDataToAssets(brand)

  const partyName = isDebit
    ? (supplierName ?? '—')
    : (customerName ?? '—')

  const returnedRawLines = allLines.filter((l) => l.line_type === 'returned')
  const arMap = await fetchArabicNamesByEnglishName(
    supabase,
    returnedRawLines.map((l) => l.description),
  )
  const returnedLines: NoteReturnedLine[] = returnedRawLines.map((l) => ({
    item_name:       l.description ?? 'Item',
    item_name_ar:    (l.description ? arMap.get(l.description) ?? '' : ''),
    sku:             l.sku ?? '',
    qty:             l.qty,
    unit_price:      l.unit_price,
    total:           l.total ?? l.qty * l.unit_price,
    condition:       (l.condition as NoteReturnedLine['condition']) ?? undefined,
    condition_notes: l.condition_notes ?? undefined,
  }))
  const creditDebitTotal = returnedLines.reduce((acc, l) => acc + l.total, 0)

  // ── 4. Build & render ────────────────────────────────────────────────
  const html = buildCreditDebitNoteHtml({
    noteId:          noteDisplayId,
    noteType:        isDebit ? 'debit' : 'credit',
    partyName,
    partyPhone,
    referenceNumber,
    returnNumber,
    reason,
    createdAt,
    returnedLines,
    originalTotal:   Number(originalTotal ?? 0),
    creditDebitTotal,
    newTotal:        Number(newTotal ?? 0),
    currency:        noteCurrency,
    assets,
    fonts,
  })

  const buffer = await htmlToPdfBuffer(html)

  // ── 5. Upload ────────────────────────────────────────────────────────
  const bucketName = isDebit ? 'debit-note-pdfs' : 'credit-note-pdfs'
  const storageKey = storageKeyFor(noteDisplayId)
  const { error: uploadErr } = await supabase.storage
    .from(bucketName)
    .upload(storageKey, buffer, {
      contentType:  'application/pdf',
      upsert:       true,
      cacheControl: '0',
    })
  if (uploadErr) {
    // Fallback to credit-note-pdfs bucket if debit bucket doesn't exist yet
    if (isDebit) {
      const { error: fallbackErr } = await supabase.storage
        .from('credit-note-pdfs')
        .upload(storageKey, buffer, {
          contentType:  'application/pdf',
          upsert:       true,
          cacheControl: '0',
        })
      if (fallbackErr) {
        throw new Error(`Storage upload failed for ${storageKey}: ${fallbackErr.message}`)
      }
    } else {
      throw new Error(`Storage upload failed for ${storageKey}: ${uploadErr.message}`)
    }
  }

  const { data: urlData } = supabase.storage
    .from(uploadErr && isDebit ? 'credit-note-pdfs' : bucketName)
    .getPublicUrl(storageKey)
  const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`

  // ── 6. Persist URL ───────────────────────────────────────────────────
  if (isDebit) {
    await supabase
      .from('debit_notes')
      .update({ pdf_url: publicUrl })
      .eq('id', noteId)
  } else {
    const { error: rpcErr } = await supabase.rpc('set_credit_note_pdf_url', {
      p_id:  noteId,
      p_url: publicUrl,
    })
    if (rpcErr) {
      console.warn(`[cn-pdf] uploaded but failed to persist URL on ${noteDisplayId}: ${rpcErr.message}`)
    }
  }

  return {
    url:         publicUrl,
    storageKey,
    noteId:      noteDisplayId,
    bytes:       buffer.length,
    regenerated: true,
  }
}
