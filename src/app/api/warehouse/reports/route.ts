import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { htmlToPdfBuffer } from '@/lib/pdf/html-to-pdf'
import { loadPdfFonts } from '@/lib/pdf/pdf-fonts'
import { resolveBrand, brandDataToAssets } from '@/lib/pdf/brand-resolver'
import {
  buildStockOverviewReportHtml,
  buildTransfersReportHtml,
  buildAdjustmentsReportHtml,
  buildInventoryChecksReportHtml,
  buildStockValueReportHtml,
  buildMovementsReportHtml,
  buildReceivalsDeliveriesReportHtml,
  type StockOverviewRow,
  type TransferReportRow,
  type AdjustmentReportRow,
  type InventoryCheckReportRow,
  type StockValueReportRow,
  type MovementReportRow,
  type ReceivalDeliveryReportRow,
} from '@/lib/warehouse/warehouse-report-html'

export const runtime = 'nodejs'
export const maxDuration = 30

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const REPORT_TYPES = [
  'stock-overview', 'transfers', 'adjustments',
  'inventory-checks', 'stock-value', 'movements', 'receivals-deliveries',
] as const
type ReportType = typeof REPORT_TYPES[number]

async function requireUser(req: NextRequest) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const authClient = createClient(SUPA_URL, SUPA_KEY)
  const { data: { user }, error } = await authClient.auth.getUser(token)
  if (error || !user) return null
  return user
}

// Six-domains H9: gate warehouse-reports on the `reports.view` permission
// (same permission the /reports page enforces). Without this any authenticated
// user could POST here and hit SERVICE_ROLE_KEY-bypassed reads of every WH.
async function requireReportsPermission(req: NextRequest): Promise<{ ok: true; profileId: string } | { ok: false; status: number; error: string }> {
  const user = await requireUser(req)
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' }
  const admin = createClient<Database>(SUPA_URL, SUPA_KEY)
  const { data: profile } = await admin
    .from('user_data')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) return { ok: false, status: 403, error: 'No profile — cannot resolve permissions' }
  const { data: hasPerm, error: permErr } = await admin.rpc('_user_has_permission', {
    p_profile_id: profile.id,
    p_permission: 'reports.view',
  })
  if (permErr) return { ok: false, status: 500, error: permErr.message }
  if (!hasPerm) return { ok: false, status: 403, error: 'Missing reports.view permission' }
  return { ok: true, profileId: profile.id }
}

// ─── Date helpers ───────────────────────────────────────────────────────────

function toIsoStart(dateStr?: string): string | undefined {
  if (!dateStr) return undefined
  return `${dateStr}T00:00:00.000Z`
}

function toIsoEnd(dateStr?: string): string | undefined {
  if (!dateStr) return undefined
  return `${dateStr}T23:59:59.999Z`
}

// ─── Data fetchers ───────────────────────────────────────────────────────────

type SupaClient = ReturnType<typeof createClient<Database>>

async function fetchStockOverview(supabase: SupaClient, warehouseId?: string) {
  let q = supabase
    .from('warehouse_stock_view')
    .select('warehouse_id, brand_variant_id, item_name, brand, sku, qty, avg_cost, total_value, category_name, subcategory_name, item_type, country_name')
    .order('category_name', { ascending: true })
    .order('subcategory_name', { ascending: true })
    .order('item_name', { ascending: true })
  if (warehouseId) q = q.eq('warehouse_id', warehouseId)
  const { data, error } = await q.limit(20000)
  if (error) throw error

  let warehouseName = 'All Warehouses'
  if (warehouseId) {
    const { data: wh } = await supabase.from('warehouses').select('name').eq('id', warehouseId).single() as { data: { name: string } | null }
    warehouseName = wh?.name ?? warehouseName
  }

  // Post-D.5 the view returns one row per (warehouse, sub_container, variant).
  // Roll sub_container rows up per (warehouse, item identity) so the report
  // shape matches the pre-D.5 behaviour: one row per warehouse-item pair.
  const rolled = new Map<string, StockOverviewRow & { _qty: number; _cost_weighted: number }>()
  for (const r of (data ?? []) as unknown as Array<Record<string, unknown>>) {
    // Key on the variant leaf, NOT item_name|brand|sku — else two distinct
    // origin variants (same item + brand) would collapse into one summed line.
    // Sub-container rows of the SAME variant still roll up (same brand_variant_id).
    const key = `${r.warehouse_id ?? ''}|${r.brand_variant_id ?? ''}`
    const qty = Number(r.qty ?? 0)
    const avg = Number(r.avg_cost ?? 0)
    const val = Number(r.total_value ?? 0)
    const existing = rolled.get(key)
    if (!existing) {
      rolled.set(key, {
        category_name: (r.category_name as string | null) ?? null,
        subcategory_name: (r.subcategory_name as string | null) ?? null,
        item_name: (r.item_name as string) ?? '',
        brand: (r.brand as string | null) ?? null,
        sku: (r.sku as string | null) ?? null,
        item_type: (r.item_type as string | null) ?? null,
        origin: (r.country_name as string | null) ?? null,
        qty,
        avg_cost: avg,
        total_value: val,
        _qty: qty,
        _cost_weighted: avg * qty,
      })
      continue
    }
    existing.qty += qty
    existing.total_value += val
    existing._qty += qty
    existing._cost_weighted += avg * qty
    existing.avg_cost = existing._qty > 0 ? existing._cost_weighted / existing._qty : 0
  }

  const rows: StockOverviewRow[] = Array.from(rolled.values()).map((r) => ({
    category_name: r.category_name,
    subcategory_name: r.subcategory_name,
    item_name: r.item_name,
    brand: r.brand,
    sku: r.sku,
    item_type: r.item_type,
    origin: r.origin,
    qty: r.qty,
    avg_cost: r.avg_cost,
    total_value: r.total_value,
  }))

  return { warehouseName, rows }
}

