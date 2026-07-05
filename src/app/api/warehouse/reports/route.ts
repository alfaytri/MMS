import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { htmlToPdfBuffer } from '@/lib/pdf/html-to-pdf'
import { loadPdfFonts, loadPdfAssets } from '@/lib/pdf/pdf-fonts'
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

// ─── Period → date range ─────────────────────────────────────────────────────

type Period = 'this-month' | 'last-month' | 'last-3-months' | 'last-6-months'

function periodToFromDate(period?: string): string | undefined {
  if (!period) return undefined
  const now = new Date()
  let from: Date
  switch (period as Period) {
    case 'this-month':
      from = new Date(now.getFullYear(), now.getMonth(), 1)
      break
    case 'last-month':
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      break
    case 'last-3-months':
      from = new Date(now.getFullYear(), now.getMonth() - 3, 1)
      break
    case 'last-6-months':
      from = new Date(now.getFullYear(), now.getMonth() - 6, 1)
      break
    default:
      return undefined
  }
  return from.toISOString()
}

// ─── Data fetchers ───────────────────────────────────────────────────────────

type SupaClient = ReturnType<typeof createClient<any>>

async function fetchStockOverview(supabase: SupaClient, warehouseId?: string) {
  let q = supabase
    .from('warehouse_stock_view')
    .select('warehouse_id, item_name, brand, sku, qty, avg_cost, total_value, category_name, subcategory_name, item_type')
    .order('category_name', { ascending: true })
    .order('subcategory_name', { ascending: true })
    .order('item_name', { ascending: true })
  if (warehouseId) q = q.eq('warehouse_id', warehouseId)
  const { data, error } = await q
  if (error) throw error

  let warehouseName = 'All Warehouses'
  if (warehouseId) {
    const { data: wh } = await supabase.from('warehouses').select('name').eq('id', warehouseId).single() as { data: { name: string } | null }
    warehouseName = wh?.name ?? warehouseName
  }

  return {
    warehouseName,
    rows: (data ?? []) as StockOverviewRow[],
  }
}

