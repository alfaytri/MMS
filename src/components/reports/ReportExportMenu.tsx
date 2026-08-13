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
  const [pdfPending, setPdfPending] = useState(false)

  async function doExcel() {
    try {
      await exportReportToExcel<T>(exportOpts)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Excel export failed')
    }
  }

  async function doPdf() {
    setPdfPending(true)
    try {
      await exportReportToPdf<T>(exportOpts)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'PDF export failed')
    } finally {
      setPdfPending(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled || pdfPending}
        className={buttonVariants({ size: 'sm', className: 'gap-1.5 min-h-11 md:min-h-0' })}
      >
        {pdfPending
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <FileSpreadsheet className="h-3.5 w-3.5" />}
        Export
        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={doExcel} className="gap-2">
          <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={doPdf} className="gap-2">
          <FileText className="h-3.5 w-3.5" /> PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
