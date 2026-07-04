/**
 * Generates a Customer Statement PDF on demand.
 * Date-range parameterized — not cached, returns the buffer directly.
 * Mirrors the invoice-pdf pipeline for HTML/render/fonts.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { buildStatementHtml, type StatementTxn } from '@/lib/sales/statement-pdf-html'
import { loadPdfFonts, loadPdfAssets } from '@/lib/pdf/pdf-fonts'
import { htmlToPdfBuffer } from '@/lib/pdf/html-to-pdf'

export interface GenerateStatementPdfInput {
  customerId: string
  dateFrom:   string | null
  dateTo:     string | null
}

export interface GenerateStatementPdfResult {
  buffer:       Buffer
  filename:     string
  customerName: string
  bytes:        number
}

type RpcRow = {
  txn_date:    string
  txn_type:    'invoice' | 'payment' | 'credit_note'
  reference:   string
  description: string
  debit:       number
  credit:      number
}

function sanitizeFilename(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, '_')
}

export async function generateStatementPdf(
  input: GenerateStatementPdfInput,
  supabase: SupabaseClient,
): Promise<GenerateStatementPdfResult> {

  // ── 1. Fetch customer + statement rows ───────────────────────────────
  const [{ data: customer, error: custErr }, { data: statementRows, error: rpcErr }, openingRes] =
    await Promise.all([
      supabase.from('customers').select('name').eq('id', input.customerId).single(),
      supabase.rpc('rpc_customer_statement', {
        p_customer_id: input.customerId,
        p_date_from:   input.dateFrom || null,
        p_date_to:     input.dateTo   || null,
      }),
      // Opening balance = all transactions BEFORE date_from
      input.dateFrom
        ? supabase.rpc('rpc_customer_statement', {
            p_customer_id: input.customerId,
            p_date_from:   null,
            p_date_to:     new Date(new Date(input.dateFrom).getTime() - 86_400_000)
                              .toISOString().slice(0, 10),
          })
        : Promise.resolve({ data: [] as RpcRow[], error: null }),
    ])

  if (custErr || !customer) {
    throw new Error(`Customer not found: ${input.customerId} (${custErr?.message ?? 'no row'})`)
  }
  if (rpcErr) {
    throw new Error(`Statement RPC failed: ${rpcErr.message}`)
  }
  if (openingRes.error) {
    throw new Error(`Opening balance RPC failed: ${openingRes.error.message}`)
  }

  const rows: RpcRow[] = (statementRows ?? []) as RpcRow[]
  const openingRows: RpcRow[] = (openingRes.data ?? []) as RpcRow[]
  const openingBalance = openingRows.reduce((s, r) => s + Number(r.debit) - Number(r.credit), 0)

  // ── 2. Compute running balance ───────────────────────────────────────
  let balance = openingBalance
  const transactions: StatementTxn[] = rows.map((r) => {
    balance += Number(r.debit) - Number(r.credit)
    return {
      txn_date:    r.txn_date,
      txn_type:    r.txn_type,
      reference:   r.reference,
      description: r.description,
      debit:       Number(r.debit),
      credit:      Number(r.credit),
      balance,
    }
  })

  const totalDebit  = transactions.reduce((s, t) => s + t.debit, 0)
  const totalCredit = transactions.reduce((s, t) => s + t.credit, 0)
  const closingBalance = openingBalance + totalDebit - totalCredit

  // ── 3. HTML + PDF ────────────────────────────────────────────────────
  const [assets, fonts] = await Promise.all([loadPdfAssets(), loadPdfFonts()])

  const html = buildStatementHtml({
    customer_name:   customer.name ?? '',
    date_from:       input.dateFrom,
    date_to:         input.dateTo,
    generated_at:    new Date().toISOString(),
    transactions,
    opening_balance: openingBalance,
    total_debit:     totalDebit,
    total_credit:    totalCredit,
    closing_balance: closingBalance,
    assets,
    fonts,
  })

  const buffer = await htmlToPdfBuffer(html)

  const rangeSlug = [input.dateFrom, input.dateTo].filter(Boolean).join('_to_')
  const filename = `Statement_${sanitizeFilename(customer.name ?? 'customer')}${rangeSlug ? `_${rangeSlug}` : ''}.pdf`

  return {
    buffer,
    filename,
    customerName: customer.name ?? '',
    bytes: buffer.length,
  }
}
