/**
 * Generates the Purchase Order PDF for one PO, uploads it to the
 * `po-pdfs` Storage bucket, persists the per-variant URL, and returns it.
 *
 * Variants: 'rfq' | 'draft' | 'po' | 'confirmed'
 * Snapshot mode: pass `opts.snapshotVersion` to render on-demand from
 * po_versions (no cache, no upload — returns buffer for direct download).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildPurchaseOrderHtml,
  type PoLineItem,
  type PoPayment,
  type PoPdfVariant,
} from '@/lib/purchase/po-pdf-html'
import { loadPdfFonts } from '@/lib/pdf/pdf-fonts'
import { resolveBrand, brandDataToAssets } from '@/lib/pdf/brand-resolver'
import { htmlToPdfBuffer } from '@/lib/pdf/html-to-pdf'

export type { PoPdfVariant } from '@/lib/purchase/po-pdf-html'

// ── Helpers ────────────────────────────────────────────────────────────────

/** Hash format: "count:totalPaid" — cheap, deterministic, catches any payment change. */
function computePaymentHash(payments: PoPayment[]): string {
  const total = payments.reduce((s, p) => s + p.amount, 0)
  return `${payments.length}:${total.toFixed(2)}`
}

function storageKeyFor(poNumber: string, variant: PoPdfVariant): string {
  const safe = poNumber.replace(/[^A-Za-z0-9._-]/g, '_')
  return `${safe}-${variant}.pdf`
}

// ── Types ──────────────────────────────────────────────────────────────────

interface PoRow {
  id:                string
  po_number:         string
  status:            string
  currency:          string | null
  subtotal:          number | null
  total_qar:         number | null
  discount_amount:   number | null
  created_date:      string
  expected_delivery: string | null
  supplier_name:     string
  supplier_id:       string | null
  division_id:       string | null
  payment_terms:     string | null
  delivery_terms:    string | null
  rfq_id:            string | null
  pdf_rfq_url:       string | null
  pdf_draft_url:     string | null
  pdf_po_url:        string | null
  pdf_confirmed_url: string | null
  pdf_payment_hash:  string | null
  po_line_items:     PoLineItem[] | null
}

export interface GeneratePoPdfLiveResult {
  kind:        'live'
  url:         string
  storageKey:  string
  poNumber:    string
  bytes:       number
  regenerated: boolean
}

export interface GeneratePoPdfSnapshotResult {
  kind:     'snapshot'
  buffer:   Buffer
  poNumber: string
  filename: string
  bytes:    number
}

export type GeneratePoPdfResult = GeneratePoPdfLiveResult | GeneratePoPdfSnapshotResult

// ── Generator ──────────────────────────────────────────────────────────────

