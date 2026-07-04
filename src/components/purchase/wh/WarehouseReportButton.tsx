'use client'

import { useState } from 'react'
import { FileDown, Loader2, ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

const STOCK_REPORTS = new Set(['stock-overview', 'stock-value'])

type Period = 'all' | 'this-month' | 'last-month' | 'last-3-months' | 'last-6-months'

interface Props {
  reportType: string
  warehouseId?: string
  label?: string
  className?: string
}

export function WarehouseReportButton({ reportType, warehouseId, label, className }: Props) {
  const [loading, setLoading] = useState(false)
  const isStockReport = STOCK_REPORTS.has(reportType)

  async function handleDownload(period: Period) {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        toast.error('Please sign in to download reports')
        return
      }

      const payload: Record<string, unknown> = { type: reportType }
      if (warehouseId) payload.warehouseId = warehouseId
      if (period !== 'all') payload.period = period

      const res = await fetch('/api/warehouse/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Download failed' }))
        toast.error(err.error ?? 'Failed to generate report')
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${reportType}-report-${new Date().toISOString().slice(0, 10)}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Report downloaded')
    } catch {
      toast.error('Failed to generate report')
    } finally {
      setLoading(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`inline-flex items-center justify-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 cursor-pointer ${className ?? ''}`}
        disabled={loading}
      >
        {loading
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <FileDown className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">{label ?? 'Report'}</span>
        <span className="sm:hidden">PDF</span>
        <ChevronDown className="h-3 w-3 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => handleDownload('all')} className="text-xs gap-2">
          <FileDown className="h-3.5 w-3.5" />
          All Records
        </DropdownMenuItem>
        {!isStockReport && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleDownload('this-month')} className="text-xs gap-2">
              This Month
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDownload('last-month')} className="text-xs gap-2">
              Last Month
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDownload('last-3-months')} className="text-xs gap-2">
              Last 3 Months
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDownload('last-6-months')} className="text-xs gap-2">
              Last 6 Months
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
