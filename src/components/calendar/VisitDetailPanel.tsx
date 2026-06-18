'use client'

import {
  X, User, Phone, Clock, Users, ExternalLink, RefreshCw, ClipboardList,
  CheckCircle2, Circle, FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getVisitTypeConfig } from './VisitBlock'
import { useVisitPaymentStatus } from '@/hooks/useVisitPaymentStatus'
import type { CalendarVisit } from '@/hooks/useCalendarVisits'

interface VisitDetailPanelProps {
  visit: CalendarVisit | null
  teamName: string | null
  canEdit: boolean
  canSwap: boolean
  onEdit: (visit: CalendarVisit) => void
  onSwap: (visit: CalendarVisit) => void
  onClose: () => void
}

function fmt12(t: string): string {
  const [hStr, mStr] = t.split(':')
  const h = parseInt(hStr)
  const m = mStr ?? '00'
  const period = h < 12 ? 'AM' : 'PM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${m} ${period}`
}

function Row({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <Icon className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
      <span className="text-foreground">{children}</span>
    </div>
  )
}

function parseServices(summary: string | null): string[] {
  if (!summary) return []
  // services_summary is "2× Cleaning [Full AC], 1× Pump check" — split on ", " not inside brackets
  const out: string[] = []
  let depth = 0
  let buf = ''
  for (const ch of summary) {
    if (ch === '[' || ch === '(') depth++
    else if (ch === ']' || ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      const s = buf.trim()
      if (s) out.push(s)
      buf = ''
    } else {
      buf += ch
    }
  }
  const tail = buf.trim()
  if (tail) out.push(tail)
  return out
}

function kindLabel(visit: CalendarVisit): string {
  if (visit.source_type === 'site_visit') return 'Site Visit'
  if (visit.source_type === 'contract_visit') return 'Contract Visit'
  if (visit.source_type === 'follow_up_request') return 'Follow-up Request'
  return 'Order'
}

export function VisitDetailPanel({
  visit,
  teamName,
  canEdit,
  canSwap,
  onEdit,
  onSwap,
  onClose,
}: VisitDetailPanelProps) {
  const isCompleted = visit?.status === 'completed'
  const payment = useVisitPaymentStatus(visit?.id ?? null, !!visit && isCompleted)

  if (!visit) return null

  const cfg = getVisitTypeConfig(visit.visit_type)
  const Icon = cfg.icon

  const timeLabel = visit.start_time && visit.end_time
    ? `${fmt12(visit.start_time.substring(0, 5))} – ${fmt12(visit.end_time.substring(0, 5))}`
    : visit.start_time
    ? fmt12(visit.start_time.substring(0, 5))
    : '—'

  const services = parseServices(visit.services_summary)
  const paymentInfo = payment.data
  const showPayment = isCompleted && paymentInfo

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-80 bg-background shadow-2xl border-l flex flex-col">
        {/* Coloured header */}
        <div className={cn('flex items-center justify-between px-4 py-3 text-white', cfg.color)}>
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 opacity-90" />
            <span className="text-sm font-semibold">{cfg.label}</span>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center h-7 w-7 rounded-full hover:bg-white/20 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Order/visit number */}
          {visit.order_number && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {kindLabel(visit)}
              </p>
              <p className="font-mono font-bold text-2xl text-foreground leading-tight tracking-tight">
                {visit.order_number}
              </p>
            </div>
          )}

          {/* Status + payment row */}
          <div className="flex flex-wrap gap-1.5">
            <span className={cn(
              'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold capitalize',
              isCompleted ? 'border-green-300 bg-green-50 text-green-800' : 'border-foreground/15 text-foreground',
            )}>
              {visit.status}
            </span>

            {showPayment && paymentInfo.status === 'paid' && (
              <span className="inline-flex items-center gap-1 rounded-full border border-green-300 bg-green-50 px-3 py-1 text-xs font-semibold text-green-800">
                <CheckCircle2 className="h-3 w-3" />
                Paid
                {paymentInfo.payment_method && (
                  <span className="font-normal text-green-700">· {paymentInfo.payment_method}</span>
                )}
              </span>
            )}
            {showPayment && paymentInfo.status === 'unpaid' && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                <Circle className="h-3 w-3" />
                Unpaid
                {paymentInfo.payment_method && (
                  <span className="font-normal text-amber-700">· {paymentInfo.payment_method}</span>
                )}
              </span>
            )}
            {showPayment && paymentInfo.status === 'unknown' && (
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                <Circle className="h-3 w-3" />
                Not invoiced
              </span>
            )}
          </div>

          {/* Invoice number + total — only if paid/unpaid */}
          {showPayment && paymentInfo.invoice_number && (
            <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-xs">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-mono font-semibold">{paymentInfo.invoice_number}</span>
              {paymentInfo.total_amount != null && (
                <span className="ml-auto font-semibold">{paymentInfo.total_amount} QAR</span>
              )}
            </div>
          )}

          {/* Detail rows */}
          <div className="space-y-3 bg-muted/40 rounded-xl px-4 py-4">
            {visit.customer_name && <Row icon={User}>{visit.customer_name}</Row>}
            {visit.customer_phone && <Row icon={Phone}>{visit.customer_phone}</Row>}
            <Row icon={Clock}>{timeLabel}</Row>
            {teamName && <Row icon={Users}>{teamName}</Row>}
          </div>

          {/* Services */}
          {services.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                Services
              </p>
              <ul className="space-y-1.5">
                {services.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
                    <ClipboardList className="h-3.5 w-3.5 shrink-0 mt-1 text-muted-foreground" />
                    <span className="text-foreground">{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer actions */}
        {(canEdit || canSwap) && (
          <div className="border-t p-4 space-y-2">
            {canEdit && (
              <Button
                className="w-full gap-2 h-10"
                onClick={() => { onEdit(visit); onClose() }}
              >
                <ExternalLink className="h-4 w-4" />
                Edit Order
              </Button>
            )}
            {canSwap && visit.source_type === 'order' && (
              <Button
                variant="outline"
                className="w-full gap-2 h-10"
                onClick={() => { onSwap(visit); onClose() }}
              >
                <RefreshCw className="h-4 w-4" />
                Swap Team
              </Button>
            )}
          </div>
        )}
      </div>
    </>
  )
}