export async function generatePoPdf(
  poUuid:   string,
  supabase: SupabaseClient,
  opts:     {
    variant:          PoPdfVariant
    force?:           boolean
    snapshotVersion?: number
    divisionId?:      string
  },
): Promise<GeneratePoPdfResult> {
  const { variant, force, snapshotVersion, divisionId: divisionIdOverride } = opts

  // ── SNAPSHOT PATH: render on-demand from po_versions, no cache ──────
  if (snapshotVersion !== undefined) {
    return await renderSnapshotPdf(poUuid, supabase, variant, snapshotVersion, divisionIdOverride)
  }

  // ── LIVE PATH: fetch PO with line items ────────────────────────────
  const { data: po, error: fetchErr } = await supabase
    .from('purchase_orders')
    .select(`
      id, po_number, status, currency, subtotal, total_qar,
      discount_amount, created_date, expected_delivery,
      supplier_name, supplier_id, division_id, payment_terms, delivery_terms,
      rfq_id,
      pdf_rfq_url, pdf_draft_url, pdf_po_url, pdf_confirmed_url, pdf_payment_hash,
      po_line_items(item_name, sku, qty, unit, unit_price, total_price)
    `)
    .eq('id', poUuid)
    .single<PoRow>()

  if (fetchErr || !po) {
    throw new Error(`Purchase Order not found: ${poUuid} (${fetchErr?.message ?? 'no row'})`)
  }

  // ── Cache lookup ────────────────────────────────────────────────────
  const cachedUrl =
    variant === 'rfq'       ? po.pdf_rfq_url       :
    variant === 'draft'     ? po.pdf_draft_url     :
    variant === 'po'        ? po.pdf_po_url        :
                              po.pdf_confirmed_url

  // For rfq/draft: URL alone is enough (invalidation trigger covers all data changes).
  if ((variant === 'rfq' || variant === 'draft') && cachedUrl && !force) {
    return {
      kind:        'live',
      url:         cachedUrl,
      storageKey:  storageKeyFor(po.po_number, variant),
      poNumber:    po.po_number,
      bytes:       0,
      regenerated: false,
    }
  }

  // ── Resolve linked RFQ number (for meta block) ──────────────────────
  let rfqNumber: string | null = null
  if (po.rfq_id) {
    const { data: rfq } = await supabase
      .from('request_for_quotations')
      .select('rfq_number')
      .eq('id', po.rfq_id)
      .single<{ rfq_number: string }>()
    rfqNumber = rfq?.rfq_number ?? null
  }

  // ── Resolve supplier phone ──────────────────────────────────────────
  let supplierPhone: string | null = null
  if (po.supplier_id) {
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('phone')
      .eq('id', po.supplier_id)
      .single<{ phone: string | null }>()
    supplierPhone = supplier?.phone ?? null
  }

  // ── Fetch payments (only needed for po/confirmed) ───────────────────
  let payments: PoPayment[] = []
  let currentHash: string | null = null
  if (variant === 'po' || variant === 'confirmed') {
    const { data: paymentRows } = await supabase
      .from('payments')
      .select('date, amount, amount_qar, method, reference')
      .eq('source_type', 'purchase_order')
      .eq('source_id', poUuid)
      .is('deleted_at', null)
      .order('date', { ascending: true })

    payments = (paymentRows ?? []).map((p: any) => ({
      date:      p.date,
      amount:    p.amount_qar ?? p.amount,
      method:    p.method,
      reference: p.reference,
    }))
    currentHash = computePaymentHash(payments)

    // Cache hit for po/confirmed requires BOTH the URL and matching hash.
    if (cachedUrl && !force && po.pdf_payment_hash === currentHash) {
      return {
        kind:        'live',
        url:         cachedUrl,
        storageKey:  storageKeyFor(po.po_number, variant),
        poNumber:    po.po_number,
        bytes:       0,
        regenerated: false,
      }
    }
  }

  // ── Compute totals ──────────────────────────────────────────────────
  const totalQar    = Number(po.total_qar ?? 0)
  const amountPaid  = payments.reduce((s, p) => s + p.amount, 0)
  const outstanding = Math.max(0, totalQar - amountPaid)

  // ── Build HTML ──────────────────────────────────────────────────────
  const [brand, fonts] = await Promise.all([
    resolveBrand(divisionIdOverride ?? po.division_id, supabase),
    loadPdfFonts(),
  ])
  const { assets } = brandDataToAssets(brand)

  const html = buildPurchaseOrderHtml({
    po_number:         po.po_number,
    created_date:      po.created_date,
    expected_delivery: po.expected_delivery,
    supplier_name:     po.supplier_name,
    supplier_phone:    supplierPhone,
    rfq_number:        rfqNumber,
    status:            po.status,
    lines:             po.po_line_items ?? [],
    subtotal:          Number(po.subtotal        ?? 0),
    discount_amount:   Number(po.discount_amount ?? 0),
    total_qar:         totalQar,
    currency:          po.currency ?? 'QAR',
    payment_terms:     po.payment_terms,
    delivery_terms:    po.delivery_terms,
    variant,
    payments,
    amount_paid:  amountPaid,
    outstanding,
    assets,
    fonts,
  })

  // ── Render PDF ──────────────────────────────────────────────────────
  const buffer = await htmlToPdfBuffer(html)

  // ── Upload to Storage ───────────────────────────────────────────────
  const storageKey = storageKeyFor(po.po_number, variant)
  const { error: uploadErr } = await supabase.storage
    .from('po-pdfs')
    .upload(storageKey, buffer, {
      contentType:  'application/pdf',
      upsert:       true,
      cacheControl: '0',
    })
  if (uploadErr) {
    throw new Error(`Storage upload failed for ${storageKey}: ${uploadErr.message}`)
  }

  const { data: urlData } = supabase.storage
    .from('po-pdfs')
    .getPublicUrl(storageKey)
  const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`

  // ── Persist URL (and payment hash for po/confirmed) via RPC ─────────
  const { error: rpcErr } = await supabase.rpc('set_po_pdf_url', {
    p_id:           po.id,
    p_variant:      variant,
    p_url:          publicUrl,
    p_payment_hash: currentHash,
  })
  if (rpcErr) {
    console.warn(`[po-pdf] uploaded but failed to persist URL on ${po.po_number} (${variant}): ${rpcErr.message}`)
  }

  return {
    kind:        'live',
    url:         publicUrl,
    storageKey,
    poNumber:    po.po_number,
    bytes:       buffer.length,
    regenerated: true,
  }
}

// ── Snapshot renderer ─────────────────────────────────────────────────────

interface PoVersionLineRow {
  item_name:          string
  sku:                string | null
  qty:                number
  received_qty:       number
  unit:               string
  unit_price:         number
  total_price:        number
  brand_variant_id:   string | null
  tool_asset_item_id: string | null
  free_qty:           number
  brand_id:           string | null
}

interface PoVersionRow {
  supplier_id:          string | null
  supplier_name:        string
  currency:             string | null
  subtotal:             number | null
  discount_amount:      number | null
  payment_terms:        string | null
  delivery_terms:       string | null
  expected_delivery:    string | null
  po_version_lines:     PoVersionLineRow[]
  stage:                'rfq' | 'draft' | 'po'
  version_number:       number
}

function snapshotStageFor(variant: PoPdfVariant): 'rfq' | 'draft' | 'po' {
  if (variant === 'rfq')   return 'rfq'
  if (variant === 'draft') return 'draft'
  return 'po'  // po and confirmed both live in the 'po' stage of po_versions
}

async function renderSnapshotPdf(
  poUuid:          string,
  supabase:        SupabaseClient,
  variant:         PoPdfVariant,
  snapshotVersion: number,
  divisionIdOverride?: string | null,
): Promise<GeneratePoPdfSnapshotResult> {
  const { data: po, error: poErr } = await supabase
    .from('purchase_orders')
    .select('id, po_number, status, created_date, supplier_id, rfq_id, division_id')
    .eq('id', poUuid)
    .single<{
      id: string; po_number: string; status: string;
      created_date: string; supplier_id: string | null; rfq_id: string | null;
      division_id: string | null;
    }>()
  if (poErr || !po) {
    throw new Error(`Purchase Order not found: ${poUuid} (${poErr?.message ?? 'no row'})`)
  }

  const stage = snapshotStageFor(variant)
  const { data: snap, error: snapErr } = await supabase
    .from('po_versions')
    .select(`
      supplier_id, supplier_name, currency, subtotal, discount_amount,
      payment_terms, delivery_terms, expected_delivery, po_version_lines(*), stage, version_number
    `)
    .eq('po_id', poUuid)
    .eq('stage', stage)
    .eq('version_number', snapshotVersion)
    .single<PoVersionRow>()
  if (snapErr || !snap) {
    throw new Error(`Snapshot not found: po=${poUuid} stage=${stage} v=${snapshotVersion}`)
  }

  let supplierPhone: string | null = null
  if (po.supplier_id) {
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('phone')
      .eq('id', po.supplier_id)
      .single<{ phone: string | null }>()
    supplierPhone = supplier?.phone ?? null
  }
  let rfqNumber: string | null = null
  if (po.rfq_id) {
    const { data: rfq } = await supabase
      .from('request_for_quotations')
      .select('rfq_number')
      .eq('id', po.rfq_id)
      .single<{ rfq_number: string }>()
    rfqNumber = rfq?.rfq_number ?? null
  }

  const lines: PoLineItem[] = (snap.po_version_lines ?? []).map((l) => ({
    item_name:          l.item_name,
    sku:                l.sku,
    qty:                l.qty,
    received_qty:       l.received_qty,
    unit:               l.unit,
    unit_price:         l.unit_price,
    total_price:        l.total_price,
    brand_variant_id:   l.brand_variant_id,
    tool_asset_item_id: l.tool_asset_item_id,
    free_qty:           l.free_qty,
    brand_id:           l.brand_id,
  }))
  const subtotal        = Number(snap.subtotal        ?? 0)
  const discountAmount  = Number(snap.discount_amount ?? 0)
  const totalQar        = Math.max(0, subtotal - discountAmount)

  const [brand, fonts] = await Promise.all([
    resolveBrand(divisionIdOverride ?? po.division_id, supabase),
    loadPdfFonts(),
  ])
  const { assets } = brandDataToAssets(brand)

  const html = buildPurchaseOrderHtml({
    po_number:         po.po_number,
    created_date:      po.created_date,
    expected_delivery: snap.expected_delivery,
    supplier_name:     snap.supplier_name,
    supplier_phone:    supplierPhone,
    rfq_number:        rfqNumber,
    status:            po.status,
    lines,
    subtotal,
    discount_amount:   discountAmount,
    total_qar:         totalQar,
    currency:          snap.currency ?? 'QAR',
    payment_terms:     snap.payment_terms,
    delivery_terms:    snap.delivery_terms,
    variant,
    payments:          [],
    amount_paid:       0,
    outstanding:       totalQar,
    assets,
    fonts,
  })

  const buffer = await htmlToPdfBuffer(html)
  const filename = `${po.po_number}-v${snapshotVersion}.pdf`

  return {
    kind:     'snapshot',
    buffer,
    poNumber: po.po_number,
    filename,
    bytes:    buffer.length,
  }
}
