import type { SupabaseClient } from '@supabase/supabase-js'
import { loadPdfFonts } from '@/lib/pdf/pdf-fonts'
import { resolveBrand, brandDataToAssets } from '@/lib/pdf/brand-resolver'
import { htmlToPdfBuffer } from '@/lib/pdf/html-to-pdf'
import { fetchArabicNamesByBrandVariant, fetchOriginsByBrandVariant } from '@/lib/pdf/arabic-names'
import {
  buildDeliveryNoteHtml,
  type DeliveryNoteItem,
} from '@/lib/sales/delivery-note-pdf-html'

export interface GenerateDeliveryNoteResult {
  url:         string
  storageKey:  string
  filename:    string
  bytes:       number
  regenerated: boolean
}

function safeKey(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '_')
}

interface DeliveryRow {
  id:              string
  delivery_number: string
  sale_order_id:   string
  warehouse_name:  string | null
  date:            string
  sale_delivery_lines: Array<{
    item_name:        string
    sku:              string | null
    qty_delivered:    number
    brand_variant_id: string | null
  }> | null
  status:          string | null
  created_by_name: string | null
  type:            'standard' | 'replacement'
  pdf_url:         string | null
  sale_orders:     { so_number: string; division_id: string | null; customers: { name: string | null } | null } | null
}

export async function generateDeliveryNotePdf(
  deliveryId: string,
  supabase:   SupabaseClient,
  opts?: { force?: boolean; divisionId?: string },
): Promise<GenerateDeliveryNoteResult> {
  const force = opts?.force ?? false

  const { data: del, error: delErr } = await supabase
    .from('sale_deliveries')
    .select(`
      id, delivery_number, sale_order_id, warehouse_name, date,
      status, created_by_name, type, pdf_url,
      sale_delivery_lines(item_name, sku, qty_delivered, brand_variant_id),
      sale_orders(so_number, division_id, customers(name))
    `)
    .eq('id', deliveryId)
    .single<DeliveryRow>()

  if (delErr || !del) {
    throw new Error(`Delivery not found: ${deliveryId} (${delErr?.message ?? 'no row'})`)
  }

  if (del.pdf_url && !force) {
    return {
      url:         del.pdf_url,
      storageKey:  `${safeKey(del.delivery_number)}.pdf`,
      filename:    `DeliveryNote-${del.delivery_number}.pdf`,
      bytes:       0,
      regenerated: false,
    }
  }

  const rawLines = del.sale_delivery_lines ?? []
  const bvIds = rawLines.map((l) => l.brand_variant_id)
  const [arMap, originMap] = await Promise.all([
    fetchArabicNamesByBrandVariant(supabase, bvIds),
    fetchOriginsByBrandVariant(supabase, bvIds),
  ])
  const items: DeliveryNoteItem[] = rawLines.map(i => ({
    itemName:     i.item_name,
    itemNameAr:   i.brand_variant_id ? arMap.get(i.brand_variant_id) ?? null : null,
    origin:       i.brand_variant_id ? originMap.get(i.brand_variant_id) ?? null : null,
    sku:          i.sku,
    qtyDelivered: i.qty_delivered,
  }))

  const [brand, fonts] = await Promise.all([
    resolveBrand(opts?.divisionId ?? del.sale_orders?.division_id ?? null, supabase),
    loadPdfFonts(),
  ])
  const { assets } = brandDataToAssets(brand)

  const html = buildDeliveryNoteHtml({
    deliveryNumber: del.delivery_number,
    soNumber:       del.sale_orders?.so_number ?? null,
    customerName:   del.sale_orders?.customers?.name ?? null,
    warehouseName:  del.warehouse_name,
    createdBy:      del.created_by_name,
    date:           del.date,
    type:           del.type ?? 'standard',
    items,
    assets,
    fonts,
  })

  const buffer = await htmlToPdfBuffer(html)

  const storageKey = `${safeKey(del.delivery_number)}.pdf`
  const { error: uploadErr } = await supabase.storage
    .from('delivery-note-pdfs')
    .upload(storageKey, buffer, {
      contentType:  'application/pdf',
      upsert:       true,
      cacheControl: '0',
    })
  if (uploadErr) {
    throw new Error(`Storage upload failed for ${storageKey}: ${uploadErr.message}`)
  }

  const { data: urlData } = supabase.storage
    .from('delivery-note-pdfs')
    .getPublicUrl(storageKey)
  const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`

  await supabase
    .from('sale_deliveries')
    .update({ pdf_url: publicUrl })
    .eq('id', del.id)

  return {
    url:         publicUrl,
    storageKey,
    filename:    `DeliveryNote-${del.delivery_number}.pdf`,
    bytes:       buffer.length,
    regenerated: true,
  }
}
