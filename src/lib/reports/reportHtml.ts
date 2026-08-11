/**
 * Self-contained HTML for a report PDF. Mirrors the styled Excel export (slate
 * header band, zebra rows, per-group bands, subtotal + grand-total bands) so the
 * app's Excel and PDF output read as one document. The client formats every cell
 * to a string and sends this structured payload; the route renders it to PDF via
 * htmlToPdfBuffer. No external CSS/fonts/images — safe for the offline Chromium.
 */

export type ReportPdfColumn = { header: string; align: 'left' | 'right' | 'center' }
export type ReportPdfRow = { kind: 'group' | 'data' | 'subtotal' | 'grand'; cells: string[] }

export type ReportPdfPayload = {
  title: string
  subtitle?: string
  generatedAt: string
  columns: ReportPdfColumn[]
  rows: ReportPdfRow[]
  emptyText?: string
}

function esc(s: string): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string
  ))
}

export function buildReportHtml(p: ReportPdfPayload): string {
  const nCols = Math.max(p.columns.length, 1)

  const head = p.columns
    .map((c) => `<th class="al-${c.align}">${esc(c.header)}</th>`)
    .join('')

  const body = p.rows.length === 0
    ? `<tr><td class="empty" colspan="${nCols}">${esc(p.emptyText ?? 'No data for the selected filters.')}</td></tr>`
    : p.rows.map((row) => {
        if (row.kind === 'group') {
          return `<tr class="group"><td colspan="${nCols}">${esc(row.cells[0] ?? '')}</td></tr>`
        }
        const tds = p.columns
          .map((c, i) => `<td class="al-${c.align}">${esc(row.cells[i] ?? '')}</td>`)
          .join('')
        return `<tr class="${row.kind}">${tds}</tr>`
      }).join('')

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4 landscape; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; }
  .title { font-size: 18px; font-weight: 700; color: #0f172a; }
  .subtitle { font-size: 11px; color: #475569; margin-top: 2px; }
  .meta { font-size: 9px; font-style: italic; color: #94a3b8; margin-top: 2px; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th, td { border: 0.5px solid #e2e8f0; padding: 4px 6px; white-space: nowrap; }
  thead th { background: #0f172a; color: #fff; font-weight: 700; }
  thead { display: table-header-group; }
  tbody tr.data:nth-child(even) td { background: #f8fafc; }
  tr.group td { background: #e2e8f0; font-weight: 700; }
  tr.subtotal td { background: #f1f5f9; font-weight: 700; border-top: 1px solid #475569; }
  tr.grand td { background: #334155; color: #fff; font-weight: 700; border-top: 1px solid #475569; }
  td.empty { text-align: center; color: #94a3b8; font-style: italic; padding: 24px; }
  .al-left { text-align: left; } .al-right { text-align: right; } .al-center { text-align: center; }
  tr { page-break-inside: avoid; }
  </style></head><body>
  <div class="title">${esc(p.title)}</div>
  ${p.subtitle ? `<div class="subtitle">${esc(p.subtitle)}</div>` : ''}
  <div class="meta">Generated ${esc(p.generatedAt)}</div>
  <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
  </body></html>`
}
