import type { SupabaseClient } from '@supabase/supabase-js'
import { loadPdfFonts } from '@/lib/pdf/pdf-fonts'
import { resolveBrand, brandDataToAssets } from '@/lib/pdf/brand-resolver'
import { htmlToPdfBuffer } from '@/lib/pdf/html-to-pdf'
import { fetchArabicNamesByBrandVariant } from '@/lib/pdf/arabic-names'
import { fetchCategoryInfoByBrandVariant } from '@/lib/pdf/category-paths'
import { variantPickerLabel, GENERIC_VARIANT_LABEL } from '@/lib/inventory/variantPickerLabel'
import {
  buildReceivalReceiptHtml,
  type ReceivalReceiptItem,
} from '@/lib/purchase/receival-receipt-pdf-html'

export interface GenerateReceivalReceiptResult {
  url:         string
  storageKey:  string
  filename:    string
  bytes:       number
  regenerated: boolean
}

function safeKey(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '_')
}

interface ReceivalRow {
  id:               string
  receival_number:  string
  po_id:            string
  warehouse_id:     string
  date:             string
  notes:            string | null
  received_by_name: string | null
  receipt_pdf_url:  string | null
  receival_items:   Array<{
    id:                string
    item_name:         string
    sku:               string | null
    qty_received:      number
    unit_cost:         number
    is_free:           boolean | null
    brand_variant_id:  string | null
    inventory_item_brand_variants: {
      brand:         string | null
      brands:        { name: string | null } | null
      country_codes: { name: string | null } | null
    } | null
  }> | null
  purchase_orders:  { po_number: string; supplier_name: string; division_id: string | null; currency: string | null; vendor_notes: string | null; payment_terms: string | null; delivery_terms: string | null } | null
  warehouses:       { name: string } | null
}

export async function generateReceivalReceiptPdf(
  receivalId: string,
  supabase:   SupabaseClient,
  opts?: { force?: boolean; divisionId?: string },
): Promise<GenerateReceivalReceiptResult> {
  const force = opts?.force ?? false

  const { data: rcv, error: rcvErr } = await supabase
    .from('receivals')
    .select(`
      id, receival_number, po_id, warehouse_id, date, notes, received_by_name,
      receipt_pdf_url,
      receival_items(id, item_name, sku, qty_received, unit_cost, is_free, brand_variant_id,
        inventory_item_brand_variants(brand, brands(name), country_codes(name))),
      purchase_orders!receivals_po_id_fkey(po_number, supplier_name, division_id, currency, vendor_notes, payment_terms, delivery_terms),
      warehouses!receivals_warehouse_id_fkey(name)
    `)
    .eq('id', receivalId)
    .single<ReceivalRow>()

  if (rcvErr || !rcv) {
    throw new Error(`Receival not found: ${receivalId} (${rcvErr?.message ?? 'no row'})`)
  }

  if (rcv.receipt_pdf_url && !force) {
    return {
      url:         rcv.receipt_pdf_url,
      storageKey:  `${safeKey(rcv.receival_number)}.pdf`,
      filename:    `GoodsReceipt-${rcv.receival_number}.pdf`,
      bytes:       0,
      regenerated: false,
    }
  }

  const rawItems = rcv.receival_items ?? []
  const [arMap, catMap] = await Promise.all([
    fetchArabicNamesByBrandVariant(supabase, rawItems.map((r) => r.brand_variant_id)),
    fetchCategoryInfoByBrandVariant(supabase, rawItems.map((r) => r.brand_variant_id)),
  ])
  const items: ReceivalReceiptItem[] = rawItems.map(ri => {
    const bvRaw = ri.inventory_item_brand_variants
    const bv = Array.isArray(bvRaw) ? bvRaw[0] : bvRaw
    // "Brand · Origin" resolved the same way the on-screen ItemLabel does; the
    // "Generic" placeholder brand is dropped so plain lines stay uncluttered.
    const vlabel = variantPickerLabel({
      brand_name:   bv?.brands?.name ?? null,
      brand:        bv?.brand ?? null,
      country_name: bv?.country_codes?.name ?? null,
    })
    return {
      itemName:     ri.item_name,
      itemNameAr:   ri.brand_variant_id ? arMap.get(ri.brand_variant_id) ?? null : null,
      sku:          ri.sku,
      categoryPath: ri.brand_variant_id ? catMap.get(ri.brand_variant_id)?.category_path ?? null : null,
      brand:        vlabel.primary === GENERIC_VARIANT_LABEL ? null : vlabel.primary,
      origin:       vlabel.origin ?? null,
      qtyReceived:  ri.qty_received,
      unitCost:     ri.unit_cost,
      isFree:       ri.is_free === true,
    }
  })

  const [brand, fonts] = await Promise.all([
    resolveBrand(opts?.divisionId ?? rcv.purchase_orders?.division_id, supabase),
    loadPdfFonts(),
  ])
  const { assets } = brandDataToAssets(brand)

  const html = buildReceivalReceiptHtml({
    receivalNumber: rcv.receival_number,
    poNumber:       rcv.purchase_orders?.po_number ?? '—',
    supplierName:   rcv.purchase_orders?.supplier_name ?? '—',
    warehouseName:  rcv.warehouses?.name ?? null,
    receivedBy:     rcv.received_by_name,
    date:           rcv.date,
    notes:          rcv.notes,
    // receival_items.unit_cost is in the PO's currency (QAR for inventory
    // receivals) — see migration 20260729214710. Label the receipt truthfully.
    currency:       rcv.purchase_orders?.currency ?? 'QAR',
    vendor_notes:   rcv.purchase_orders?.vendor_notes ?? null,
    payment_terms:  rcv.purchase_orders?.payment_terms ?? null,
    delivery_terms: rcv.purchase_orders?.delivery_terms ?? null,
    items,
    assets,
    fonts,
  })

  const buffer = await htmlToPdfBuffer(html)

  const storageKey = `${safeKey(rcv.receival_number)}.pdf`
  const { error: uploadErr } = await supabase.storage
    .from('receival-receipt-pdfs')
    .upload(storageKey, buffer, {
      contentType:  'application/pdf',
      upsert:       true,
      cacheControl: '0',
    })
  if (uploadErr) {
    throw new Error(`Storage upload failed for ${storageKey}: ${uploadErr.message}`)
  }

  const { data: urlData } = supabase.storage
    .from('receival-receipt-pdfs')
    .getPublicUrl(storageKey)
  const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`

  await supabase
    .from('receivals')
    .update({ receipt_pdf_url: publicUrl })
    .eq('id', rcv.id)

  return {
    url:         publicUrl,
    storageKey,
    filename:    `GoodsReceipt-${rcv.receival_number}.pdf`,
    bytes:       buffer.length,
    regenerated: true,
  }
}
