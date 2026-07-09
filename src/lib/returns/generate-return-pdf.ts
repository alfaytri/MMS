import type { SupabaseClient } from '@supabase/supabase-js'
import { loadPdfFonts } from '@/lib/pdf/pdf-fonts'
import { resolveBrand, brandDataToAssets } from '@/lib/pdf/brand-resolver'
import { htmlToPdfBuffer } from '@/lib/pdf/html-to-pdf'
import {
  buildReturnPdfHtml,
  type ReturnPdfItem,
} from '@/lib/returns/return-pdf-html'

export interface GenerateReturnPdfResult {
  url: string
  storageKey: string
  filename: string
  bytes: number
  regenerated: boolean
}

function safeKey(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '_')
}

interface ReturnRow {
  id: string
  return_number: string
  division_id: string | null
  source_type: 'sale_order' | 'purchase_order'
  source_id: string
  date: string
  reason: string
  items: Array<{
    item_name: string
    sku: string | null
    qty: number
    condition: string
    brand_variant_id: string | null
  }> | null
  restock_warehouse_id: string | null
  notes: string | null
  status: string | null
  created_by_name: string | null
  pdf_url: string | null
}

export async function generateReturnPdf(
  returnId: string,
  supabase: SupabaseClient,
  opts?: { force?: boolean; divisionId?: string },
): Promise<GenerateReturnPdfResult> {
  const force = opts?.force ?? false

  const { data: ret, error: retErr } = await supabase
    .from('returns')
    .select('*')
    .eq('id', returnId)
    .single<ReturnRow>()

  if (retErr || !ret) {
    throw new Error(`Return not found: ${returnId} (${retErr?.message ?? 'no row'})`)
  }

  if (ret.pdf_url && !force) {
    return {
      url: ret.pdf_url,
      storageKey: `${safeKey(ret.return_number)}.pdf`,
      filename: `Return-${ret.return_number}.pdf`,
      bytes: 0,
      regenerated: false,
    }
  }

  const isSale = ret.source_type === 'sale_order'

  let sourceNumber: string | null = null
  let counterpartyName: string | null = null
  let counterpartyLabel = isSale ? 'Customer' : 'Supplier'
  let unitPriceMap: Record<string, number> = {}

  if (isSale) {
    const { data: so } = await supabase
      .from('sale_orders')
      .select('so_number, customers(name), sale_order_lines(item_name, sku, brand_variant_id, unit_price)')
      .eq('id', ret.source_id)
      .single()
    sourceNumber = so?.so_number ?? null
    counterpartyName = (so?.customers as { name?: string } | null)?.name ?? null
    for (const l of (so?.sale_order_lines ?? []) as Array<{ item_name: string; sku: string | null; brand_variant_id: string | null; unit_price: number }>) {
      const key = l.brand_variant_id ?? l.sku ?? l.item_name
      unitPriceMap[key] = l.unit_price
    }
  } else {
    const { data: po } = await supabase
      .from('purchase_orders')
      .select('po_number, supplier_name, po_line_items(item_name, sku, brand_variant_id, unit_price)')
      .eq('id', ret.source_id)
      .single()
    sourceNumber = po?.po_number ?? null
    counterpartyName = po?.supplier_name ?? null
    for (const l of (po?.po_line_items ?? []) as Array<{ item_name: string; sku: string | null; brand_variant_id: string | null; unit_price: number }>) {
      const key = l.brand_variant_id ?? l.sku ?? l.item_name
      unitPriceMap[key] = l.unit_price
    }
  }

  let warehouseName: string | null = null
  if (ret.restock_warehouse_id) {
    const { data: wh } = await supabase
      .from('warehouses')
      .select('name')
      .eq('id', ret.restock_warehouse_id)
      .single()
    warehouseName = wh?.name ?? null
  }

  const items: ReturnPdfItem[] = (ret.items ?? []).map(i => {
    const key = i.brand_variant_id ?? i.sku ?? i.item_name
    return {
      itemName: i.item_name,
      sku: i.sku,
      qty: i.qty,
      condition: i.condition,
      unitPrice: unitPriceMap[key] ?? null,
    }
  })

  const [brand, fonts] = await Promise.all([
    resolveBrand(opts?.divisionId ?? ret.division_id, supabase),
    loadPdfFonts(),
  ])
  const { assets } = brandDataToAssets(brand)

  const html = buildReturnPdfHtml({
    returnNumber: ret.return_number,
    sourceType: ret.source_type,
    sourceNumber,
    counterpartyLabel,
    counterpartyName,
    warehouseName,
    createdBy: ret.created_by_name,
    date: ret.date,
    reason: ret.reason,
    items,
    notes: ret.notes,
    assets,
    fonts,
  })

  const buffer = await htmlToPdfBuffer(html)

  const storageKey = `${safeKey(ret.return_number)}.pdf`
  const { error: uploadErr } = await supabase.storage
    .from('return-pdfs')
    .upload(storageKey, buffer, {
      contentType: 'application/pdf',
      upsert: true,
      cacheControl: '0',
    })
  if (uploadErr) {
    throw new Error(`Storage upload failed for ${storageKey}: ${uploadErr.message}`)
  }

  const { data: urlData } = supabase.storage
    .from('return-pdfs')
    .getPublicUrl(storageKey)
  const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`

  await supabase
    .from('returns')
    .update({ pdf_url: publicUrl })
    .eq('id', ret.id)

  return {
    url: publicUrl,
    storageKey,
    filename: `Return-${ret.return_number}.pdf`,
    bytes: buffer.length,
    regenerated: true,
  }
}
