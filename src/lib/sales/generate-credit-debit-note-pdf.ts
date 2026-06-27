/**
 * Generates the Credit Note / Debit Note PDF for one note row, uploads it to
 * the `credit-note-pdfs` Storage bucket, persists `credit_notes.pdf_url` via
 * the service-role RPC (which bypasses the cache-invalidation trigger), and
 * returns the URL.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildCreditDebitNoteHtml,
  type NoteAssets,
  type NoteFonts,
  type NoteOriginalLine,
  type NoteReturnedLine,
} from '@/lib/sales/credit-debit-note-pdf-html'
import { htmlToPdfBuffer } from '@/lib/pdf/html-to-pdf'

const BRAND_DIR = path.join(process.cwd(), 'public', 'brand')
const FONT_DIR  = path.join(BRAND_DIR, 'Font')

async function readAsBase64(p: string): Promise<string> {
  const buf = await fs.readFile(p)
  return buf.toString('base64')
}

let cachedAssets: NoteAssets | null = null
async function loadAssets(): Promise<NoteAssets> {
  if (cachedAssets) return cachedAssets
  const b64 = await readAsBase64(path.join(BRAND_DIR, 'Company logo.png'))
  cachedAssets = { logo: `data:image/png;base64,${b64}` }
  return cachedAssets
}

let cachedFonts: NoteFonts | null = null
async function loadFonts(): Promise<NoteFonts> {
  if (cachedFonts) return cachedFonts
  const [block, rounded] = await Promise.all([
    readAsBase64(path.join(FONT_DIR, 'Infield/Infield-Block.ttf')),
    readAsBase64(path.join(FONT_DIR, 'Infield/Infield-Rounded.ttf')),
  ])
  cachedFonts = {
    infieldBlock:   `data:font/ttf;base64,${block}`,
    infieldRounded: `data:font/ttf;base64,${rounded}`,
  }
  return cachedFonts
}

function storageKeyFor(noteDisplayId: string): string {
  return `${noteDisplayId.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`
}

interface CreditNoteRow {
  id:               string
  credit_note_id:   string
  note_type:        'credit' | 'debit'
  invoice_id:       string | null
  customer_name:    string | null
  supplier_name:    string | null
  reason:           string
  created_at:       string
  original_total:   number | null
  new_total:        number | null
  line_items:       { original_lines?: NoteOriginalLine[]; returned_lines?: NoteReturnedLine[] } | null
  source_return_id: string | null
  pdf_url:          string | null
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
  opts?:     { force?: boolean },
): Promise<GenerateCreditDebitNotePdfResult> {

  // ── 1. Fetch note row ────────────────────────────────────────────────
  const { data: note, error: fetchErr } = await supabase
    .from('credit_notes')
    .select(`
      id, credit_note_id, note_type, invoice_id,
      customer_name, supplier_name, reason, created_at,
      original_total, new_total, line_items, source_return_id, pdf_url
    `)
    .eq('id', noteUuid)
    .single<CreditNoteRow>()

  if (fetchErr || !note) {
    throw new Error(`Credit/Debit Note not found: ${noteUuid} (${fetchErr?.message ?? 'no row'})`)
  }

  if (!opts?.force && note.pdf_url) {
    return {
      url:         note.pdf_url,
      storageKey:  storageKeyFor(note.credit_note_id),
      noteId:      note.credit_note_id,
      bytes:       0,
      regenerated: false,
    }
  }

  // ── 2. Resolve reference & return numbers ────────────────────────────
  let referenceNumber = '—'
  let returnNumber    = '—'

  // Return number: join the linked returns row
  if (note.source_return_id) {
    const { data: ret } = await supabase
      .from('returns')
      .select('return_number, source_type, source_id')
      .eq('id', note.source_return_id)
      .maybeSingle<{ return_number: string; source_type: string; source_id: string }>()
    if (ret) {
      returnNumber = ret.return_number
      // For debit notes, the reference is the PO number — look it up via the
      // return's source.
      if (note.note_type === 'debit' && ret.source_type === 'purchase' && ret.source_id) {
        const { data: po } = await supabase
          .from('purchase_orders')
          .select('po_number')
          .eq('id', ret.source_id)
          .maybeSingle<{ po_number: string }>()
        if (po?.po_number) referenceNumber = po.po_number
      }
    }
  }

  // For credit notes, reference is the invoice display string
  if (note.note_type === 'credit' && note.invoice_id) {
    const { data: inv } = await supabase
      .from('invoices')
      .select('invoice_id')
      .eq('id', note.invoice_id)
      .maybeSingle<{ invoice_id: string }>()
    if (inv?.invoice_id) referenceNumber = inv.invoice_id
  }

  // ── 3. Branding ──────────────────────────────────────────────────────
  const { data: companies } = await supabase
    .from('companies')
    .select('name_en, address_en, vat_id, cr_number, is_active')
    .order('is_active', { ascending: false })
    .limit(1)
  const c = companies?.[0]
  const company = c
    ? { name: c.name_en, address: c.address_en, vat_id: c.vat_id, cr_number: c.cr_number }
    : null

  // ── 4. Build & render ────────────────────────────────────────────────
  const [assets, fonts] = await Promise.all([loadAssets(), loadFonts()])

  const partyName = note.note_type === 'credit'
    ? (note.customer_name ?? '—')
    : (note.supplier_name ?? '—')

  const pdfData = note.line_items ?? { original_lines: [], returned_lines: [] }

  const html = buildCreditDebitNoteHtml({
    noteId:          note.credit_note_id,
    noteType:        note.note_type,
    partyName,
    referenceNumber,
    returnNumber,
    reason:          note.reason,
    createdAt:       note.created_at,
    originalLines:   pdfData.original_lines ?? [],
    returnedLines:   pdfData.returned_lines ?? [],
    originalTotal:   Number(note.original_total ?? 0),
    newTotal:        Number(note.new_total ?? 0),
    company,
    assets,
    fonts,
  })

  const buffer = await htmlToPdfBuffer(html)

  // ── 5. Upload ────────────────────────────────────────────────────────
  const storageKey = storageKeyFor(note.credit_note_id)
  const { error: uploadErr } = await supabase.storage
    .from('credit-note-pdfs')
    .upload(storageKey, buffer, {
      contentType:  'application/pdf',
      upsert:       true,
      cacheControl: '0',
    })
  if (uploadErr) {
    throw new Error(`Storage upload failed for ${storageKey}: ${uploadErr.message}`)
  }

  const { data: urlData } = supabase.storage
    .from('credit-note-pdfs')
    .getPublicUrl(storageKey)
  // Cache-buster — see note in generate-invoice-pdf.ts.
  const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`

  // ── 6. Persist URL ───────────────────────────────────────────────────
  const { error: rpcErr } = await supabase.rpc('set_credit_note_pdf_url', {
    p_id:  note.id,
    p_url: publicUrl,
  })
  if (rpcErr) {
    console.warn(`[cn-pdf] uploaded but failed to persist URL on ${note.credit_note_id}: ${rpcErr.message}`)
  }

  return {
    url:         publicUrl,
    storageKey,
    noteId:      note.credit_note_id,
    bytes:       buffer.length,
    regenerated: true,
  }
}