async function fetchTransfers(supabase: SupaClient, fromDate?: string, toDate?: string) {
  let q = supabase
    .from('warehouse_transfers')
    .select(`*, from_warehouse:from_warehouse_id(name), to_warehouse:to_warehouse_id(name),
      transfer_items:warehouse_transfer_items(requested_qty)`)
    .order('created_at', { ascending: false })
    .limit(2000)
  if (fromDate) q = q.gte('created_at', fromDate)
  if (toDate) q = q.lte('created_at', toDate)
  const { data, error } = await q
  if (error) throw error

  const rows: TransferReportRow[] = (data ?? []).map((t: Record<string, unknown>) => {
    const items = (t.transfer_items ?? []) as { requested_qty: number }[]
    return {
      transfer_number: t.transfer_number as string,
      date: t.date as string,
      from_warehouse: ((t.from_warehouse as { name: string } | null)?.name) ?? '—',
      to_warehouse: ((t.to_warehouse as { name: string } | null)?.name) ?? '—',
      status: t.status as string,
      items_count: items.length,
      total_qty: items.reduce((s, i) => s + (i.requested_qty ?? 0), 0),
      created_by_name: t.created_by_name as string | null,
      dispatched_by_name: t.dispatched_by_name as string | null,
      received_by_name: t.received_by_name as string | null,
      notes: t.notes as string | null,
    }
  })
  return { rows }
}

async function fetchAdjustments(supabase: SupaClient, fromDate?: string, toDate?: string) {
  let q = supabase
    .from('stock_adjustments')
    .select(`*, warehouses(name),
      inventory_item_brand_variants(brand, inventory_items(name_en, sku))`)
    .order('created_at', { ascending: false })
    .limit(2000)
  if (fromDate) q = q.gte('created_at', fromDate)
  if (toDate) q = q.lte('created_at', toDate)
  const { data, error } = await q
  if (error) throw error

  const rows: AdjustmentReportRow[] = (data ?? []).map((a: Record<string, unknown>) => {
    const bv = a.inventory_item_brand_variants as { brand: string | null; inventory_items: { name_en: string; sku: string | null } | null } | null
    return {
      created_at: a.created_at as string,
      warehouse_name: ((a.warehouses as { name: string } | null)?.name) ?? '—',
      item_name: bv?.inventory_items?.name_en ?? '—',
      brand: bv?.brand ?? null,
      adjustment_type: a.adjustment_type as string,
      qty: a.qty as number,
      reason: a.reason as string,
      status: a.status as string,
      requested_by_name: a.requested_by_name as string | null,
      approved_by_name: a.approved_by_name as string | null,
    }
  })
  return { rows }
}

async function fetchInventoryChecks(supabase: SupaClient, fromDate?: string, toDate?: string) {
  let q = supabase
    .from('inventory_checks')
    .select('check_number, warehouse_name, status, started_at, initiated_by_name, reviewed_by_name, reviewed_at, notes')
    .order('created_at', { ascending: false })
    .limit(2000)
  if (fromDate) q = q.gte('created_at', fromDate)
  if (toDate) q = q.lte('created_at', toDate)
  const { data, error } = await q
  if (error) throw error
  return { rows: (data ?? []) as InventoryCheckReportRow[] }
}

