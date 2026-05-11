// src/app/(dashboard)/quotations/page.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Search, X, ChevronDown, ChevronUp } from 'lucide-react'
import { QuotationListCard } from '@/components/quotations/QuotationListCard'
import { QuotationDetailSheet } from '@/components/quotations/QuotationDetailSheet'
import { useQuotations, useQuotationCounts } from '@/hooks/useQuotations'
import { cn } from '@/lib/utils'
import type { QuotationsFilter, QuotationStatus } from '@/types/quotations'

const ALL_STATUSES: { value: QuotationStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent',  label: 'Sent'  },
]

interface SearchState {
  statuses: QuotationStatus[]
  dateFrom: string
  dateTo: string
  customerPhone: string
  quotationNumber: string
}

const EMPTY: SearchState = {
  statuses: [],
  dateFrom: '',
  dateTo: '',
  customerPhone: '',
  quotationNumber: '',
}

function toFilter(s: SearchState): QuotationsFilter {
  return {
    ...(s.statuses.length     && { statuses: s.statuses }),
    ...(s.dateFrom            && { dateFrom: s.dateFrom }),
    ...(s.dateTo              && { dateTo: s.dateTo }),
    ...(s.customerPhone       && { customerPhone: s.customerPhone }),
    ...(s.quotationNumber     && { quotationNumber: s.quotationNumber }),
  }
}

export default function QuotationsPage() {
  const router = useRouter()
  const [filter, setFilter] = useState<QuotationsFilter>({})
  const [search, setSearch] = useState<SearchState>(EMPTY)
  const [searchOpen, setSearchOpen] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: quotations = [], isLoading } = useQuotations(filter)
  const { data: counts } = useQuotationCounts()

  function toggleStatus(val: QuotationStatus) {
    setSearch((s) => ({
      ...s,
      statuses: s.statuses.includes(val)
        ? s.statuses.filter((v) => v !== val)
        : [...s.statuses, val],
    }))
  }

  const BADGES = [
    { label: 'All Quotations', count: counts?.all,   onClick: () => { setSearch(EMPTY); setFilter({}) } },
    { label: 'Drafts',         count: counts?.draft, onClick: () => { const s = { ...EMPTY, statuses: ['draft' as QuotationStatus] }; setSearch(s); setFilter(toFilter(s)) } },
    { label: 'Sent',           count: counts?.sent,  onClick: () => { const s = { ...EMPTY, statuses: ['sent'  as QuotationStatus] }; setSearch(s); setFilter(toFilter(s)) } },
  ]

  return (
    <div className="flex h-full flex-col">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <h1 className="text-2xl font-bold text-slate-900">Quotations</h1>
        <Button className="gap-2" onClick={() => router.push('/quotations/create')}>
          <Plus className="h-4 w-4" /> New Quotation
        </Button>
      </div>

      {/* ── Search panel ── */}
      <div className="border-b bg-slate-50">
        <button
          onClick={() => setSearchOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-6 py-3 text-sm font-semibold text-slate-700 hover:text-slate-900"
        >
          <Search className="h-4 w-4 text-slate-400" />
          <span>Search</span>
          {searchOpen
            ? <ChevronUp className="ml-auto h-4 w-4 text-slate-400" />
            : <ChevronDown className="ml-auto h-4 w-4 text-slate-400" />}
        </button>

        {searchOpen && (
          <div className="px-6 pb-5 space-y-4">

            {/* Count badges */}
            <div className="flex flex-wrap gap-2">
              {BADGES.map((b) => (
                <button
                  key={b.label}
                  onClick={b.onClick}
                  className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:border-orange-400 hover:text-orange-600"
                >
                  {b.label}
                  {b.count !== undefined && (
                    <span className="rounded bg-orange-500 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                      {b.count.toLocaleString()}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Status chips */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Status
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_STATUSES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => toggleStatus(s.value)}
                    className={cn(
                      'flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                      search.statuses.includes(s.value)
                        ? 'border-orange-500 bg-orange-500 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                    )}
                  >
                    {s.label}
                    {search.statuses.includes(s.value) && <X className="h-3 w-3" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Date + text filters */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  From Date
                </Label>
                <Input
                  type="date"
                  className="h-9 text-sm cursor-pointer"
                  value={search.dateFrom}
                  onClick={(e) => { try { (e.target as HTMLInputElement).showPicker() } catch {} }}
                  onChange={(e) => setSearch((s) => ({ ...s, dateFrom: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  To Date
                </Label>
                <Input
                  type="date"
                  className="h-9 text-sm cursor-pointer"
                  value={search.dateTo}
                  onClick={(e) => { try { (e.target as HTMLInputElement).showPicker() } catch {} }}
                  onChange={(e) => setSearch((s) => ({ ...s, dateTo: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Customer Phone
                </Label>
                <Input
                  placeholder="Search phone…"
                  className="h-9 text-sm"
                  value={search.customerPhone}
                  onChange={(e) => setSearch((s) => ({ ...s, customerPhone: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Quotation No
                </Label>
                <Input
                  placeholder="Q/2026/05/…"
                  className="h-9 text-sm"
                  value={search.quotationNumber}
                  onChange={(e) => setSearch((s) => ({ ...s, quotationNumber: e.target.value }))}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-9"
                onClick={() => { setSearch(EMPTY); setFilter({}) }}
              >
                <X className="h-3.5 w-3.5" /> Clear Search
              </Button>
              <Button
                size="sm"
                className="gap-1.5 h-9"
                onClick={() => setFilter(toFilter(search))}
              >
                <Search className="h-3.5 w-3.5" /> Search
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Card grid ── */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {isLoading ? (
          <p className="py-12 text-center text-sm text-slate-400">Loading…</p>
        ) : quotations.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">
            No quotations found
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {quotations.map((q) => (
              <QuotationListCard
                key={q.id}
                quotation={q}
                onClick={() => setSelectedId(q.id)}
              />
            ))}
          </div>
        )}
      </div>

      <QuotationDetailSheet
        quotationId={selectedId}
        open={!!selectedId}
        onOpenChange={(v) => { if (!v) setSelectedId(null) }}
      />
    </div>
  )
}
