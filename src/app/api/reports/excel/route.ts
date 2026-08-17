/**
 * POST /api/reports/excel
 * Renders a generic report (structured payload from the client) to a downloadable
 * .xlsx. The client already holds the division-scoped, formatted rows — it sends
 * them here so we don't re-run every report RPC server-side, and so ExcelJS (a
 * ~1 MB CommonJS lib that does not chunk reliably in the browser) stays out of
 * the client bundle. Gated on reports.view (same as the report pages + the PDF
 * route).
 */
import { type NextRequest, NextResponse } from 'next/server'
import { requireReportsPermission } from '@/lib/reports/reports-auth'
import { buildReportWorkbookBuffer } from '@/lib/reports/reportExcelServer'
import type { ReportExcelPayload } from '@/lib/reports/reportExcelTypes'

export const runtime = 'nodejs'
export const maxDuration = 30

function fileSlug(name: string): string {
  return (name || 'report').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'report'
}

export async function POST(req: NextRequest) {
  const auth = await requireReportsPermission(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = (await req.json().catch(() => null)) as ReportExcelPayload | null
  if (!body || typeof body.title !== 'string' || !Array.isArray(body.columns)) {
    return NextResponse.json({ error: 'Invalid report payload' }, { status: 400 })
  }

  try {
    const buf = await buildReportWorkbookBuffer(body)
    const filename = `${fileSlug(body.filename || body.title)}.xlsx`
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buf.length),
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[reports-excel]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