async function fetchStockValue(supabase: SupaClient) {
  const { data, error } = await supabase
    .from('warehouse_stock_view')
    .select('warehouse_id, brand_variant_id, item_name, brand, sku, qty, avg_cost, total_value, category_name, subcategory_name, item_type, country_name')
    .order('category_name', { ascending: true })
    .order('item_name', { ascending: true })
    .limit(20000)
  if (error) throw error

  const { data: warehouses } = await supabase.from('warehouses').select('id, name')
  const whMap = new Map((warehouses ?? []).map((w: { id: string; name: string }) => [w.id, w.name]))

  // Post-D.5 the view produces one row per (warehouse, sub_container, variant).
  // Roll sub_container rows up per (warehouse, item identity) so the value
  // report shape matches pre-D.5 — one row per warehouse-item pair.
  const rolled = new Map<string, StockValueReportRow & { _qty: number; _cost_weighted: number }>()
  for (const r of (data ?? []) as unknown as Array<Record<string, unknown>>) {
    const whId = (r.warehouse_id as string) ?? ''
    // Key on the variant leaf so two distinct origins never merge into one line.
    const key = `${whId}|${r.brand_variant_id ?? ''}`
    const qty = Number(r.qty ?? 0)
    const avg = Number(r.avg_cost ?? 0)
    const val = Number(r.total_value ?? 0)
    const existing = rolled.get(key)
    if (!existing) {
      rolled.set(key, {
        category_name: (r.category_name as string | null) ?? null,
        subcategory_name: (r.subcategory_name as string | null) ?? null,
        item_name: (r.item_name as string) ?? '',
        brand: (r.brand as string | null) ?? null,
        sku: (r.sku as string | null) ?? null,
        item_type: (r.item_type as string | null) ?? null,
        origin: (r.country_name as string | null) ?? null,
        qty,
        avg_cost: avg,
        total_value: val,
        warehouse_name: whMap.get(whId) ?? '—',
        _qty: qty,
        _cost_weighted: avg * qty,
      })
      continue
    }
    existing.qty += qty
    existing.total_value += val
    existing._qty += qty
    existing._cost_weighted += avg * qty
    existing.avg_cost = existing._qty > 0 ? existing._cost_weighted / existing._qty : 0
  }

  const rows: StockValueReportRow[] = Array.from(rolled.values()).map((r) => ({
    category_name: r.category_name,
    subcategory_name: r.subcategory_name,
    item_name: r.item_name,
    brand: r.brand,
    sku: r.sku,
    item_type: r.item_type,
    origin: r.origin,
    qty: r.qty,
    avg_cost: r.avg_cost,
    total_value: r.total_value,
    warehouse_name: r.warehouse_name,
  }))
  return { rows }
}

async function fetchMovements(supabase: SupaClient, warehouseId?: string, fromDate?: string, toDate?: string) {
  let q = supabase
    .from('inventory_stock_movements')
    .select('id, warehouse_id, item_name, sku, movement_type, qty, unit_cost, reference_type, notes, created_at')
    .order('created_at', { ascending: false })
    .limit(2000)
  if (warehouseId) q = q.eq('warehouse_id', warehouseId)
  if (fromDate) q = q.gte('created_at', fromDate)
  if (toDate) q = q.lte('created_at', toDate)
  const { data, error } = await q
  if (error) throw error

  const { data: warehouses } = await supabase.from('warehouses').select('id, name')
  const whMap = new Map((warehouses ?? []).map((w: { id: string; name: string }) => [w.id, w.name]))

  let warehouseName = 'All Warehouses'
  if (warehouseId) warehouseName = whMap.get(warehouseId) ?? warehouseName

  const rows: MovementReportRow[] = (data ?? []).map((m: Record<string, unknown>) => ({
    created_at: m.created_at as string,
    warehouse_name: whMap.get(m.warehouse_id as string) ?? '—',
    item_name: m.item_name as string,
    sku: m.sku as string | null,
    movement_type: m.movement_type as string,
    qty: m.qty as number,
    unit_cost: m.unit_cost as number,
    reference_type: m.reference_type as string | null,
    notes: m.notes as string | null,
  }))
  return { warehouseName, rows }
}

