'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowLeft, FileDown, ChevronDown, ChevronRight, Plane, Ship, Truck, PenLine } from 'lucide-react'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils/formatters'
import { createClient } from '@/lib/supabase/client'
import { useShipmentReport } from '@/hooks/useShipmentReport'
import { milestones, summarize, forecastsDue, type ReportShipment, type ReportForecast } from '@/lib/shipments/report'
import { usePurchaseForecasts, type Engagement, type PurchaseForecast } from '@/hooks/usePurchaseForecasts'
import type { ShipmentMode, ShipmentStatus } from '@/hooks/useShipments'

const MODE_ICON: Record<ShipmentMode, typeof Plane> = { air: Plane, sea: Ship, land: Truck, manual: PenLine }
const STATUS_META: Record<ShipmentStatus, { label: string; cls: string }> = {
  planned: { label: 'Planned', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  booked: { label: 'Booked', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  in_transit: { label: 'In transit', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  customs: { label: 'Customs', cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  delivered: { label: 'Delivered', cls: 'bg-green-50 text-green-700 border-green-200' },
  delayed: { label: 'Delayed', cls: 'bg-red-50 text-red-700 border-red-200' },
}
const qar = (n: number | null | undefined) => n == null ? '—' : `QAR ${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
const ENGAGEMENT_LABEL: Record<Engagement, string> = {
  not_started: 'Not started', in_discussion: 'In discussion', quotation_received: 'Quotation received',
  negotiating: 'Negotiating', ready_to_order: 'Ready to order', on_hold: 'On hold',
}

export default function ShipmentReportPage() {
  const { data: shipments, isLoading } = useShipmentReport()
  const [status, setStatus] = useState<string>('all')
  const [delayedOnly, setDelayedOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const all = useMemo(() => shipments ?? [], [shipments])
  const kpis = useMemo(() => summarize(all), [all])
  const { data: openForecasts = [] } = usePurchaseForecasts({ status: 'open' })
  const dueForecasts = useMemo(() => forecastsDue(openForecasts), [openForecasts])

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    return all.filter((s) =>
      (status === 'all' || s.status === status) &&
      (!delayedOnly || (s.status !== 'delivered' && s.delay.isDelayed)) &&
      (!q ||
        s.shipment_number.toLowerCase().includes(q) ||
        (s.carrier ?? '').toLowerCase().includes(q) ||
        s.pos.some((p) => p.po_number.toLowerCase().includes(q) || (p.supplier_name ?? '').toLowerCase().includes(q) ||
          p.items.some((it) => it.name.toLowerCase().includes(q)))),
    )
  }, [all, status, delayedOnly, search])

  async function savePdf() {
    setSaving(true)
    try {
      const { data: { session } } = await createClient().auth.getSession()
      const res = await fetch('/api/purchase/shipments/report/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ shipments: all, forecasts: openForecasts, generatedAt: new Date().toISOString() }),
      })
      if (!res.ok) { toast.error('Could not generate the PDF'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `shipment-report-${new Date().toISOString().slice(0, 10)}.pdf`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    } catch { toast.error('Could not generate the PDF') } finally { setSaving(false) }
  }

  return (
    <PageWrapper>
      <div className="flex items-center gap-2">
        <Link href="/purchase/shipments"><Button variant="ghost" size="sm" className="gap-1.5"><ArrowLeft className="h-4 w-4" /> Shipments</Button></Link>
      </div>
      <PageHeader title="Shipment Report" description="Procurement &amp; logistics status across all active shipments"
        actions={<Button onClick={savePdf} disabled={saving || isLoading} className="w-full sm:w-auto"><FileDown className="h-4 w-4 mr-1" />{saving ? 'Preparing…' : 'Save PDF'}</Button>} />

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}</div>
      ) : (
        <>
          {/* KPI summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3">
            <Kpi n={kpis.shipments} label="Shipments" />
            <Kpi n={kpis.pos} label="Purchase orders" />
            <Kpi n={kpis.delivered} label="Delivered" tone="ok" />
            <Kpi n={kpis.delayed} label="Delayed / overdue" tone={kpis.delayed > 0 ? 'warn' : undefined} />
            <Kpi text={qar(kpis.valueQar)} label="Total PO value" />
            <Kpi text={qar(kpis.balanceQar)} label="Balance outstanding" tone={kpis.balanceQar > 0 ? 'warn' : undefined} />
            <Kpi n={openForecasts.length} label="Upcoming purchases" />
            <Kpi n={dueForecasts.length} label="To order ≤ 30 days" tone={dueForecasts.length > 0 ? 'warn' : undefined} />
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <Select value={status} onValueChange={(v) => setStatus(v ?? 'all')}>
              <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {(Object.keys(STATUS_META) as ShipmentStatus[]).map((s) => <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>)}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
              <input type="checkbox" checked={delayedOnly} onChange={(e) => setDelayedOnly(e.target.checked)} className="h-4 w-4 rounded border-input" /> Delayed only
            </label>
            <SearchInput value={search} onChange={setSearch} placeholder="Search shipment, PO, supplier, item…" />
            <span className="sm:ml-auto text-xs text-muted-foreground font-mono">{list.length} of {all.length} shown</span>
          </div>

          {/* Cards */}
          {list.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">No shipments match the current filters.</div>
          ) : (
            <div className="space-y-4">{list.map((s) => <ShipmentCard key={s.id} s={s} />)}</div>
          )}

          {/* Forecast sections */}
          <ForecastSections due={dueForecasts} all={openForecasts} />
        </>
      )}
    </PageWrapper>
  )
}

function Kpi({ n, text, label, tone }: { n?: number; text?: string; label: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className="rounded-lg border bg-card p-3.5">
      <div className={cn('font-mono font-bold', text ? 'text-base pt-1' : 'text-2xl', tone === 'ok' && 'text-green-600', tone === 'warn' && 'text-amber-600')}>{text ?? n}</div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mt-0.5">{label}</div>
    </div>
  )
}

function ForecastSections({ due, all }: { due: ReportForecast[]; all: PurchaseForecast[] }) {
  if (all.length === 0) return null
  return (
    <div className="space-y-4 pt-2">
      {due.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50/50 p-4">
          <h3 className="text-sm font-semibold text-amber-800">⚑ For review — {due.length} to order within 30 days</h3>
          <div className="mt-1 divide-y divide-amber-200/60">
            {due.map((f) => (
              <div key={f.forecast_number} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 text-sm">
                <span className="font-mono font-semibold">{f.forecast_number}</span>
                <span className="font-medium">{f.item_name ?? '—'} <span className="text-muted-foreground font-normal">×{f.qty}</span></span>
                {f.supplier_name && <span className="text-muted-foreground">· {f.supplier_name}</span>}
                <span className="ml-auto font-mono text-xs font-semibold text-amber-700">
                  {f.daysToOrder != null && f.daysToOrder < 0 ? `order ${-f.daysToOrder}d overdue` : f.daysToOrder === 0 ? 'order today' : `order in ${f.daysToOrder}d`} · {f.planned_order_date ? formatDate(f.planned_order_date) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <section className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 pt-4 pb-2"><h3 className="text-sm font-semibold">Upcoming purchase forecast <span className="ml-1 text-xs font-normal text-muted-foreground">{all.length} planned</span></h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-[10px] uppercase tracking-wide text-muted-foreground text-left border-b">
              <th className="px-5 py-2 font-medium">Ref</th><th className="py-2 font-medium">Item</th><th className="py-2 font-medium">Supplier</th><th className="py-2 font-medium">Engagement</th><th className="py-2 font-medium text-right">Est. value</th><th className="py-2 font-medium">Planned order</th><th className="px-5 py-2 font-medium">Needed by</th>
            </tr></thead>
            <tbody>
              {all.map((f) => (
                <tr key={f.id} className="border-b last:border-0">
                  <td className="px-5 py-2 font-mono whitespace-nowrap">{f.forecast_number}</td>
                  <td className="py-2">{f.item_name ?? '—'} <span className="text-muted-foreground">×{f.qty}</span></td>
                  <td className="py-2 text-muted-foreground">{f.supplier_name ?? '—'}</td>
                  <td className="py-2">{ENGAGEMENT_LABEL[f.engagement]}</td>
                  <td className="py-2 text-right tabular-nums">{f.est_value == null ? '—' : `${f.currency} ${f.est_value.toLocaleString('en-US')}`}</td>
                  <td className="py-2 tabular-nums whitespace-nowrap">{f.planned_order_date ? formatDate(f.planned_order_date) : '—'}</td>
                  <td className="px-5 py-2 tabular-nums whitespace-nowrap">{f.needed_by_date ? formatDate(f.needed_by_date) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function DelayBadge({ s }: { s: ReportShipment }) {
  if (s.status === 'delivered') return <span className="rounded-md bg-green-50 text-green-700 px-2 py-1 text-xs font-semibold font-mono">✓ received</span>
  if (s.delay.overdueDays > 0) return <span className="rounded-md bg-red-50 text-red-700 px-2 py-1 text-xs font-semibold font-mono">⚠ {s.delay.overdueDays}d past ETA</span>
  if (s.delay.delayDays > 0) return <span className="rounded-md bg-amber-50 text-amber-700 px-2 py-1 text-xs font-semibold font-mono">↻ delayed {s.delay.delayDays}d</span>
  return <span className="rounded-md bg-green-50 text-green-700 px-2 py-1 text-xs font-semibold font-mono">on schedule</span>
}

function ShipmentCard({ s }: { s: ReportShipment }) {
  const Mode = MODE_ICON[s.mode]
  const miles = milestones(s)
  return (
    <section className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center gap-3 px-5 pt-4 pb-2">
        <span className="font-mono text-base font-bold">{s.shipment_number}</span>
        <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', STATUS_META[s.status].cls)}>{STATUS_META[s.status].label}</span>
        {s.location && <span className="text-sm text-muted-foreground">Now at <span className="text-foreground font-medium">{s.location}</span></span>}
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Mode className="h-3.5 w-3.5" /> {s.mode}</span>
        <span className="ml-auto"><DelayBadge s={s} /></span>
      </div>

      {/* Milestone strip */}
      <div className="flex flex-wrap gap-y-2 px-5 py-3">
        {miles.map((m, i) => (
          <div key={i} className="flex-1 min-w-[110px] relative pr-2">
            {i > 0 && <div className={cn('absolute top-[7px] left-0 right-2 h-0.5', m.state === 'done' ? 'bg-primary' : 'bg-border')} />}
            <div className={cn('relative z-10 h-3.5 w-3.5 rounded-full border-2 bg-background mb-1.5',
              m.state === 'done' && 'bg-primary border-primary', m.state === 'flag' && 'bg-amber-500 border-amber-500', m.state === 'pending' && 'border-amber-400')} />
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{m.label}</div>
            <div className={cn('text-xs font-mono font-medium', m.state === 'none' && 'text-muted-foreground font-normal', m.state === 'flag' && 'text-amber-600', m.state === 'pending' && 'text-amber-600 font-normal')}>
              {m.date ? formatDate(m.date) : m.state === 'pending' ? 'pending' : '—'}
            </div>
          </div>
        ))}
      </div>

      {s.delay.isDelayed && s.delayReason && (
        <div className="mx-5 mb-3 rounded-r-md border-l-[3px] border-amber-500 bg-amber-50 px-3 py-2 text-sm text-foreground">
          <span className="font-semibold text-amber-700">Delay reason — {s.delayReason}</span>
        </div>
      )}

      <div className="border-t">
        {s.pos.map((po) => <PoBlock key={po.po_id} po={po} />)}
      </div>
    </section>
  )
}

function PoBlock({ po }: { po: ReportShipment['pos'][number] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b last:border-b-0">
      <div className="grid grid-cols-[1fr_auto] gap-3 px-5 py-3 items-start">
        <div className="min-w-0">
          <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 text-sm">
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <span className="font-mono font-semibold">{po.po_number}</span>
            <span className="text-muted-foreground font-normal">· {po.items.length} item{po.items.length !== 1 ? 's' : ''}</span>
          </button>
          {po.supplier_name && <div className="text-xs text-muted-foreground ml-5">{po.supplier_name}</div>}
          <div className="ml-5 mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground font-mono">
            <span>Requested {po.requested ? formatDate(po.requested) : '—'}</span>
            <span>Approved {po.approved ? formatDate(po.approved) : 'pending'}</span>
          </div>
        </div>
        <div className="text-right text-sm tabular-nums">
          <div className="font-semibold">{qar(po.value_qar)}</div>
          <div className={cn('text-xs font-mono', (po.balance_qar ?? 0) > 0 ? 'text-amber-600' : 'text-green-600')}>
            {po.balance_qar == null ? '' : (po.balance_qar > 0 ? `${qar(po.balance_qar)} due` : 'paid')}
          </div>
        </div>
      </div>
      {open && (
        <div className="px-5 pb-3 pl-10">
          <table className="w-full text-xs">
            <thead><tr className="text-[10px] uppercase tracking-wide text-muted-foreground text-left"><th className="py-1 font-medium">Item</th><th className="py-1 font-medium text-right">Shipped</th><th className="py-1 font-medium text-right">PO qty</th></tr></thead>
            <tbody>
              {po.items.map((it, i) => (
                <tr key={i} className="border-t border-dashed">
                  <td className="py-1">{it.name}{it.sku && <span className="text-muted-foreground font-mono ml-1.5">· {it.sku}</span>}</td>
                  <td className="py-1 text-right tabular-nums">{it.qty}</td>
                  <td className="py-1 text-right tabular-nums text-muted-foreground">{it.po_qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
