'use client'

import { useState } from 'react'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { FileDown, Loader2, CalendarIcon } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

const STOCK_REPORTS = new Set(['stock-overview', 'stock-value'])

interface Props {
  reportType: string
  warehouseId?: string
  label?: string
  className?: string
}

export function WarehouseReportButton({ reportType, warehouseId, label, className }: Props) {
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [fromDate, setFromDate] = useState<Date | undefined>(undefined)
  const [toDate, setToDate] = useState<Date | undefined>(undefined)
  const [calendarTarget, setCalendarTarget] = useState<'from' | 'to' | null>(null)
  const isStockReport = STOCK_REPORTS.has(reportType)

  function applyPreset(months: number) {
    const now = new Date()
    if (months === 0) {
      setFromDate(startOfMonth(now))
      setToDate(endOfMonth(now))
    } else {
      setFromDate(startOfMonth(subMonths(now, months)))
      setToDate(endOfMonth(now))
    }
    setCalendarTarget(null)
  }

  async function handleDownload() {
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
      if (fromDate) payload.fromDate = format(fromDate, 'yyyy-MM-dd')
      if (toDate) payload.toDate = format(toDate, 'yyyy-MM-dd')

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
      setOpen(false)
    } catch {
      toast.error('Failed to generate report')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setCalendarTarget(null) }}>
      <PopoverTrigger
        className={`inline-flex items-center justify-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 cursor-pointer ${className ?? ''}`}
        disabled={loading}
      >
        {loading
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <FileDown className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">{label ?? 'Report'}</span>
        <span className="sm:hidden">PDF</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0" sideOffset={4}>
        {calendarTarget ? (
          <div>
            <div className="flex items-center justify-between px-3 pt-3 pb-1">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setCalendarTarget(null)}
              >
                &larr; Back
              </button>
              <span className="text-xs font-medium text-muted-foreground">
                {calendarTarget === 'from' ? 'Start date' : 'End date'}
              </span>
            </div>
            <Calendar
              mode="single"
              selected={calendarTarget === 'from' ? fromDate : toDate}
              onSelect={(d) => {
                if (calendarTarget === 'from') setFromDate(d ?? undefined)
                else setToDate(d ?? undefined)
                setCalendarTarget(null)
              }}
              defaultMonth={calendarTarget === 'from' ? fromDate : toDate}
              autoFocus
            />
          </div>
        ) : (
          <div className="p-3 space-y-3">
            <p className="text-sm font-medium">Download Report</p>

            {!isStockReport && (
              <>
                {/* Quick presets */}
                <div className="flex flex-wrap gap-1.5">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => applyPreset(0)}>
                    This Month
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => applyPreset(1)}>
                    Last 2 Months
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => applyPreset(3)}>
                    Last 3 Months
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => applyPreset(6)}>
                    Last 6 Months
                  </Button>
                </div>

                {/* Date range – click to swap to calendar view */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">From</Label>
                    <div
                      role="button"
                      tabIndex={0}
                      className="flex items-center w-full h-8 px-2 text-xs rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
                      onClick={() => setCalendarTarget('from')}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setCalendarTarget('from') }}
                    >
                      <CalendarIcon className="mr-1.5 h-3.5 w-3.5 opacity-50 shrink-0" />
                      {fromDate ? (
                        <span>{format(fromDate, 'dd MMM yyyy')}</span>
                      ) : (
                        <span className="text-muted-foreground">Start date</span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">To</Label>
                    <div
                      role="button"
                      tabIndex={0}
                      className="flex items-center w-full h-8 px-2 text-xs rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
                      onClick={() => setCalendarTarget('to')}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setCalendarTarget('to') }}
                    >
                      <CalendarIcon className="mr-1.5 h-3.5 w-3.5 opacity-50 shrink-0" />
                      {toDate ? (
                        <span>{format(toDate, 'dd MMM yyyy')}</span>
                      ) : (
                        <span className="text-muted-foreground">End date</span>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 pt-1">
              {!isStockReport && (fromDate || toDate) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => { setFromDate(undefined); setToDate(undefined) }}
                >
                  Clear dates
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                className="h-8 text-xs ml-auto gap-1.5"
                onClick={handleDownload}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                {!isStockReport && !fromDate && !toDate ? 'Download All' : 'Download PDF'}
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
