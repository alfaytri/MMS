'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { FileSpreadsheet, FileText, ChevronDown, Loader2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { exportReportToExcel } from '@/lib/reports/reportExcel'
import { exportReportToPdf } from '@/lib/reports/reportPdf'
import { type ReportColumn } from '@/lib/reports/reportColumns'

/**
 * Export ▾ menu for a report page — one definition drives both Excel (client)
 * and PDF (server-rendered from the same formatted rows). Pass the same opts a
 * page would pass to exportReportToExcel.
 */
export function ReportExportMenu<T>(opts: {
  filename: string
  title: string
  subtitle?: string
  columns: ReportColumn<T>[]
  rows: T[]
  groupBy?: (row: T) => string
  grandTotalLabel?: string
  disabled?: boolean
}) {
  const { disabled, ...exportOpts } = opts
  // One shared busy flag for both formats — Excel previously had NO pending
  // state or feedback at all, so a silent background download read as "nothing
  // happened". Now every click shows an instant toast + a trigger spinner, and
  // resolves to a success/error toast so the outcome is always visible.
  const [busy, setBusy] = useState<null | 'excel' | 'pdf'>(null)

  async function run(kind: 'excel' | 'pdf') {
    if (busy) return
    const label = kind === 'excel' ? 'Excel' : 'PDF'
    setBusy(kind)
    const toastId = toast.loading(`Preparing ${label}…`)
    try {
      if (kind === 'excel') await exportReportToExcel<T>(exportOpts)
      else await exportReportToPdf<T>(exportOpts)
      toast.success(`${label} downloaded`, { id: toastId })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${label} export failed`, { id: toastId })
    } finally {
      setBusy(null)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled || busy !== null}
        className={buttonVariants({ size: 'sm', className: 'gap-1.5 min-h-11 md:min-h-0' })}
      >
        {busy
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <FileSpreadsheet className="h-3.5 w-3.5" />}
        Export
        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => run('excel')} className="gap-2">
          <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run('pdf')} className="gap-2">
          <FileText className="h-3.5 w-3.5" /> PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
