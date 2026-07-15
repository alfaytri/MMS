'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils/formatters'
import {
  DateRangePicker,
  presetRange,
  type DateRange,
} from '@/components/reports/DateRangePicker'
import { ProductProfitabilityChart } from '@/components/reports/ProductProfitabilityChart'
import { ProductProfitabilityTable } from '@/components/reports/ProductProfitabilityTable'
import { useProductProfitability, useProfitabilityDrilldown } from '@/hooks/useProductProfitability'
import { ProfitabilityDrilldownDialog, type DrilldownMode } from '@/components/reports/ProfitabilityDrilldownDialog'
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, Wallet, Percent,
} from 'lucide-react'

function pctDelta(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : null
  return ((curr - prev) / prev) * 100
}

function KpiCard({
  icon, iconBg, label, value, valueClass, delta, deltaGoodDirection = 'up', delay = 0, onClick,
}: {
  icon: React.ReactNode
  iconBg: string
  label: string
  value: string
  valueClass?: string
  delta: number | null
  deltaGoodDirection?: 'up' | 'down'
  delay?: number
  onClick?: () => void
}) {
  const hasDelta = delta !== null && delta !== 0
  const isGood = delta !== null && (
    deltaGoodDirection === 'up' ? delta > 0 : delta < 0
  )
  return (
    <Card
      className={cn(
        'h-full transition-all animate-in fade-in slide-in-from-bottom-2 fill-mode-both hover:shadow-lg hover:-translate-y-0.5 duration-300',
        onClick && 'cursor-pointer',
      )}
      style={{ animationDelay: `${delay}ms`, animationDuration: '500ms' }}
      onClick={onClick}
    >
      <CardContent className="pt-1 h-full flex flex-col">
        <div className="flex items-start gap-3">
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', iconBg)}>{icon}</div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={cn('text-xl font-bold tabular-nums truncate mt-0.5', valueClass)}>{value}</p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-border/50 min-h-[28px]">
          {hasDelta ? (
            <div className={cn('inline-flex items-center gap-1 text-xs font-medium',
              isGood ? 'text-emerald-600' : 'text-red-600')}>
              {delta! > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              <span>{Math.abs(delta!).toFixed(0)}% vs prev period</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">
              {delta === null ? 'No prev period data' : 'No change vs prev period'}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
      </div>
      <Skeleton className="h-80 w-full rounded-xl" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  )
}

export default function ProductProfitabilityPage() {
  const [range, setRange] = useState<DateRange>(() => presetRange('this-month'))
  const { data, isLoading, error } = useProductProfitability(range.start, range.end)
  const [drilldownMode, setDrilldownMode] = useState<DrilldownMode | null>(null)
  const drilldown = useProfitabilityDrilldown(range.start, range.end, drilldownMode !== null)

  return (
    <PageWrapper>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Product Profitability"
          description="Revenue, COGS and gross profit per product, based on delivered sales"
        />
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {isLoading ? (
        <LoadingSkeleton />
      ) : error ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-1">
            <p className="text-sm font-semibold text-red-700">Failed to load report</p>
            <p className="text-xs text-red-600 mt-1 font-mono break-all">
              {(error as Error)?.message ?? String(error)}
            </p>
          </CardContent>
        </Card>
      ) : !data ? (
        <Card>
          <CardContent className="pt-1">
            <p className="text-sm text-muted-foreground">No data returned for this range.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              delay={0}
              icon={<DollarSign className="h-5 w-5 text-emerald-600" />}
              iconBg="bg-emerald-100"
              label="Revenue"
              value={formatCurrency(data.summary.revenue, 'QAR')}
              valueClass="text-emerald-700"
              delta={pctDelta(data.summary.revenue, data.summary.prev_revenue)}
              deltaGoodDirection="up"
              onClick={() => setDrilldownMode('revenue')}
            />
            <KpiCard
              delay={80}
              icon={<ShoppingCart className="h-5 w-5 text-red-600" />}
              iconBg="bg-red-100"
              label="COGS"
              value={formatCurrency(data.summary.cogs, 'QAR')}
              valueClass="text-red-700"
              delta={pctDelta(data.summary.cogs, data.summary.prev_cogs)}
              deltaGoodDirection="down"
              onClick={() => setDrilldownMode('cogs')}
            />
            <KpiCard
              delay={160}
              icon={<Wallet className="h-5 w-5 text-emerald-600" />}
              iconBg="bg-emerald-100"
              label="Gross Profit"
              value={formatCurrency(data.summary.gross_profit, 'QAR')}
              valueClass={data.summary.gross_profit >= 0 ? 'text-emerald-700' : 'text-red-700'}
              delta={pctDelta(data.summary.gross_profit, data.summary.prev_gross_profit)}
              deltaGoodDirection="up"
              onClick={() => setDrilldownMode('profit')}
            />
            <KpiCard
              delay={240}
              icon={<Percent className="h-5 w-5 text-emerald-600" />}
              iconBg="bg-emerald-100"
              label="Margin %"
              value={data.summary.margin_pct === null ? '—' : `${data.summary.margin_pct.toFixed(2)}%`}
              valueClass={
                data.summary.margin_pct === null ? ''
                  : data.summary.margin_pct >= 0 ? 'text-emerald-700' : 'text-red-700'
              }
              delta={
                data.summary.margin_pct === null || data.summary.prev_margin_pct === null
                  ? null
                  : data.summary.margin_pct - data.summary.prev_margin_pct
              }
              deltaGoodDirection="up"
            />
          </div>

          <Card
            className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both"
            style={{ animationDelay: '320ms', animationDuration: '500ms' }}
          >
            <CardContent className="pt-1">
              <div className="mb-4">
                <h3 className="text-base font-semibold">Top 10 by Gross Profit</h3>
                <p className="text-xs text-muted-foreground">Profit-positive products only</p>
              </div>
              <ProductProfitabilityChart rows={data.products} />
            </CardContent>
          </Card>

          <Card
            className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both"
            style={{ animationDelay: '400ms', animationDuration: '500ms' }}
          >
            <CardContent className="pt-1">
              <div className="mb-3">
                <h3 className="text-base font-semibold">All products</h3>
                <p className="text-xs text-muted-foreground">Sorted by gross profit</p>
              </div>
              <ProductProfitabilityTable rows={data.products} rangeLabel={`${range.start}_to_${range.end}`} />
            </CardContent>
          </Card>
        </>
      )}
      {drilldownMode && (
        <ProfitabilityDrilldownDialog
          open={!!drilldownMode}
          onOpenChange={(open) => { if (!open) setDrilldownMode(null) }}
          mode={drilldownMode}
          data={drilldown.data}
          isLoading={drilldown.isLoading}
          rangeLabel={`${range.start}_to_${range.end}`}
        />
      )}
    </PageWrapper>
  )
}
