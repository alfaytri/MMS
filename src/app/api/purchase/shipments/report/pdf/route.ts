/**
 * POST /api/purchase/shipments/report/pdf
 * Renders the shipment report (shaped ReportShipment[] sent by the client, which
 * already holds the RLS-scoped data) to a downloadable PDF. Gated on
 * purchase.shipments.view — the same permission as the shipments pages.
 */
import { type NextRequest, NextResponse } from 'next/server'
import { htmlToPdfBuffer } from '@/lib/pdf/html-to-pdf'
import { buildShipmentReportHtml } from '@/lib/shipments/shipment-report-html'
import { requireDocPermission } from '@/lib/api/require-doc-permission'
import type { ReportShipment } from '@/lib/shipments/report'

// Forecast rows the client sends alongside shipments for the report's forecast sections.
type ForecastRow = {
  forecast_number: string; item_name: string | null; qty: number; supplier_name: string | null
  engagement: string; currency: string; est_value: number | null
  planned_order_date: string | null; needed_by_date: string | null
}

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const auth = await requireDocPermission(req, 'purchase.shipments.view')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = (await req.json().catch(() => null)) as { shipments?: ReportShipment[]; forecasts?: ForecastRow[]; generatedAt?: string } | null
  if (!body || !Array.isArray(body.shipments)) {
    return NextResponse.json({ error: 'Invalid report payload' }, { status: 400 })
  }

  try {
    const html = buildShipmentReportHtml({ shipments: body.shipments, forecasts: body.forecasts ?? [], generatedAt: body.generatedAt })
    const pdf = await htmlToPdfBuffer(html)
    const filename = `shipment-report-${new Date().toISOString().slice(0, 10)}.pdf`
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
    console.error('[shipment-report-pdf]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
