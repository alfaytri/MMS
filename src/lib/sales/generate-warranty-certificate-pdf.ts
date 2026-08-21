import type { SupabaseClient } from '@supabase/supabase-js'
import { loadPdfFonts } from '@/lib/pdf/pdf-fonts'
import { resolveBrand, brandDataToAssets } from '@/lib/pdf/brand-resolver'
import { htmlToPdfBuffer } from '@/lib/pdf/html-to-pdf'
import { fetchArabicNamesByBrandVariant } from '@/lib/pdf/arabic-names'
import {
  buildWarrantyCertificateHtml,
  type WarrantyCertificateItem,
  type WarrantyPolicyBlock,
} from '@/lib/sales/warranty-certificate-pdf-html'

export interface GenerateWarrantyCertificateResult {
  buffer:   Buffer
  filename: string
}

interface DeliveryRow {
  id:              string
  delivery_number: string
  sale_order_id:   string
  date:            string | null
  sale_orders: {
    so_number:   string | null
    division_id: string | null
    customers: {
      name:  string | null
      customer_phones: { phone: string; is_primary: boolean }[] | null
    } | null
  } | null
}

interface WarrantyRow {
  id:                        string
  warranty_number:           string
  sale_delivery_line_id:     string
  brand_variant_id:          string | null
  item_name:                 string
  sku:                       string | null
  qty:                       number
  policy_id:                 string
  policy_name_snapshot:      string
  coverage_type_snapshot:    'none' | 'parts_only' | 'parts_and_labor' | 'replacement_only'
  duration_months_snapshot:  number
  terms_en_snapshot:         string | null
  terms_ar_snapshot:         string | null
  void_conditions_snapshot:  string[] | null
  start_date:                string
  end_date:                  string
  origin_name_snapshot:      string | null
  sale_delivery_lines:       { sale_delivery_id: string } | null
}

/**
 * Regenerates the warranty certificate PDF from live records on every call.
 * No file storage — the plan explicitly calls for on-demand generation so
 * that snapshot edits (or logo changes) are always reflected on reprint.
 */
export async function generateWarrantyCertificatePdf(
  deliveryId: string,
  supabase:   SupabaseClient,
  opts?: { divisionId?: string },
): Promise<GenerateWarrantyCertificateResult> {
  // Delivery + parent SO + customer
  const { data: del, error: delErr } = await supabase
    .from('sale_deliveries')
    .select(`
      id, delivery_number, sale_order_id, date,
      sale_orders(so_number, division_id, customers(name, customer_phones(phone, is_primary)))
    `)
    .eq('id', deliveryId)
    .single<DeliveryRow>()

  if (delErr || !del) {
    throw new Error(`Delivery not found: ${deliveryId} (${delErr?.message ?? 'no row'})`)
  }

  // Warranty records for this delivery — via inner join on lines
  const { data: records, error: recErr } = await supabase
    .from('warranty_records')
    .select(`
      id, warranty_number, sale_delivery_line_id, brand_variant_id,
      item_name, sku, qty,
      policy_id, policy_name_snapshot, coverage_type_snapshot,
      duration_months_snapshot, terms_en_snapshot, terms_ar_snapshot,
      void_conditions_snapshot, start_date, end_date, origin_name_snapshot,
      sale_delivery_lines!inner(sale_delivery_id)
    `)
    .eq('sale_delivery_lines.sale_delivery_id', deliveryId)
    .order('created_at', { ascending: true })
    .returns<WarrantyRow[]>()

  if (recErr) {
    throw new Error(`Failed to load warranty records: ${recErr.message}`)
  }

  const rows = records ?? []

  // Arabic item names by brand_variant (cache-friendly single fetch)
  const arMap = await fetchArabicNamesByBrandVariant(
    supabase,
    rows.map((r) => r.brand_variant_id),
  )

  const items: WarrantyCertificateItem[] = rows.map((r) => ({
    warrantyNumber: r.warranty_number,
    itemName:       r.item_name,
    itemNameAr:     r.brand_variant_id ? arMap.get(r.brand_variant_id) ?? null : null,
    sku:            r.sku,
    qty:            r.qty,
    policyId:       r.policy_id,
    policyName:     r.policy_name_snapshot,
    coverageType:   r.coverage_type_snapshot,
    durationMonths: r.duration_months_snapshot,
    startDate:      r.start_date,
    endDate:        r.end_date,
    originName:     r.origin_name_snapshot,
  }))

  // One block per distinct policy_id, in first-encountered order
  const seen = new Set<string>()
  const policyBlocks: WarrantyPolicyBlock[] = []
  for (const r of rows) {
    if (seen.has(r.policy_id)) continue
    seen.add(r.policy_id)
    policyBlocks.push({
      policyId:       r.policy_id,
      policyName:     r.policy_name_snapshot,
      termsEn:        r.terms_en_snapshot,
      termsAr:        r.terms_ar_snapshot,
      voidConditions: r.void_conditions_snapshot ?? [],
    })
  }

  const [brand, fonts] = await Promise.all([
    resolveBrand(opts?.divisionId ?? del.sale_orders?.division_id ?? null, supabase),
    loadPdfFonts(),
  ])
  const { assets } = brandDataToAssets(brand)

  const html = buildWarrantyCertificateHtml({
    deliveryNumber: del.delivery_number,
    soNumber:       del.sale_orders?.so_number ?? null,
    customerName:   del.sale_orders?.customers?.name  ?? null,
    customerPhone:  (() => {
      const phones = del.sale_orders?.customers?.customer_phones ?? []
      return phones.find((p) => p.is_primary)?.phone ?? phones[0]?.phone ?? null
    })(),
    deliveryDate:   del.date,
    items,
    policyBlocks,
    assets,
    fonts,
  })

  const buffer = await htmlToPdfBuffer(html)

  return {
    buffer,
    filename: `WarrantyCertificate-${del.delivery_number}.pdf`,
  }
}
