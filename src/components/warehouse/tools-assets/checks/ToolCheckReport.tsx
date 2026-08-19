'use client'

import { ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useCheckReport, type CheckReportRow } from '@/hooks/useToolChecks'
import { ReportExportMenu } from '@/components/reports/ReportExportMenu'
import { type ReportColumn } from '@/lib/reports/reportColumns'
import { ToolLifecycleBadge } from '../ToolBadges'

const TYPE_LABEL: Record<string, string> = { new: 'New', used: 'Used', repaired: 'Repaired' }

// One definition drives the on-screen table + the server-side Excel/PDF export.
const REPORT_COLUMNS: ReportColumn<CheckReportRow>[] = [
  { header: 'Item',      accessor: (r) => r.item_name ?? '—', wrap: true },
  { header: 'Serial No', accessor: (r) => r.serial_number ?? '—' },
  { header: 'Type',      accessor: (r) => TYPE_LABEL[r.lifecycle_type] ?? r.lifecycle_type },
  { header: 'Condition', accessor: (r) => r.condition },
  { header: 'Inspected', accessor: (r) => new Date(r.inspected_at).toLocaleDateString() },
]

/** Completed check session: the checked-units report (item, serial, type, condition, date). */
export function ToolCheckReport({ sessionId, divisionName, onNew }: { sessionId: string; divisionName: string | null; onNew: () => void }) {
  const { data: rows = [], isLoading } = useCheckReport(sessionId)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <ClipboardCheck className="h-5 w-5 text-emerald-600 shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold text-sm truncate">Check complete — {divisionName ?? 'division'}</div>
            <div className="text-[11px] text-muted-foreground">{rows.length} tool{rows.length === 1 ? '' : 's'} checked</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ReportExportMenu
            filename={`Tool Check ${divisionName ?? ''}`.trim()}
            title={`Monthly Tool Check${divisionName ? ` — ${divisionName}` : ''}`}
            subtitle={rows[0] ? `Checked ${new Date(rows[0].session_initiated_at).toLocaleDateString()}` : undefined}
            columns={REPORT_COLUMNS}
            rows={rows}
            disabled={rows.length === 0}
          />
          <Button variant="outline" size="sm" className="h-9" onClick={onNew}>Start new check</Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No tools were checked in this session.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="p-2 font-medium">Item</th>
                <th className="p-2 font-medium">Serial No</th>
                <th className="p-2 font-medium">Type</th>
                <th className="p-2 font-medium">Condition</th>
                <th className="p-2 font-medium hidden sm:table-cell">Inspected</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.serial_number ?? 'x'}-${i}`} className="border-b last:border-0">
                  <td className="p-2 min-w-0"><span className="block truncate" title={r.item_name ?? undefined}>{r.item_name ?? '—'}</span></td>
                  <td className="p-2 font-mono text-xs">{r.serial_number ?? '—'}</td>
                  <td className="p-2"><ToolLifecycleBadge type={r.lifecycle_type} /></td>
                  <td className="p-2">{r.condition}</td>
                  <td className="p-2 hidden sm:table-cell whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(r.inspected_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
