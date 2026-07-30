/**
 * Resolves brand assets (logo, stamp, addresses, footer motto) for PDF generation.
 *
 * Resolution order: division-specific value → company value → static fallback.
 * Image URLs from Supabase Storage are fetched and converted to base64 data URLs
 * so the HTML is fully self-contained for Puppeteer rendering.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PdfAssets, BrandHeaderInput } from './pdf-fonts'
import { loadPdfAssets } from './pdf-fonts'

export interface BrandData {
  logoDataUrl:   string
  stampDataUrl:  string | null
  footerDataUrl: string
  addressEn:     string
  addressAr:     string
  companyNameEn: string
  companyNameAr: string
  footerMotto:   string | null
}

interface DivisionWithCompany {
  logo_url:     string | null
  stamp_url:    string | null
  address_en:   string | null
  address_ar:   string | null
  footer_motto: string | null
  companies: {
    name_en:      string
    name_ar:      string | null
    logo_url:     string | null
    stamp_url:    string | null
    address_en:   string | null
    address_ar:   string | null
    footer_motto: string | null
  } | null
}

async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const contentType = res.headers.get('content-type') ?? 'image/png'
    return `data:${contentType};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

const FALLBACK_ADDR_EN = 'Trading and Building Maintenance\nOffice 18, Building 19, Street 185, Zone 55\nDoha, Qatar | P.O. Box 45069\nTrading: 44214420 | Maintenance: 44190600\ninfo@alfaytri.com | www.alfaytri.com'
const FALLBACK_ADDR_AR = 'لتجارة وصيانة المباني\nمكتب ١٨ ، مبنى ١٩ ، شارع ١٨٥ ، منطقة ٥٥\nالدوحة ، قطر | ص.ب ٤٥٠٦٩\nالتداول: ٤٤٢١٤٤٢٠ | الصيانة: ٤٤١٩٠٦٠٠\ninfo@alfaytri.com | www.alfaytri.com'

export async function resolveBrand(
  divisionId: string | null | undefined,
  supabase: SupabaseClient,
): Promise<BrandData> {
  const staticAssets = await loadPdfAssets()

  if (!divisionId) {
    return {
      logoDataUrl:   staticAssets.logo,
      stampDataUrl:  null,
      footerDataUrl: staticAssets.footer,
      addressEn:     FALLBACK_ADDR_EN,
      addressAr:     FALLBACK_ADDR_AR,
      companyNameEn: 'AL FAYTRI',
      companyNameAr: 'الفيتري',
      footerMotto:   null,
    }
  }

  const { data: div } = await supabase
    .from('company_divisions')
    .select(`
      logo_url, stamp_url, address_en, address_ar, footer_motto,
      companies:company_id (
        name_en, name_ar, logo_url, stamp_url,
        address_en, address_ar, footer_motto
      )
    `)
    .eq('id', divisionId)
    .single<DivisionWithCompany>()

  const co = div?.companies ?? null

  const logoUrl   = div?.logo_url   ?? co?.logo_url   ?? null
  const stampUrl  = div?.stamp_url  ?? co?.stamp_url  ?? null
  const addressEn = div?.address_en ?? co?.address_en ?? FALLBACK_ADDR_EN
  const addressAr = div?.address_ar ?? co?.address_ar ?? FALLBACK_ADDR_AR
  const motto     = div?.footer_motto ?? co?.footer_motto ?? null
  const nameEn    = co?.name_en ?? 'AL FAYTRI'
  const nameAr    = co?.name_ar ?? 'الفيتري'

  const [logoData, stampData] = await Promise.all([
    logoUrl  ? urlToDataUrl(logoUrl)  : null,
    stampUrl ? urlToDataUrl(stampUrl) : null,
  ])

  return {
    logoDataUrl:   logoData ?? staticAssets.logo,
    stampDataUrl:  stampData,
    footerDataUrl: staticAssets.footer,
    addressEn,
    addressAr,
    companyNameEn: nameEn,
    companyNameAr: nameAr,
    footerMotto:   motto,
  }
}

export interface ResolvedBrandAssets {
  assets:      PdfAssets
  brandHeader: BrandHeaderInput
}

export function brandDataToAssets(brand: BrandData): ResolvedBrandAssets {
  const brandHeader: BrandHeaderInput = {
    logoDataUrl:   brand.logoDataUrl,
    companyNameEn: brand.companyNameEn,
    companyNameAr: brand.companyNameAr,
    addressEn:     brand.addressEn,
    addressAr:     brand.addressAr,
  }
  return {
    assets: {
      logo:        brand.logoDataUrl,
      footer:      brand.footerDataUrl,
      stamp:       brand.stampDataUrl,
      brandHeader,
    },
    brandHeader,
  }
}
