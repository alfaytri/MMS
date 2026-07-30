/**
 * Generates the Receival Check PDF for a PO — either per-receival or blank.
 *
 * Per-receival: caches on receivals.check_sheet_pdf_url via
 *   `set_receival_check_pdf_url` RPC.
 * Blank: never cached; regenerated each call (running totals change).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { loadPdfFonts } from '@/lib/pdf/pdf-fonts'
import { resolveBrand, brandDataToAssets } from '@/lib/pdf/brand-resolver'
import { htmlToPdfBuffer } from '@/lib/pdf/html-to-pdf'
import { fetchArabicNamesByBrandVariant } from '@/lib/pdf/arabic-names'
import {
  buildReceivalCheckHtml,
  type ReceivalCheckMode,
  type ReceivalCheckRow,
} from '@/lib/purchase/receival-check-pdf-html'

export type { ReceivalCheckMode } from '@/lib/purchase/receival-check-pdf-html'

export interface GenerateReceivalCheckResult {
  url:         string
  storageKey:  string
  filename:    string
  bytes:       number
  regenerated: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────

function safeKey(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '_')
}

// ── Types ──────────────────────────────────────────────────────────────────

interface PoRow {
  id:            string
  po_number:     string
  supplier_name: string
  division_id:   string | null
}

interface PoLineItemRow {
  id:                string
  item_name:         string
  sku:               string | null
  qty:               number
  free_qty:          number | null
  brand_variant_id:  string | null
}

interface ReceivalItemRow {
  id:                string
  receival_id:       string
  po_line_item_id:   string | null
  item_name:         string
  sku:               string | null
  qty_received:      number
  is_free:           boolean
  brand_variant_id:  string | null
}

interface ReceivalRow {
  id:                    string
  receival_number:       string
  date:                  string
  notes:                 string | null
  check_sheet_pdf_url:   string | null
  created_at:            string
  receival_items:        ReceivalItemRow[] | null
}

// ── Public entry ───────────────────────────────────────────────────────────

export async function generateReceivalCheckPdf(
  poUuid:   string,
  supabase: SupabaseClient,
  opts: {
    mode:        ReceivalCheckMode
    receivalId?: string
    force?:      boolean
    divisionId?: string
  },
): Promise<GenerateReceivalCheckResult> {
  const { mode, receivalId, force } = opts

  if (mode === 'per_receival' && !receivalId) {
    throw new Error('receivalId is required when mode is per_receival')
  }

  // ── Fetch PO ─────────────────────────────────────────────────────────
  const { data: po, error: poErr } = await supabase
    .from('purchase_orders')
    .select('id, po_number, supplier_name, division_id')
    .eq('id', poUuid)
    .single<PoRow>()
  if (poErr || !po) {
    throw new Error(`Purchase Order not found: ${poUuid} (${poErr?.message ?? 'no row'})`)
  }

  // ── Fetch PO line items ─────────────────────────────────────────────
  const { data: poLineItems, error: pliErr } = await supabase
    .from('po_line_items')
    .select('id, item_name, sku, qty, free_qty, brand_variant_id')
    .eq('po_id', poUuid)
    .order('id', { ascending: true })
  if (pliErr) {
    throw new Error(`Failed to fetch PO line items: ${pliErr.message}`)
  }
  const lineItems: PoLineItemRow[] = poLineItems ?? []

  // ── Fetch ALL receivals for this PO ─────────────────────────────────
  const { data: allRcv, error: rcvErr } = await supabase
    .from('receivals')
    .select('id, receival_number, date, notes, check_sheet_pdf_url, created_at, receival_items(*)')
    .eq('po_id', poUuid)
    .order('date', { ascending: true })
    .order('created_at', { ascending: true })
  if (rcvErr) {
    throw new Error(`Failed to fetch receivals: ${rcvErr.message}`)
  }
  const receivals: ReceivalRow[] = allRcv ?? []

  // ── Per-receival mode: locate target + cache check ──────────────────
  let targetReceival: ReceivalRow | null = null
  if (mode === 'per_receival') {
    targetReceival = receivals.find((r) => r.id === receivalId) ?? null
    if (!targetReceival) {
      throw new Error(`Receival not found: ${receivalId}`)
    }
    if (targetReceival.check_sheet_pdf_url && !force) {
      const storageKey = `${safeKey(targetReceival.receival_number)}.pdf`
      return {
        url:         targetReceival.check_sheet_pdf_url,
        storageKey,
        filename:    `ReceivalCheck-${targetReceival.receival_number}.pdf`,
        bytes:       0,
        regenerated: false,
      }
    }
  }

  // ── Build rows ─────────────────────────────────────────────────────
  const rows: ReceivalCheckRow[] = []

  function isPrior(r: ReceivalRow): boolean {
    if (!targetReceival) return false
    if (r.date < targetReceival.date) return true
    if (r.date > targetReceival.date) return false
    return r.created_at < targetReceival.created_at
  }

  for (const li of lineItems) {
    let prevReceived     = 0
    let prevReceivedFree = 0
    let thisReceival     = 0
    let thisReceivalFree = 0

    for (const rcv of receivals) {
      const items = rcv.receival_items ?? []
      for (const ri of items) {
        if (ri.po_line_item_id !== li.id) continue
        if (mode === 'per_receival' && targetReceival) {
          if (rcv.id === targetReceival.id) {
            if (ri.is_free) thisReceivalFree += ri.qty_received
            else            thisReceival     += ri.qty_received
          } else if (isPrior(rcv)) {
            if (ri.is_free) prevReceivedFree += ri.qty_received
            else            prevReceived     += ri.qty_received
          }
        } else {
          if (ri.is_free) prevReceivedFree += ri.qty_received
          else            prevReceived     += ri.qty_received
        }
      }
    }

    const ordered      = Number(li.qty ?? 0)
    const orderedFree  = Number(li.free_qty ?? 0)
    const remainingAfter     = Math.max(0, ordered     - prevReceived     - thisReceival)
    const remainingAfterFree = Math.max(0, orderedFree - prevReceivedFree - thisReceivalFree)

    rows.push({
      itemName:           li.item_name,
      sku:                li.sku,
      ordered,
      orderedFree,
      prevReceived,
      prevReceivedFree,
      thisReceival,
      thisReceivalFree,
      remainingAfter,
      remainingAfterFree,
      isLoose:            false,
      brandVariantId:     li.brand_variant_id,
    })
  }

  if (mode === 'per_receival' && targetReceival) {
    const looseItems = (targetReceival.receival_items ?? []).filter((ri) => ri.po_line_item_id === null)
    const grouped = new Map<string, { paid: number; free: number; name: string; sku: string | null; bvId: string | null }>()
    for (const ri of looseItems) {
      const key = `${ri.item_name}|${ri.sku ?? ''}`
      const g = grouped.get(key) ?? { paid: 0, free: 0, name: ri.item_name, sku: ri.sku, bvId: ri.brand_variant_id }
      if (ri.is_free) g.free += ri.qty_received
      else            g.paid += ri.qty_received
      grouped.set(key, g)
    }
    for (const g of grouped.values()) {
      rows.push({
        itemName:           g.name,
        sku:                g.sku,
        ordered:            null,
        orderedFree:        0,
        prevReceived:       0,
        prevReceivedFree:   0,
        thisReceival:       g.paid,
        thisReceivalFree:   g.free,
        remainingAfter:     0,
        remainingAfterFree: 0,
        isLoose:            true,
        brandVariantId:     g.bvId,
      })
    }
  }

  // Hydrate Arabic names — bulk fetch by brand_variant_id and stamp on rows.
  const arMap = await fetchArabicNamesByBrandVariant(
    supabase,
    rows.map((r) => r.brandVariantId ?? null),
  )
  for (const row of rows) {
    if (row.brandVariantId) {
      const ar = arMap.get(row.brandVariantId)
      if (ar) row.itemNameAr = ar
    }
  }

  // ── Build HTML ─────────────────────────────────────────────────────
  const [brand, fonts] = await Promise.all([
    resolveBrand(opts.divisionId ?? po.division_id, supabase),
    loadPdfFonts(),
  ])
  const { assets } = brandDataToAssets(brand)

  const docNo = mode === 'per_receival' && targetReceival
    ? `RCV-${targetReceival.receival_number}`
    : `RCV-CHECK-${po.po_number}`

  const html = buildReceivalCheckHtml({
    mode,
    docNo,
    poNumber:       po.po_number,
    supplierName:   po.supplier_name,
    division:       null,
    receivalNumber: targetReceival?.receival_number ?? null,
    receivalNotes:  targetReceival?.notes ?? null,
    rows,
    assets,
    fonts,
  })

  // ── Render ─────────────────────────────────────────────────────────
  const buffer = await htmlToPdfBuffer(html)

  // ── Upload ─────────────────────────────────────────────────────────
  const storageKey = mode === 'per_receival' && targetReceival
    ? `${safeKey(targetReceival.receival_number)}.pdf`
    : `${safeKey(po.po_number)}-blank-${Date.now()}.pdf`

  const { error: uploadErr } = await supabase.storage
    .from('receival-check-pdfs')
    .upload(storageKey, buffer, {
      contentType:  'application/pdf',
      upsert:       true,
      cacheControl: '0',
    })
  if (uploadErr) {
    throw new Error(`Storage upload failed for ${storageKey}: ${uploadErr.message}`)
  }

  const { data: urlData } = supabase.storage
    .from('receival-check-pdfs')
    .getPublicUrl(storageKey)
  const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`

  // ── Persist (per_receival only) ────────────────────────────────────
  if (mode === 'per_receival' && targetReceival) {
    const { error: rpcErr } = await supabase.rpc('set_receival_check_pdf_url', {
      p_id:  targetReceival.id,
      p_url: publicUrl,
    })
    if (rpcErr) {
      console.warn(`[receival-check-pdf] uploaded but failed to persist URL on ${targetReceival.receival_number}: ${rpcErr.message}`)
    }
  }

  const filename = mode === 'per_receival' && targetReceival
    ? `ReceivalCheck-${targetReceival.receival_number}.pdf`
    : `ReceivalCheckBlank-${po.po_number}.pdf`

  return {
    url:         publicUrl,
    storageKey,
    filename,
    bytes:       buffer.length,
    regenerated: true,
  }
}