async function fetchReceivalsDeliveries(supabase: SupaClient, fromDate?: string, toDate?: string) {
  let recQ = supabase
    .from('receivals')
    .select('id, receival_number, date, status, received_by_name, purchase_orders(po_number, supplier_name), warehouses(name), receival_items(id)')
    .order('date', { ascending: false })
    .limit(2000)
  let delQ = supabase
    .from('sale_deliveries')
    .select('id, delivery_number, date, status, warehouse_name, sale_delivery_lines(id), sale_orders(so_number, customers(name))')
    .order('date', { ascending: false })
    .limit(2000)
  if (fromDate) {
    recQ = recQ.gte('date', fromDate)
    delQ = delQ.gte('date', fromDate)
  }
  if (toDate) {
    recQ = recQ.lte('date', toDate)
    delQ = delQ.lte('date', toDate)
  }
  const [receivalsRes, deliveriesRes] = await Promise.all([recQ, delQ])

  if (receivalsRes.error) throw receivalsRes.error
  if (deliveriesRes.error) throw deliveriesRes.error

  const rows: ReceivalDeliveryReportRow[] = []

  for (const r of receivalsRes.data ?? []) {
    const po = r.purchase_orders as { po_number: string; supplier_name: string } | null
    const wh = r.warehouses as { name: string } | null
    const items = (r.receival_items ?? []) as { id: string }[]
    rows.push({
      direction: 'inbound',
      doc_number: r.receival_number ?? '—',
      reference_number: po?.po_number ?? '—',
      warehouse_name: wh?.name ?? '—',
      counterparty: po?.supplier_name ?? '—',
      date: r.date ?? '',
      item_count: items.length,
      status: r.status ?? '',
      responsible_name: r.received_by_name ?? null,
    })
  }

  for (const d of deliveriesRes.data ?? []) {
    const so = d.sale_orders as { so_number: string; customers: { name: string } | null } | null
    const deliveryItems = (d.sale_delivery_lines ?? []) as unknown[]
    rows.push({
      direction: 'outbound',
      doc_number: d.delivery_number ?? '—',
      reference_number: so?.so_number ?? '—',
      warehouse_name: d.warehouse_name ?? '—',
      counterparty: so?.customers?.name ?? '—',
      date: d.date ?? '',
      item_count: deliveryItems.length,
      status: d.status ?? '',
      responsible_name: null,
    })
  }

  rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  return { rows }
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireReportsPermission(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json().catch(() => ({}))
  const type = body.type as ReportType | undefined
  const warehouseId = body.warehouseId as string | undefined
  const divisionId = body.divisionId as string | undefined
  const fromDate = toIsoStart(body.fromDate as string | undefined)
  const toDate = toIsoEnd(body.toDate as string | undefined)

  if (!type || !REPORT_TYPES.includes(type)) {
    return NextResponse.json(
      { error: `Invalid report type. Must be one of: ${REPORT_TYPES.join(', ')}` },
      { status: 400 },
    )
  }

  const supabase = createClient(SUPA_URL, SUPA_KEY)

  // Phase E — warehouses.division_id is gone. Derive from any active
  // sub-container the caller is querying against; falls back to null (report
  // still renders with a generic tenant-wide brand).
  let resolvedDivisionId: string | null = divisionId ?? null
  if (!resolvedDivisionId && warehouseId) {
    const { data: sc } = await supabase
      .from('warehouse_sub_containers')
      .select('division_id')
      .eq('warehouse_id', warehouseId)
      .eq('is_active', true)
      .not('division_id', 'is', null)
      .order('created_at')
      .limit(1)
      .maybeSingle()
    resolvedDivisionId = sc?.division_id ?? null
  }

  const [fonts, brand] = await Promise.all([loadPdfFonts(), resolveBrand(resolvedDivisionId, supabase)])
  const { assets } = brandDataToAssets(brand)

  try {
    let html: string

    switch (type) {
      case 'stock-overview': {
        const data = await fetchStockOverview(supabase, warehouseId)
        html = buildStockOverviewReportHtml({ ...data, fonts, assets })
        break
      }
      case 'transfers': {
        const data = await fetchTransfers(supabase, fromDate, toDate)
        html = buildTransfersReportHtml({ ...data, fonts, assets })
        break
      }
      case 'adjustments': {
        const data = await fetchAdjustments(supabase, fromDate, toDate)
        html = buildAdjustmentsReportHtml({ ...data, fonts, assets })
        break
      }
      case 'inventory-checks': {
        const data = await fetchInventoryChecks(supabase, fromDate, toDate)
        html = buildInventoryChecksReportHtml({ ...data, fonts, assets })
        break
      }
      case 'stock-value': {
        const data = await fetchStockValue(supabase)
        html = buildStockValueReportHtml({ ...data, fonts, assets })
        break
      }
      case 'movements': {
        const data = await fetchMovements(supabase, warehouseId, fromDate, toDate)
        html = buildMovementsReportHtml({ ...data, fonts, assets })
        break
      }
      case 'receivals-deliveries': {
        const data = await fetchReceivalsDeliveries(supabase, fromDate, toDate)
        html = buildReceivalsDeliveriesReportHtml({ ...data, fonts, assets })
        break
      }
    }

    const pdfBuffer = await htmlToPdfBuffer(html, { landscape: true })
    const filename = `${type}-report-${new Date().toISOString().slice(0, 10)}.pdf`

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.length),
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[warehouse-report:${type}]`, msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
