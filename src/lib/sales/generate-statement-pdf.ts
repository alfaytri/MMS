/**
 * Generates a Customer Statement PDF on demand.
 * Calls rpc_customer_statement_v2 (SO-based, matches the mockup at
 * public/brand/customer-statement-preview.html) and renders via the
 * shared brand kit / htmlToPdfBuffer pipeline.
 *
 * Filter modes (query params on the API route):
 *   - `open=true` (default) — only orders with outstanding > 0
 *   - `open=false` — all orders for the customer
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { buildStatementHtml, type StatementOrderRow } from '@/lib/sales/statement-pdf-html'
import { loadPdfFonts } from '@/lib/pdf/pdf-fonts'
import { resolveBrand, brandDataToAssets } from '@/lib/pdf/brand-resolver'
import { htmlToPdfBuffer } from '@/lib/pdf/html-to-pdf'

export interface GenerateStatementPdfInput {
  customerId:  string
  openOnly?:   boolean  // default true — mirror the mockup ("open and unpaid")
  divisionId?: string
  notes?:      string | null
}

export interface GenerateStatementPdfResult {
  buffer:       Buffer
  filename:     string
  customerName: string
  bytes:        number
}

type StatementRpcData = {
  customer: { name: string; phone: string | null; account_type: string }
  orders: Array<{
    id: string; so_number: string; created_at: string; status: string
    total: number; paid: number; outstanding: number
  }>
  totals: { total_orders_value: number; total_paid: number; total_outstanding: number }
  open_orders_count: number
}

function sanitizeFilename(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, '_')
}

export async function generateStatementPdf(
  input: GenerateStatementPdfInput,
  supabase: SupabaseClient,
): Promise<GenerateStatementPdfResult> {

  const openOnly = input.openOnly ?? true

  // ── 1. Fetch statement data ──────────────────────────────────────────
  const { data, error } = await supabase.rpc('rpc_customer_statement_v2' as any, {
    p_customer_id: input.customerId,
  })
  if (error || !data) {
    throw new Error(`Statement RPC failed: ${error?.message ?? 'no data'}`)
  }
  const statement = data as StatementRpcData

  // ── 2. Filter + shape orders ─────────────────────────────────────────
  const filteredOrders = openOnly
    ? statement.orders.filter((o) => Number(o.outstanding) > 0)
    : statement.orders

  const rows: StatementOrderRow[] = filteredOrders.map((o) => ({
    so_number:   o.so_number,
    so_date:     o.created_at,
    status:      o.status,
    total:       Number(o.total),
    paid:        Number(o.paid),
    outstanding: Number(o.outstanding),
  }))

  // If we filtered to open-only, recompute totals from the filtered list.
  // Otherwise use the RPC-reported totals (which cover all orders).
  const totalOrders    = openOnly ? rows.reduce((s, o) => s + o.total, 0) : Number(statement.totals.total_orders_value)
  const totalPaid      = openOnly ? rows.reduce((s, o) => s + o.paid, 0) : Number(statement.totals.total_paid)
  const totalOutstanding = openOnly ? rows.reduce((s, o) => s + o.outstanding, 0) : Number(statement.totals.total_outstanding)

  // ── 3. HTML + PDF ────────────────────────────────────────────────────
  const [brand, fonts] = await Promise.all([
    resolveBrand(input.divisionId ?? null, supabase),
    loadPdfFonts(),
  ])
  const { assets } = brandDataToAssets(brand)

  const html = buildStatementHtml({
    customer_name:      statement.customer.name ?? '',
    customer_phone:     statement.customer.phone ?? null,
    account_type:       statement.customer.account_type ?? 'Cash',
    statement_date:     new Date().toISOString(),
    open_orders:        statement.open_orders_count,
    orders:             rows,
    total_orders_value: totalOrders,
    total_paid:         totalPaid,
    total_outstanding:  totalOutstanding,
    notes:              input.notes ?? null,
    assets,
    fonts,
  })

  const buffer = await htmlToPdfBuffer(html)

  const filename = `Statement_${sanitizeFilename(statement.customer.name ?? 'customer')}.pdf`

  return {
    buffer,
    filename,
    customerName: statement.customer.name ?? '',
    bytes: buffer.length,
  }
}