async function fetchTransfers(supabase: SupaClient, fromDate?: string) {
  let q = supabase
    .from('warehouse_transfers')
    .select(`*, from_warehouse:from_warehouse_id(name), to_warehouse:to_warehouse_id(name),
      transfer_items:warehouse_transfer_items(requested_qty)`)
    .order('created_at', { ascending: false })
    .limit(2000)
  if (fromDate) q = q.gte('created_at', fromDate)
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

async function fetchAdjustments(supabase: SupaClient, fromDate?: string) {
  let q = supabase
    .from('stock_adjustments')
    .select(`*, warehouses(name),
      inventory_brand_variants(brand, inventory_items(name_en, sku))`)
    .order('created_at', { ascending: false })
    .limit(2000)
  if (fromDate) q = q.gte('created_at', fromDate)
  const { data, error } = await q
  if (error) throw error

  const rows: AdjustmentReportRow[] = (data ?? []).map((a: Record<string, unknown>) => {
    const bv = a.inventory_brand_variants as { brand: string | null; inventory_items: { name_en: string; sku: string | null } | null } | null
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

async function fetchInventoryChecks(supabase: SupaClient, fromDate?: string) {
  let q = supabase
    .from('inventory_checks')
    .select('check_number, warehouse_name, status, started_at, initiated_by_name, submitted_by_name, submitted_at, reviewed_by_name, reviewed_at, notes')
    .order('created_at', { ascending: false })
    .limit(2000)
  if (fromDate) q = q.gte('created_at', fromDate)
  const { data, error } = await q
  if (error) throw error
  return { rows: (data ?? []) as InventoryCheckReportRow[] }
}

async function fetchStockValue(supabase: SupaClient) {
  const { data, error } = await supabase
    .from('warehouse_stock_view')
    .select('warehouse_id, item_name, brand, sku, qty, avg_cost, total_value, category_name, subcategory_name, item_type')
    .order('category_name', { ascending: true })
    .order('item_name', { ascending: true })
  if (error) throw error

  const { data: warehouses } = await supabase.from('warehouses').select('id, name')
  const whMap = new Map((warehouses ?? []).map((w: { id: string; name: string }) => [w.id, w.name]))

  const rows: StockValueReportRow[] = (data ?? []).map((r: Record<string, unknown>) => ({
    category_name: r.category_name as string | null,
    subcategory_name: r.subcategory_name as string | null,
    item_name: r.item_name as string,
    brand: r.brand as string | null,
    sku: r.sku as string | null,
    item_type: r.item_type as string | null,
    qty: r.qty as number,
    avg_cost: r.avg_cost as number,
    total_value: r.total_value as number,
    warehouse_name: whMap.get(r.warehouse_id as string) ?? '—',
  }))
  return { rows }
}

async function fetchMovements(supabase: SupaClient, warehouseId?: string, fromDate?: string) {
  let q = supabase
    .from('inventory_stock_movements')
    .select('id, warehouse_id, item_name, sku, movement_type, qty, unit_cost, reference_type, notes, created_at')
    .order('created_at', { ascending: false })
    .limit(2000)
  if (warehouseId) q = q.eq('warehouse_id', warehouseId)
  if (fromDate) q = q.gte('created_at', fromDate)
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

async function fetchReceivalsDeliveries(supabase: SupaClient, fromDate?: string) {
  let recQ = supabase
    .from('receivals')
    .select('id, receival_number, date, status, received_by_name, purchase_orders(po_number, supplier_name), warehouses(name), receival_items(id)')
    .order('date', { ascending: false })
    .limit(2000)
  let delQ = supabase
    .from('sale_deliveries')
    .select('id, delivery_number, date, items, status, warehouse_name, sale_orders(so_number, customers(name))')
    .order('date', { ascending: false })
    .limit(2000)
  if (fromDate) {
    recQ = recQ.gte('date', fromDate)
    delQ = delQ.gte('date', fromDate)
  }
  const [receivalsRes, deliveriesRes] = await Promise.all([recQ, delQ])

  if (receivalsRes.error) throw receivalsRes.error
  if (deliveriesRes.error) throw deliveriesRes.error

  const rows: ReceivalDeliveryReportRow[] = []

  for (const r of (receivalsRes.data ?? []) as any[]) {
    const po = r.purchase_orders as { po_number: string; supplier_name: string } | null
    const wh = r.warehouses as { name: string } | null
    const items = (r.receival_items ?? []) as { id: string }[]
    rows.push({
      direction: 'inbound',
      doc_number: r.receival_number ?? '—',
      reference_number: po?.po_number ?? '—',
      warehouse_name: wh?.name ?? '—',
      counterparty: po?.supplier_name ?? '—',
      date: r.date,
      item_count: items.length,
      status: r.status,
      responsible_name: r.received_by_name,
    })
  }

  for (const d of (deliveriesRes.data ?? []) as any[]) {
    const so = d.sale_orders as { so_number: string; customers: { name: string } | null } | null
    const deliveryItems = (d.items ?? []) as unknown[]
    rows.push({
      direction: 'outbound',
      doc_number: d.delivery_number ?? '—',
      reference_number: so?.so_number ?? '—',
      warehouse_name: d.warehouse_name ?? '—',
      counterparty: so?.customers?.name ?? '—',
      date: d.date,
      item_count: deliveryItems.length,
      status: d.status,
      responsible_name: null,
    })
  }

  rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  return { rows }
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const type = body.type as ReportType | undefined
  const warehouseId = body.warehouseId as string | undefined
  const fromDate = periodToFromDate(body.period as string | undefined)

  if (!type || !REPORT_TYPES.includes(type)) {
    return NextResponse.json(
      { error: `Invalid report type. Must be one of: ${REPORT_TYPES.join(', ')}` },
      { status: 400 },
    )
  }

  const supabase = createClient(SUPA_URL, SUPA_KEY)
  const [fonts, assets] = await Promise.all([loadPdfFonts(), loadPdfAssets()])

  try {
    let html: string

    switch (type) {
      case 'stock-overview': {
        const data = await fetchStockOverview(supabase, warehouseId)
        html = buildStockOverviewReportHtml({ ...data, fonts, assets })
        break
      }
      case 'transfers': {
        const data = await fetchTransfers(supabase, fromDate)
        html = buildTransfersReportHtml({ ...data, fonts, assets })
        break
      }
      case 'adjustments': {
        const data = await fetchAdjustments(supabase, fromDate)
        html = buildAdjustmentsReportHtml({ ...data, fonts, assets })
        break
      }
      case 'inventory-checks': {
        const data = await fetchInventoryChecks(supabase, fromDate)
        html = buildInventoryChecksReportHtml({ ...data, fonts, assets })
        break
      }
      case 'stock-value': {
        const data = await fetchStockValue(supabase)
        html = buildStockValueReportHtml({ ...data, fonts, assets })
        break
      }
      case 'movements': {
        const data = await fetchMovements(supabase, warehouseId, fromDate)
        html = buildMovementsReportHtml({ ...data, fonts, assets })
        break
      }
      case 'receivals-deliveries': {
        const data = await fetchReceivalsDeliveries(supabase, fromDate)
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
