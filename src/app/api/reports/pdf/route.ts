/**
 * POST /api/reports/pdf
 * Renders a generic report (structured payload from the client) to a downloadable
 * PDF. The client already holds the division-scoped, formatted rows — it sends
 * them here so we don't re-run every report RPC server-side. Gated on the
 * reports.view permission (same as the report pages).
 */
import { type NextRequest, NextResponse } from 'next/server'
import { htmlToPdfBuffer } from '@/lib/pdf/html-to-pdf'
import { buildReportHtml, type ReportPdfPayload } from '@/lib/reports/reportHtml'
import { requireReportsPermission } from '@/lib/reports/reports-auth'
import { fileSlug } from '@/lib/reports/fileSlug'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const auth = await requireReportsPermission(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = (await req.json().catch(() => null)) as ReportPdfPayload | null
  if (!body || typeof body.title !== 'string' || !Array.isArray(body.columns) || !Array.isArray(body.rows)) {
    return NextResponse.json({ error: 'Invalid report payload' }, { status: 400 })
  }

  try {
    const html = buildReportHtml(body)
    const pdf = await htmlToPdfBuffer(html, { landscape: true })
    const filename = `${fileSlug(body.title)}-${new Date().toISOString().slice(0, 10)}.pdf`
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdf.length),
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[reports-pdf]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
